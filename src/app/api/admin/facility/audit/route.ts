import { NextResponse } from 'next/server';
import { adminDb, verifyAdminSession } from '@/lib/firebase/admin';
import { listAllVectorIds, upsertDocument, deleteDocument } from '@/lib/pinecone';
import { synthesizeMultipleFacilities } from '@/lib/gemini';

const GENERIC_TERMS = new Set(['이벤트', '패키지', 'pkg', '숙박', '레저', '식음', '기타', '할인', '요금', '안내', '운영', '콘도']);

function normalizeName(name: string): string {
  return (name || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim();
}

/**
 * 텍스트 내에서 날짜(YYYY-MM-DD, YYYY.MM.DD, YYYY년 M월 D일)를 추출합니다.
 */
function extractDatesFromText(text: string): string[] {
  if (!text) return [];
  const results: string[] = [];
  const regex = /(202\d)\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const year = match[1];
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    results.push(`${year}-${month}-${day}`);
  }
  return results;
}

export async function GET(req: Request) {
  try {
    await verifyAdminSession(req);

    const [facSnap, noticeSnap, pineconeIds] = await Promise.all([
      adminDb.collection('facilities').get(),
      adminDb.collection('operational_notices').get(),
      listAllVectorIds(),
    ]);

    const allFacilities: Array<Record<string, any>> = facSnap.docs.map(d => ({
      id: d.id,
      ...d.data(),
    }));

    const approvedFacilities = allFacilities.filter(f => f.status === 'approved');
    const expiredFacilitiesCount = allFacilities.filter(f => f.status === 'expired').length;

    // 1. DB ↔ Pinecone 동기화 감사
    const approvedIdMap = new Map(approvedFacilities.map(f => [f.id, f]));
    const pineconeIdSet = new Set(pineconeIds);

    const ghostVectorIds = pineconeIds.filter(id => !approvedIdMap.has(id));
    const missingVectors = approvedFacilities
      .filter(f => !pineconeIdSet.has(f.id))
      .map(f => ({ id: f.id, name: f.name, category: f.category }));

    // 2. 중복 및 파편화 시설 그룹 감지 (Union-Find)
    const n = approvedFacilities.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const union = (i: number, j: number) => {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) parent[rootJ] = rootI;
    };

    for (let i = 0; i < n; i++) {
      const rawA = (approvedFacilities[i].name || '').trim();
      const normA = normalizeName(rawA);
      if (!normA) continue;

      for (let j = i + 1; j < n; j++) {
        const rawB = (approvedFacilities[j].name || '').trim();
        const normB = normalizeName(rawB);
        if (!normB) continue;

        // 완전 동일 또는 공백 제거 시 동일
        if (normA === normB) {
          union(i, j);
          continue;
        }

        // 한쪽이 핵심 마스터 시설명이고 다른 쪽이 파편화된 하위 질문/항목인 경우
        const shorter = normA.length < normB.length ? normA : normB;
        const longer = normA.length < normB.length ? normB : normA;

        if (
          shorter.length >= 2 &&
          !GENERIC_TERMS.has(shorter) &&
          (longer.startsWith(shorter) || longer.includes(shorter))
        ) {
          union(i, j);
        }
      }
    }

    const clusters = new Map<number, Array<Record<string, any>>>();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root)!.push(approvedFacilities[i]);
    }

    const duplicateGroups = Array.from(clusters.values())
      .filter(group => group.length > 1)
      .map(group => {
        // 가장 이름이 깔끔하고 짧은 문서(동률이면 설명이 긴 문서)를 마스터 후보로 선정
        const sorted = [...group].sort((a, b) => {
          const lenDiff = (a.name || '').trim().length - (b.name || '').trim().length;
          if (lenDiff !== 0) return lenDiff;
          return (b.description || '').length - (a.description || '').length;
        });
        const master = sorted[0];
        return {
          masterId: master.id,
          masterName: (master.name || '').trim(),
          category: master.category || '기타',
          count: group.length,
          items: sorted.map(it => ({
            id: it.id,
            name: it.name,
            category: it.category,
            location: it.location || '',
            description: it.description || '',
            seasonalDescription: it.seasonalDescription || '',
            tags: it.tags || [],
            updatedAt: it.updatedAt || it.createdAt || '',
          })),
        };
      });

    // 3. 기한 만료 의심 항목 감지 (과거 날짜 포함 패키지/시즌 정보 및 운영 공지)
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const staleFacilities: Array<Record<string, any>> = [];
    for (const fac of approvedFacilities) {
      const fullText = `${fac.description || ''} ${fac.seasonalDescription || ''}`;
      const dates = extractDatesFromText(fullText);

      if (dates.length > 0) {
        const maxDate = [...dates].sort().pop()!;
        if (maxDate < todayStr) {
          staleFacilities.push({
            id: fac.id,
            name: fac.name,
            category: fac.category,
            lastDate: maxDate,
            detectedDates: dates,
            hasSeasonal: Boolean(fac.seasonalDescription && fac.seasonalDescription.trim()),
            descriptionPreview: (fac.seasonalDescription || fac.description || '').slice(0, 140),
          });
        }
      }
    }

    const staleNotices: Array<Record<string, any>> = [];
    noticeSnap.docs.forEach(doc => {
      const d = doc.data();
      if (d.isActive) {
        const isExpiredDate = d.endDate && new Date(d.endDate) < now;
        const textDates = extractDatesFromText(`${d.title || ''} ${d.content || ''}`);
        const maxTextDate = textDates.length > 0 ? [...textDates].sort().pop()! : null;
        const isExpiredText = maxTextDate ? maxTextDate < todayStr : false;

        if (isExpiredDate || isExpiredText) {
          staleNotices.push({
            id: doc.id,
            title: d.title,
            content: d.content,
            endDate: d.endDate || maxTextDate || '기한 경과 의심',
          });
        }
      }
    });

    return NextResponse.json({
      auditedAt: now.toISOString(),
      sync: {
        isSynced: ghostVectorIds.length === 0 && missingVectors.length === 0,
        approvedFirestoreCount: approvedFacilities.length,
        expiredFirestoreCount: expiredFacilitiesCount,
        pineconeCount: pineconeIds.length,
        ghostVectorIds,
        missingVectors,
      },
      duplicateGroups,
      stale: {
        facilities: staleFacilities,
        notices: staleNotices,
      },
    });
  } catch (error: any) {
    console.error('RAG Audit GET Error:', error);
    return NextResponse.json({ error: error.message || '진단 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await verifyAdminSession(req);
    const body = await req.json();
    const { action } = body;

    // 1. 원클릭 DB ↔ Pinecone 벡터 동기화 복구
    if (action === 'sync_vectors') {
      const [facSnap, pineconeIds] = await Promise.all([
        adminDb.collection('facilities').where('status', '==', 'approved').get(),
        listAllVectorIds(),
      ]);

      const approvedDocs = facSnap.docs.map(d => ({ id: d.id, ...d.data() } as Record<string, any>));
      const approvedIdSet = new Set(approvedDocs.map(d => d.id));
      const pineconeIdSet = new Set(pineconeIds);

      const ghostIds = pineconeIds.filter(id => !approvedIdSet.has(id));
      const missingDocs = approvedDocs.filter(d => !pineconeIdSet.has(d.id));

      for (const ghostId of ghostIds) {
        await deleteDocument(ghostId);
      }

      for (const doc of missingDocs) {
        let textToVectorize = `시설명: ${doc.name}\n카테고리: ${doc.category || '기타'}\n위치: ${doc.location || ''}\n설명: ${doc.description || ''}\n`;
        if (doc.seasonalDescription) {
          textToVectorize += `시즌/임시안내: ${doc.seasonalDescription}\n`;
        }
        const tagsArr = Array.isArray(doc.tags) ? doc.tags : [];
        textToVectorize += `태그: ${tagsArr.join(', ')}`;

        await upsertDocument({
          id: doc.id,
          text: textToVectorize,
          metadata: {
            type: doc.type || 'facility',
            name: doc.name,
            category: doc.category || '기타',
          },
        });
      }

      return NextResponse.json({
        success: true,
        deletedGhostCount: ghostIds.length,
        upsertedMissingCount: missingDocs.length,
      });
    }

    // 2. 중복/파편화 그룹 AI 통합 미리보기 생성
    if (action === 'preview_merge') {
      const { ids, masterName } = body;
      if (!Array.isArray(ids) || ids.length < 2 || !masterName) {
        return NextResponse.json({ error: '통합할 문서 ID 목록과 마스터 시설명이 필요합니다.' }, { status: 400 });
      }

      const docs = await Promise.all(ids.map((id: string) => adminDb.collection('facilities').doc(id).get()));
      const items = docs
        .filter(d => d.exists)
        .map(d => {
          const data = d.data()!;
          return {
            name: data.name || '',
            description: data.description || '',
            seasonalDescription: data.seasonalDescription || '',
            tags: Array.isArray(data.tags) ? data.tags : [],
          };
        });

      const todayStr = new Date().toISOString().split('T')[0];
      const synthesized = await synthesizeMultipleFacilities(items, masterName, todayStr);

      return NextResponse.json({
        success: true,
        preview: synthesized,
      });
    }

    // 3. 관리자 승인 후 마스터 문서 병합 실행 및 파편 문서 삭제
    if (action === 'execute_merge') {
      const { masterId, sourceIds, name, category, location, description, seasonalDescription, tags } = body;
      if (!masterId || !Array.isArray(sourceIds) || !name || !description) {
        return NextResponse.json({ error: '필수 통합 파라미터가 누락되었습니다.' }, { status: 400 });
      }

      const cleanTags = Array.isArray(tags)
        ? tags
        : String(tags || '')
            .split(',')
            .map(t => t.trim())
            .filter(Boolean);

      const masterRef = adminDb.collection('facilities').doc(masterId);
      const updatedData = {
        name: name.trim(),
        category: category || '기타',
        location: location || '',
        description: description.trim(),
        seasonalDescription: (seasonalDescription || '').trim(),
        tags: cleanTags,
        status: 'approved',
        updatedAt: new Date().toISOString(),
      };

      await masterRef.set(updatedData, { merge: true });

      let textToVectorize = `시설명: ${updatedData.name}\n카테고리: ${updatedData.category}\n위치: ${updatedData.location}\n설명: ${updatedData.description}\n`;
      if (updatedData.seasonalDescription) {
        textToVectorize += `시즌/임시안내: ${updatedData.seasonalDescription}\n`;
      }
      textToVectorize += `태그: ${cleanTags.join(', ')}`;

      await upsertDocument({
        id: masterId,
        text: textToVectorize,
        metadata: {
          type: 'facility',
          name: updatedData.name,
          category: updatedData.category,
        },
      });

      const obsoleteIds = sourceIds.filter((id: string) => id !== masterId);
      for (const obsId of obsoleteIds) {
        await adminDb.collection('facilities').doc(obsId).delete();
        await deleteDocument(obsId);
      }

      await adminDb.collection('facility_edits').add({
        facilityId: masterId,
        facilityName: updatedData.name,
        action: 'audit_merge',
        method: 'POST',
        mergedIds: sourceIds,
        deletedIds: obsoleteIds,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        masterId,
        deletedCount: obsoleteIds.length,
      });
    }

    // 4. 기한 만료 항목 처리 (RAG 제외 또는 시즌 문구 초기화)
    if (action === 'expire_items') {
      const { facilityIds = [], clearSeasonalIds = [], noticeIds = [] } = body;

      let expiredFacCount = 0;
      for (const id of facilityIds) {
        await adminDb.collection('facilities').doc(id).update({
          status: 'expired',
          updatedAt: new Date().toISOString(),
        });
        await deleteDocument(id);
        expiredFacCount++;
      }

      let clearedSeasonalCount = 0;
      for (const id of clearSeasonalIds) {
        const docRef = adminDb.collection('facilities').doc(id);
        const snap = await docRef.get();
        if (snap.exists) {
          const d = snap.data()!;
          await docRef.update({
            seasonalDescription: '',
            updatedAt: new Date().toISOString(),
          });
          const tagsArr = Array.isArray(d.tags) ? d.tags : [];
          const textToVectorize = `시설명: ${d.name}\n카테고리: ${d.category || '기타'}\n위치: ${d.location || ''}\n설명: ${d.description || ''}\n태그: ${tagsArr.join(', ')}`;
          await upsertDocument({
            id,
            text: textToVectorize,
            metadata: {
              type: d.type || 'facility',
              name: d.name,
              category: d.category || '기타',
            },
          });
          clearedSeasonalCount++;
        }
      }

      let deactivatedNoticeCount = 0;
      for (const id of noticeIds) {
        await adminDb.collection('operational_notices').doc(id).update({
          isActive: false,
        });
        deactivatedNoticeCount++;
      }

      return NextResponse.json({
        success: true,
        expiredFacCount,
        clearedSeasonalCount,
        deactivatedNoticeCount,
      });
    }

    return NextResponse.json({ error: '지원하지 않는 작업(action)입니다.' }, { status: 400 });
  } catch (error: any) {
    console.error('RAG Audit POST Error:', error);
    return NextResponse.json({ error: error.message || '정리 작업 수행 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
