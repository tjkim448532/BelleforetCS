import { NextResponse } from 'next/server';
import { adminDb, verifyAdminSession } from '@/lib/firebase/admin';
import { upsertDocument, deleteDocument } from '@/lib/pinecone';
import { mergeFacilityDescription } from '@/lib/gemini';

export async function POST(req: Request) {
  try {
    await verifyAdminSession(req);
    const data = await req.json();
    const { name, category, description, location, tags, status, type, duplicateAction } = data;

    if (!name || !description) {
      return NextResponse.json({ error: 'Name and description are required' }, { status: 400 });
    }

    // 이름으로 중복 검사
    const snapshot = await adminDb.collection('facilities').where('name', '==', name).limit(1).get();
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
    let finalDescription = description;
    if (isUpdate && existingData && existingData.description) {
      if (duplicateAction === 'overwrite') {
        finalDescription = description;
      } else {
        // AI 기반 지능형 병합 로직 호출
        finalDescription = await mergeFacilityDescription(existingData.description, description);
      }
    }

    const facilityData: Record<string, unknown> = {
      name,
      category: category || '기타',
      description: finalDescription,
      location: location || '',
      tags: tags || [],
      status: status || 'pending',
      type: type || 'facility',
      updatedAt: new Date().toISOString(),
    };

    if (!isUpdate) {
      facilityData.createdAt = new Date().toISOString();
    }

    // 1. Write DB에 로그 남기기 (Append-Only Event Store)
    const editLog = {
      facilityId: docRef.id,
      facilityName: name,
      action: isUpdate ? 'update' : 'create',
      method: 'POST',
      submittedData: { name, category, description, location, tags, status, type },
      mergedDescription: finalDescription,
      timestamp: new Date().toISOString(),
    };
    await adminDb.collection('facility_edits').add(editLog);

    // 2. Read DB (Golden Record) 갱신
    await docRef.set(facilityData, { merge: true });

    // 바로 활성화(승인) 상태로 요청이 왔다면 벡터화 진행
    if (facilityData.status === 'approved') {
      const textToVectorize = `시설명: ${name}\n카테고리: ${facilityData.category}\n위치: ${facilityData.location}\n설명: ${finalDescription}\n태그: ${(facilityData.tags as string[]).join(', ')}`;
      
      await upsertDocument({
        id: docRef.id,
        text: textToVectorize,
        metadata: {
          type: (facilityData.type as string) || 'facility',
          name,
          category: facilityData.category,
        }
      });
    }

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
    const { id, name, category, description, location, tags, status, type } = data;

    if (!id || !name || !description) {
      return NextResponse.json({ error: 'ID, Name, and description are required' }, { status: 400 });
    }

    const docRef = adminDb.collection('facilities').doc(id);
    const docSnap = await docRef.get();
    
    let finalDescription = description;

    if (docSnap.exists) {
      const existingData = docSnap.data();
      // 기존 텍스트와 다르고, 빈 값이 아닐 때만 AI 병합 수행 (수동 편집 고려)
      // 편집 창에서 관리자가 완전히 다른 내용을 작성했을 수 있으므로 AI 병합을 거쳐 
      // 기존 유실 방지(주의사항 등)를 보장합니다.
      if (existingData && existingData.description && existingData.description !== description) {
        finalDescription = await mergeFacilityDescription(existingData.description, description);
      }
    }

    const updatedFacility = {
      name,
      category: category || '기타',
      description: finalDescription,
      location: location || '',
      tags: tags || [],
      status: status || 'approved',
      type: type || 'facility',
      updatedAt: new Date().toISOString(),
    };

    // 1. Write DB에 로그 남기기 (이벤트 소싱)
    const editLog = {
      facilityId: id,
      facilityName: name,
      action: 'update',
      method: 'PUT',
      submittedData: { name, category, description, location, tags, status, type },
      mergedDescription: finalDescription,
      timestamp: new Date().toISOString(),
    };
    await adminDb.collection('facility_edits').add(editLog);

    // 2. Read DB (Golden Record) 갱신
    await docRef.update(updatedFacility);

    // Pinecone 벡터 덮어쓰기 (upsert)
    if (updatedFacility.status === 'approved') {
      const textToVectorize = `시설명: ${name}\n카테고리: ${updatedFacility.category}\n위치: ${updatedFacility.location}\n설명: ${description}\n태그: ${updatedFacility.tags.join(', ')}`;
      
      await upsertDocument({
        id: docRef.id,
        text: textToVectorize,
        metadata: {
          type: 'facility',
          name,
          category: updatedFacility.category,
        }
      });
    }

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

    // 여러 개 순차 삭제
    for (const id of idsToDelete) {
      // Firebase 삭제
      await adminDb.collection('facilities').doc(id).delete();
      // Pinecone 삭제
      await deleteDocument(id);
    }

    return NextResponse.json({ success: true, deletedCount: idsToDelete.length, ids: idsToDelete });
  } catch (error: unknown) {
    console.error('Error deleting facility:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
