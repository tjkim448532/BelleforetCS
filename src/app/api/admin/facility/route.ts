import { NextResponse } from 'next/server';
import { adminDb, verifyAdminSession } from '@/lib/firebase/admin';
import { upsertDocument, deleteDocument } from '@/lib/pinecone';
import { mergeFacilityDescription, standardizeKnowledgeEntry } from '@/lib/gemini';
import { extractRobotSpecsFromText, invalidateFacilityCache } from '@/lib/cs-intelligence';

function needsChatStandardization(name: string, type?: string): boolean {
  const trimmed = (name || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('[상담학습]')) return true;
  if (trimmed.includes('\n')) return true;
  if (/\d{1,2}\s*\/\s*\d{1,2}/.test(trimmed)) return true;
  if (type === 'faq' && trimmed.length > 36) return true;
  return false;
}

const VALID_FACILITY_CATEGORIES = ['레저', '숙박', '식음', '편의', '기타'];

export async function POST(req: Request) {
  try {
    await verifyAdminSession(req);
    const data = await req.json();
    const { name, category, description, seasonalDescription, location, tags, status, type, duplicateAction } = data;

    if (!name || (!description && !seasonalDescription)) {
      return NextResponse.json({ error: 'Name and at least one description are required' }, { status: 400 });
    }

    let finalName = String(name).trim();
    let finalCategory = VALID_FACILITY_CATEGORIES.includes(category) ? category : '기타';
    let finalDescription = description || '';
    let finalSeasonalDescription = seasonalDescription || '';
    let finalTags: string[] = Array.isArray(tags) ? tags : [];

    // [상담학습] 또는 날짜·줄바꿈이 섞인 날것의 고객 질문인 경우 AI로 표준 제목·표준 질문·공식 답변·태그 자동 정제
    if (needsChatStandardization(finalName, type)) {
      const standardized = await standardizeKnowledgeEntry({
        rawTitleOrQuestion: finalName,
        rawAnswerOrDescription: finalDescription,
        currentCategory: category,
      });
      finalName = standardized.standardizedTitle || finalName.replace(/^\[상담학습\]\s*/, '').trim();
      finalDescription = standardized.standardizedDescription || finalDescription;
      if (!VALID_FACILITY_CATEGORIES.includes(category)) {
        finalCategory = standardized.suggestedCategory;
      }
      if (finalTags.length === 0 && standardized.suggestedTags.length > 0) {
        finalTags = standardized.suggestedTags;
      }
    }

    // 이름으로 중복 검사
    const snapshot = await adminDb.collection('facilities').where('name', '==', finalName).limit(1).get();
    let docRef;
    let isUpdate = false;
    let existingData: any = null;

    if (!snapshot.empty) {
      docRef = snapshot.docs[0].ref;
      existingData = snapshot.docs[0].data();
      isUpdate = true;
    } else {
      docRef = adminDb.collection('facilities').doc();
    }

    // 설명(Description) 병합 로직 (CQRS Read Model 업데이트)
    if (isUpdate && existingData) {
      if (duplicateAction === 'overwrite') {
        // 정제된 finalDescription 유지
      } else {
        if (existingData.description) {
          finalDescription = await mergeFacilityDescription(existingData.description, finalDescription);
        }
        if (existingData.seasonalDescription) {
          finalSeasonalDescription = await mergeFacilityDescription(existingData.seasonalDescription, finalSeasonalDescription);
        }
      }
    }

    const robotSpecs = extractRobotSpecsFromText({
      name: finalName,
      category: finalCategory,
      location: location || '',
      description: finalDescription,
      seasonalDescription: finalSeasonalDescription,
    });

    const facilityData: Record<string, unknown> = {
      name: finalName,
      category: finalCategory,
      description: finalDescription,
      seasonalDescription: finalSeasonalDescription,
      location: location || '',
      tags: finalTags,
      status: status || 'pending',
      type: type || 'facility',
      robotSpecs,
      updatedAt: new Date().toISOString(),
    };

    if (!isUpdate) {
      facilityData.createdAt = new Date().toISOString();
    }

    // 1. Write DB에 로그 남기기 (Append-Only Event Store)
    const editLog = {
      facilityId: docRef.id,
      facilityName: finalName,
      action: isUpdate ? 'update' : 'create',
      method: 'POST',
      submittedData: { name, category, description, seasonalDescription, location, tags, status, type },
      mergedDescription: finalDescription,
      mergedSeasonalDescription: finalSeasonalDescription,
      timestamp: new Date().toISOString(),
    };
    await adminDb.collection('facility_edits').add(editLog);

    // 2. Read DB (Golden Record) 갱신
    await docRef.set(facilityData, { merge: true });

    // 바로 활성화(승인) 상태로 요청이 왔다면 벡터화 진행
    if (facilityData.status === 'approved') {
      let textToVectorize = `시설명: ${finalName}\n카테고리: ${facilityData.category}\n위치: ${facilityData.location}\n설명: ${finalDescription}\n`;
      if (finalSeasonalDescription) {
        textToVectorize += `시즌/임시안내: ${finalSeasonalDescription}\n`;
      }
      textToVectorize += `태그: ${(facilityData.tags as string[]).join(', ')}`;
      
      try {
        await upsertDocument({
          id: docRef.id,
          text: textToVectorize,
          metadata: {
            type: (facilityData.type as string) || 'facility',
            name: finalName,
            category: facilityData.category,
          }
        });
      } catch (pineconeError) {
        console.warn('Pinecone sync failed during create:', pineconeError);
        invalidateFacilityCache();
        return NextResponse.json({ success: true, id: docRef.id, facility: facilityData, isUpdate, warning: 'AI search indexing failed' });
      }
    }

    invalidateFacilityCache();
    return NextResponse.json({ success: true, id: docRef.id, facility: facilityData, isUpdate });
  } catch (error: unknown) {
    console.error('Error creating/updating facility:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    await verifyAdminSession(req);
    const snapshot = await adminDb.collection('facilities').orderBy('createdAt', 'desc').get();
    const facilities = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return NextResponse.json({ facilities });
  } catch (error: unknown) {
    console.error('Error fetching facilities:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    await verifyAdminSession(req);
    const data = await req.json();
    const { id, name, category, description, seasonalDescription, location, tags, status, type, duplicateAction } = data;

    if (!id || !name || (!description && !seasonalDescription)) {
      return NextResponse.json({ error: 'ID, Name, and at least one description are required' }, { status: 400 });
    }

    const docRef = adminDb.collection('facilities').doc(id);
    const docSnap = await docRef.get();
    const existingDocData = docSnap.exists ? docSnap.data() : null;
    
    let finalName = String(name).trim();
    let finalCategory = VALID_FACILITY_CATEGORIES.includes(category) ? category : '기타';
    let finalDescription = description || '';
    let finalSeasonalDescription = seasonalDescription || '';
    let finalTags: string[] = Array.isArray(tags) ? tags : [];
    const effectiveType = type || existingDocData?.type || 'facility';

    // [상담학습] 접두사나 날짜/줄바꿈이 남아있는 상태에서 [승인] 또는 [저장]을 누른 경우 AI가 자동으로 표준 제목·질문·답변·태그로 정제
    if (needsChatStandardization(finalName, effectiveType)) {
      const standardized = await standardizeKnowledgeEntry({
        rawTitleOrQuestion: finalName,
        rawAnswerOrDescription: finalDescription,
        currentCategory: category,
      });
      finalName = standardized.standardizedTitle || finalName.replace(/^\[상담학습\]\s*/, '').trim();
      finalDescription = standardized.standardizedDescription || finalDescription;
      if (!VALID_FACILITY_CATEGORIES.includes(category) || category === '기타') {
        finalCategory = standardized.suggestedCategory;
      }
      if (finalTags.length === 0 && standardized.suggestedTags.length > 0) {
        finalTags = standardized.suggestedTags;
      }
    }

    // 명시적으로 duplicateAction === 'merge'를 요청한 경우에만 기존 설명과 AI 병합 수행 (모달 직접 수정 시에는 직원이 수정한 텍스트를 그대로 보존)
    if (docSnap.exists && duplicateAction === 'merge') {
      if (existingDocData && existingDocData.description && existingDocData.description !== finalDescription) {
        finalDescription = await mergeFacilityDescription(existingDocData.description, finalDescription);
      }
      if (existingDocData && existingDocData.seasonalDescription !== undefined && existingDocData.seasonalDescription !== seasonalDescription) {
        finalSeasonalDescription = await mergeFacilityDescription(existingDocData.seasonalDescription, finalSeasonalDescription);
      }
    }

    const robotSpecs = extractRobotSpecsFromText({
      name: finalName,
      category: finalCategory,
      location: location || '',
      description: finalDescription,
      seasonalDescription: finalSeasonalDescription,
    });

    const updatedFacility = {
      name: finalName,
      category: finalCategory,
      description: finalDescription,
      seasonalDescription: finalSeasonalDescription,
      location: location || '',
      tags: finalTags,
      status: status || 'approved',
      type: effectiveType,
      robotSpecs,
      updatedAt: new Date().toISOString(),
    };

    // 1. Write DB에 로그 남기기 (이벤트 소싱)
    const editLog = {
      facilityId: id,
      facilityName: finalName,
      action: 'update',
      method: 'PUT',
      submittedData: { name, category, description, seasonalDescription, location, tags, status, type },
      mergedDescription: finalDescription,
      mergedSeasonalDescription: finalSeasonalDescription,
      timestamp: new Date().toISOString(),
    };
    await adminDb.collection('facility_edits').add(editLog);

    // 2. Read DB (Golden Record) 갱신
    await docRef.update(updatedFacility);

    // Pinecone 벡터 덮어쓰기 (upsert) 또는 비승인/만료 전환 시 벡터 제거
    if (updatedFacility.status === 'approved') {
      let textToVectorize = `시설명: ${finalName}\n카테고리: ${updatedFacility.category}\n위치: ${updatedFacility.location}\n설명: ${finalDescription}\n`;
      if (finalSeasonalDescription) {
        textToVectorize += `시즌/임시안내: ${finalSeasonalDescription}\n`;
      }
      textToVectorize += `태그: ${updatedFacility.tags.join(', ')}`;
      
      try {
        await upsertDocument({
          id: docRef.id,
          text: textToVectorize,
          metadata: {
            type: 'facility',
            name: finalName,
            category: updatedFacility.category,
          }
        });
      } catch (pineconeError) {
        console.warn('Pinecone sync failed during update:', pineconeError);
        invalidateFacilityCache();
        return NextResponse.json({ success: true, id: docRef.id, facility: updatedFacility, warning: 'AI search indexing failed' });
      }
    } else {
      try {
        await deleteDocument(docRef.id);
      } catch (pineconeDeleteErr) {
        console.warn('Pinecone delete failed during non-approved status update:', pineconeDeleteErr);
      }
    }

    invalidateFacilityCache();
    return NextResponse.json({ success: true, id: docRef.id, facility: updatedFacility });
  } catch (error: unknown) {
    console.error('Error updating facility:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await verifyAdminSession(req);
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get('id');
    const idsParam = searchParams.get('ids');

    let idsToDelete: string[] = [];

    if (idsParam) {
      idsToDelete = idsParam.split(',').filter(Boolean);
    } else if (idParam) {
      idsToDelete = [idParam];
    }

    if (idsToDelete.length === 0) {
      return NextResponse.json({ error: 'ID or IDs are required' }, { status: 400 });
    }

    let deletedIds: string[] = [];
    let failedIds: string[] = [];

    // 여러 개 순차 삭제
    for (const id of idsToDelete) {
      try {
        // Firebase 삭제 (성공 시 일단 삭제된 것으로 간주)
        await adminDb.collection('facilities').doc(id).delete();
        deletedIds.push(id);
        
        try {
          // Pinecone 삭제 (실패해도 Firebase에선 지워졌으므로 진행)
          await deleteDocument(id);
        } catch (pineconeErr) {
          console.warn(`Pinecone delete failed for ${id}:`, pineconeErr);
        }
      } catch (err) {
        console.warn(`Firebase delete failed for facility ${id}:`, err);
        failedIds.push(id);
      }
    }

    invalidateFacilityCache();
    return NextResponse.json({ success: true, deletedCount: deletedIds.length, ids: deletedIds, failedIds });
  } catch (error: unknown) {
    console.error('Error deleting facility:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
