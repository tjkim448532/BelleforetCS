import { NextResponse } from 'next/server';
import { adminDb, verifyAdminSession } from '@/lib/firebase/admin';
import { upsertDocument } from '@/lib/pinecone';
import { extractRobotSpecsFromText, invalidateFacilityCache } from '@/lib/cs-intelligence';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface NoticeAuditEvaluation {
  id: string;
  verdict: 'EXPIRED_DELETE' | 'MIGRATE_TO_KNOWLEDGE' | 'KEEP_ACTIVE';
  reason: string;
  detectedMaxDate: string | null;
  suggestedCategory?: string;
}

/**
 * 공지 제목과 본문에서 연-월-일, M월 D일, N월 전체 등 날짜를 추출해 가장 마지막 날짜(YYYY-MM-DD)를 반환합니다.
 */
export function extractNoticeMaxDate(title: string, content: string, createdAtIso?: string): string | null {
  const fullText = `${title || ''}\n${content || ''}`;
  const baseYear = createdAtIso ? new Date(createdAtIso).getFullYear() : new Date().getFullYear();
  const dates: string[] = [];

  // 1) YYYY-MM-DD / YYYY.MM.DD / YYYY년 M월 D일
  const fullDateRegex = /(202\d)\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g;
  let match: RegExpExecArray | null;
  while ((match = fullDateRegex.exec(fullText)) !== null) {
    const y = match[1];
    const m = match[2].padStart(2, '0');
    const d = match[3].padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
  }

  // 2) 연도 생략형 M월 D일 (예: 6월 14일, 8월 23일(일))
  // 단, "별도 공지 시까지", "상시"가 함께 있는 시작일 단일 표기는 제외
  const isOngoingText = /별도\s*공지\s*시\s*까지|상시\s*운영|연중\s*무휴|계속/.test(fullText);
  const mdRegex = /(?:^|[^0-9])(1[0-2]|0?[1-9])\s*월\s*([12][0-9]|3[01]|0?[1-9])\s*일/g;
  while ((match = mdRegex.exec(fullText)) !== null) {
    const m = match[1].padStart(2, '0');
    const d = match[2].padStart(2, '0');
    dates.push(`${baseYear}-${m}-${d}`);
  }

  // 3) 제목에 "6월 휴장", "8월 미운영"처럼 특정 월 전체 공지인 경우 해당 월 말일 산출
  const monthOnlyRegex = /(?:^|\s)(1[0-2]|0?[1-9])\s*월\s*(?:모토아레나|휴장|미운영|일정|안내)/;
  const monthMatch = fullText.match(monthOnlyRegex);
  if (monthMatch) {
    const mNum = parseInt(monthMatch[1], 10);
    const lastDay = new Date(baseYear, mNum, 0).getDate();
    dates.push(`${baseYear}-${String(mNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);
  }

  if (dates.length === 0) return null;
  if (isOngoingText && dates.length === 1) {
    // 예: "3/16(월) ~ 별도 공지 시까지" -> 시작일만 있고 종료일은 무기한인 경우
    return null;
  }

  return [...dates].sort().pop() || null;
}

/**
 * 공지 1건에 대해 규칙 + 날짜 기반 기본 검수 판정을 수행합니다.
 */
export function evaluateNoticeRuleBased(notice: Record<string, any>, todayStr: string): NoticeAuditEvaluation {
  const title = String(notice.title || '').trim();
  const content = String(notice.content || '').trim();
  const fullText = `${title} ${content}`;

  const endDateStr = notice.endDate ? String(notice.endDate).slice(0, 10) : null;
  const detectedMaxDate = extractNoticeMaxDate(title, content, notice.createdAt);
  const effectiveEndDate = endDateStr || detectedMaxDate;

  // 1) 종료일이 지났거나 본문 속 날짜가 이미 지난 경우 -> 삭제 권장
  if (effectiveEndDate && effectiveEndDate < todayStr) {
    return {
      id: notice.id,
      verdict: 'EXPIRED_DELETE',
      reason: endDateStr
        ? `지정된 종료일(${endDateStr})이 이미 지났습니다. (불필요 공지 — 삭제 권장)`
        : `종료일이 비어 있으나 본문 날짜(${detectedMaxDate})가 이미 지났습니다. (과거 공지 — 삭제 권장)`,
      detectedMaxDate: effectiveEndDate,
    };
  }

  // 2) 일시적 긴급 공지(휴장/점검/우천)가 아니라 상시 혜택·규정·요금표인 경우 -> 지식창고 이관 권장
  const isPermanentRule =
    /별도\s*공지\s*시\s*까지|분양\s*회원.*할인|상시\s*할인|이용\s*규정|입장\s*규정/.test(fullText) &&
    !/오늘|금일|우천|임시\s*휴장|긴급\s*점검|조기\s*마감/.test(fullText);

  if (isPermanentRule) {
    const suggestedCategory = /식음|레스토랑|조식|디너|카페|쿠치나|남도예담|브리스킷/.test(fullText)
      ? '식음'
      : /숙박|객실|콘도/.test(fullText)
      ? '숙박'
      : /골프|카트|썰매|루지/.test(fullText)
      ? '레저'
      : '기타';

    return {
      id: notice.id,
      verdict: 'MIGRATE_TO_KNOWLEDGE',
      reason:
        '일시적인 긴급 휴장/점검이 아니라 계속 유지되는 [상시 혜택/이용 규정]입니다. [1. AI 지식창고]로 옮기고 긴급 공지에서는 지우시는 것을 권장합니다.',
      detectedMaxDate: null,
      suggestedCategory,
    };
  }

  // 3) 이미 수동으로 꺼둔(isActive === false) 과거 공지
  if (notice.isActive === false) {
    return {
      id: notice.id,
      verdict: 'EXPIRED_DELETE',
      reason: '현재 꺼져 있는(안내 종료된) 이전 공지입니다. 다시 쓰지 않으신다면 삭제하여 목록을 깔끔하게 정리하세요.',
      detectedMaxDate: effectiveEndDate,
    };
  }

  return {
    id: notice.id,
    verdict: 'KEEP_ACTIVE',
    reason: '현재 정상적으로 유효한 긴급 공지입니다.',
    detectedMaxDate: effectiveEndDate,
  };
}

export async function POST(req: Request) {
  try {
    await verifyAdminSession(req);
    const data = await req.json();
    const { action } = data;

    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayStr = kstNow.toISOString().slice(0, 10);

    // [Action 1] 작성 중인 공지 또는 전체 공지 AI 심층 검수 (종료일 자동 추출 + 불필요 여부 판단)
    if (action === 'ai_check_draft') {
      const { title = '', content = '', endDate = '' } = data;
      const detectedMaxDate = extractNoticeMaxDate(title, content);
      const dummyEval = evaluateNoticeRuleBased(
        { id: 'draft', title, content, endDate: endDate || null, isActive: true },
        todayStr
      );

      let aiAdvice = dummyEval.reason;
      let suggestedEndDate = endDate || (detectedMaxDate ? `${detectedMaxDate}T23:59` : '');

      if (process.env.GEMINI_API_KEY) {
        try {
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
          const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });
          const prompt = `오늘 날짜는 ${todayStr} 입니다.
리조트 직원이 [오늘의 긴급 공지]에 올리려는 아래 내용을 검수해주세요.
- 제목: ${title}
- 내용: ${content}
- 현재 입력된 종료일: ${endDate || '미입력'}

다음 JSON 형식으로만 답하세요:
{
  "verdict": "KEEP_ACTIVE" | "EXPIRED_DELETE" | "MIGRATE_TO_KNOWLEDGE",
  "advice": "직원에게 보여줄 친절한 1~2문장 검수 의견 (과거 날짜인지, 상시 규정이라 지식창고에 넣어야 하는지, 또는 적절한 긴급 공지인지)",
  "suggestedEndDate": "YYYY-MM-DDTHH:mm 형식의 추천 자동 종료일 (본문에 날짜가 있으면 해당 날짜 23:59, '오늘'이면 ${todayStr}T23:59, 상시 규정이면 빈 문자열)"
}`;
          const res = await model.generateContent(prompt);
          const raw = (res.response.text() || '').replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(raw);
          if (parsed.advice) aiAdvice = parsed.advice;
          if (parsed.suggestedEndDate && !endDate) suggestedEndDate = parsed.suggestedEndDate;
          if (parsed.verdict) dummyEval.verdict = parsed.verdict;
        } catch (err) {
          console.warn('AI draft notice check fallback to rule-based:', err);
        }
      }

      return NextResponse.json({
        success: true,
        verdict: dummyEval.verdict,
        advice: aiAdvice,
        suggestedEndDate,
        suggestedCategory: dummyEval.suggestedCategory || '기타',
      });
    }

    // [Action 2] 불필요/만료 공지 일괄 삭제
    if (action === 'bulk_delete') {
      const { ids = [] } = data;
      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: '삭제할 공지 ID가 없습니다.' }, { status: 400 });
      }
      let deletedCount = 0;
      for (const id of ids) {
        await adminDb.collection('operational_notices').doc(String(id)).delete();
        deletedCount++;
      }
      return NextResponse.json({ success: true, deletedCount });
    }

    // [Action 3] 상시 혜택/규정 공지를 [1. AI 지식창고(facilities)]로 이관 후 긴급 공지에서 삭제
    if (action === 'migrate_to_facility') {
      const { noticeId, category } = data;
      if (!noticeId) {
        return NextResponse.json({ error: '이동할 공지 ID가 필요합니다.' }, { status: 400 });
      }
      const noticeRef = adminDb.collection('operational_notices').doc(String(noticeId));
      const noticeSnap = await noticeRef.get();
      if (!noticeSnap.exists) {
        return NextResponse.json({ error: '해당 공지를 찾을 수 없습니다.' }, { status: 404 });
      }

      const notice = noticeSnap.data()!;
      const facName = String(notice.title || '리조트 이용 안내').trim();
      const facDesc = String(notice.content || '').trim();
      const facCategory = category || '기타';

      const robotSpecs = extractRobotSpecsFromText({
        name: facName,
        category: facCategory,
        location: '리조트 내 해당 업장',
        description: facDesc,
        seasonalDescription: '',
      });

      const facRef = adminDb.collection('facilities').doc();
      const nowIso = new Date().toISOString();
      const facilityData = {
        name: facName,
        category: facCategory,
        location: '리조트 내 해당 업장',
        description: facDesc,
        seasonalDescription: '',
        tags: ['할인', '혜택', facName],
        status: 'approved',
        type: 'facility',
        robotSpecs,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await facRef.set(facilityData);
      await upsertDocument({
        id: facRef.id,
        text: `시설명: ${facName}\n카테고리: ${facCategory}\n위치: 리조트 내 해당 업장\n설명: ${facDesc}\n태그: 할인, 혜택, ${facName}`,
        metadata: {
          type: 'facility',
          name: facName,
          category: facCategory,
        },
      });

      await noticeRef.delete();
      invalidateFacilityCache();

      return NextResponse.json({
        success: true,
        facilityId: facRef.id,
        facilityName: facName,
      });
    }

    // 기본: 새 긴급 공지 생성
    const { title, content, isActive, startDate, endDate } = data;

    if (!title || !content) {
      return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
    }

    // 직원이 종료일을 비워두었더라도 본문에 명확한 날짜가 있으면 자동으로 종료일(23:59:59) 보완
    let finalEndDate = endDate || null;
    if (!finalEndDate) {
      const inferredMaxDate = extractNoticeMaxDate(title, content);
      if (inferredMaxDate) {
        finalEndDate = new Date(`${inferredMaxDate}T23:59:59+09:00`).toISOString();
      }
    }

    const docRef = adminDb.collection('operational_notices').doc();

    const noticeData = {
      title,
      content,
      isActive: isActive ?? true,
      startDate: startDate || null,
      endDate: finalEndDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await docRef.set(noticeData);

    return NextResponse.json({ success: true, id: docRef.id, notice: noticeData });
  } catch (error: unknown) {
    console.error('Error creating/processing notice:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    await verifyAdminSession(req);
    const snapshot = await adminDb.collection('operational_notices').orderBy('createdAt', 'desc').get();
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayStr = kstNow.toISOString().slice(0, 10);

    const notices = snapshot.docs.map(doc => {
      const raw = { id: doc.id, ...doc.data() } as Record<string, any>;
      const audit = evaluateNoticeRuleBased(raw, todayStr);
      return {
        ...raw,
        audit,
      };
    });
    return NextResponse.json({ notices });
  } catch (error: unknown) {
    console.error('Error fetching notices:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    await verifyAdminSession(req);
    const data = await req.json();
    const { id, title, content, isActive, startDate, endDate } = data;

    if (!id || !title || !content) {
      return NextResponse.json({ error: 'ID, title, and content are required' }, { status: 400 });
    }

    const docRef = adminDb.collection('operational_notices').doc(id);
    const updatedNotice = {
      title,
      content,
      isActive: isActive ?? true,
      startDate: startDate || null,
      endDate: endDate || null,
      updatedAt: new Date().toISOString(),
    };

    await docRef.update(updatedNotice);

    return NextResponse.json({ success: true, id: docRef.id, notice: updatedNotice });
  } catch (error: unknown) {
    console.error('Error updating notice:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await verifyAdminSession(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    await adminDb.collection('operational_notices').doc(id).delete();

    return NextResponse.json({ success: true, id });
  } catch (error: unknown) {
    console.error('Error deleting notice:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
