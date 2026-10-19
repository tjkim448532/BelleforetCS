import { NextResponse } from 'next/server';
import { adminDb, verifyAdminSession } from '@/lib/firebase/admin';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * 직원용 모바일 현장 입력앱 전용 DB 컬렉션 (Firestore)
 * - 현재 안전 테스트 모드: 실제 고객 응대용 operational_notices와 분리하여
 *   staff_field_events 컬렉션에만 저장하며 고객용 AI에는 전달하지 않습니다.
 */
const STAFF_COLLECTION = 'staff_field_events';

const STAFF_PIN_MAP: Record<string, string> = {
  '1566': '벨포레 공통(전부서)',
  '1001': '프론트/객실팀',
  '2001': '레저/액티비티팀',
  '3001': '식음/연회팀',
  '4001': '골프/CC팀',
  '0000': '현장운영지원',
};

async function verifyStaffAuth(req: Request, bodyPin?: string): Promise<{ authorized: boolean; defaultDept?: string }> {
  // 1. 관리자 로그인 세션이 있으면 PIN 없이도 통과
  try {
    await verifyAdminSession(req);
    return { authorized: true, defaultDept: '관리자' };
  } catch {
    // 관리자 세션이 없으면 PIN 코드 확인
  }

  const headerPin = req.headers.get('x-staff-pin') || '';
  const urlPin = new URL(req.url).searchParams.get('pin') || '';
  const pin = String(bodyPin || headerPin || urlPin).trim();

  const envPin = process.env.STAFF_PIN_CODE?.trim();
  if (envPin && pin === envPin) {
    return { authorized: true, defaultDept: '벨포레 현장팀' };
  }

  if (pin && STAFF_PIN_MAP[pin]) {
    return { authorized: true, defaultDept: STAFF_PIN_MAP[pin] };
  }

  return { authorized: false };
}

function formatKstDateTimeRange(startIso?: string | null, endIso?: string | null): string {
  const fmt = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const m = kst.getUTCMonth() + 1;
    const day = kst.getUTCDate();
    const hh = String(kst.getUTCHours()).padStart(2, '0');
    const mm = String(kst.getUTCMinutes()).padStart(2, '0');
    return `${m}/${day} ${hh}:${mm}`;
  };

  const s = fmt(startIso);
  const e = fmt(endIso);
  if (s && e) {
    const sDate = s.split(' ')[0];
    const eParts = e.split(' ');
    if (sDate === eParts[0]) {
      return `${s} ~ ${eParts[1]}`;
    }
    return `${s} ~ ${e}`;
  }
  if (e) return `~ ${e}까지`;
  if (s) return `${s}부터`;
  return '당일 현장 운영';
}

async function polishStaffNoticeWithAI(params: {
  category: string;
  title: string;
  location: string;
  rawContent: string;
  timeRangeText: string;
}): Promise<{ polishedTitle: string; polishedContent: string }> {
  const { category, title, location, rawContent, timeRangeText } = params;
  const fallbackTitle = `[${category}] ${location ? `${location} - ` : ''}${title} (${timeRangeText})`.trim();
  const fallbackContent = `${location ? `[장소: ${location}] ` : ''}[일시: ${timeRangeText}] ${rawContent}`.trim();

  if (!process.env.GEMINI_API_KEY) {
    return { polishedTitle: fallbackTitle, polishedContent: fallbackContent };
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-lite-latest',
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    });

    const prompt = `당신은 벨포레 리조트의 실시간 현장 안내 방송 및 CS AI 에디터입니다.
현장 직원이 스마트폰으로 빠르게 입력한 [현장 행사/운휴/단체 일정 메모]를 읽고,
DB에 깔끔하게 보관할 수 있도록 명확하고 정중한 표준 제목과 본문으로 다듬어주세요.

[작성 규칙]
1. 직원이 입력한 사실(행사명, 인원, 장소, 시작~종료 시간, 제한/혼잡 사항)만 정확히 포함하고, 없는 내용을 지어내지 마세요.
2. 제목(polishedTitle) 형식: "[${category}] 핵심 제목 (${timeRangeText})" 형태로 한눈에 시간과 장소가 보이게 작성하세요.
3. 본문(polishedContent) 형식: 진행 시간(${timeRangeText})과 장소(${location || '리조트 내'})를 첫머리에 명확히 밝히고, 호텔리어 표준 존댓말 1~2문장으로 간결하게 작성하세요. 마크다운(**) 기호는 절대 쓰지 마세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "polishedTitle": "정제된 공지 제목",
  "polishedContent": "정제된 공식 안내 본문"
}

[입력 정보]
- 유형: ${category}
- 장소/시설: ${location || '벨포레 리조트 내'}
- 진행 시간: ${timeRangeText}
- 직원 입력 제목: ${title}
- 직원 입력 메모: ${rawContent}`;

    const res = await model.generateContent(prompt);
    const parsed = JSON.parse(res.response.text());
    return {
      polishedTitle: (parsed.polishedTitle || fallbackTitle).replace(/\*\*/g, '').trim(),
      polishedContent: (parsed.polishedContent || fallbackContent).replace(/\*\*/g, '').trim(),
    };
  } catch (err) {
    console.warn('Staff notice AI polish fallback:', err);
    return { polishedTitle: fallbackTitle, polishedContent: fallbackContent };
  }
}

export async function GET(req: Request) {
  try {
    const auth = await verifyStaffAuth(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: '직원용 PIN 번호가 올바르지 않습니다.' }, { status: 401 });
    }

    const snapshot = await adminDb.collection(STAFF_COLLECTION).orderBy('createdAt', 'desc').limit(50).get();
    const now = new Date();

    const activeNotices: Record<string, any>[] = [];
    const recentEndedNotices: Record<string, any>[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const item = { id: doc.id, ...data } as Record<string, any>;

      // 완료 시간이 지났는데 아직 isActive가 true인 경우 자동 완료(만료) 상태로 DB 업데이트
      if (item.isActive && item.endDate && new Date(item.endDate) < now) {
        doc.ref.update({ isActive: false, status: 'completed' }).catch(() => {});
        item.isActive = false;
        item.status = 'completed';
      }

      if (item.isActive) {
        activeNotices.push(item);
      } else if (recentEndedNotices.length < 15) {
        recentEndedNotices.push(item);
      }
    }

    return NextResponse.json({
      success: true,
      mode: 'test_db_only',
      collectionName: STAFF_COLLECTION,
      defaultDept: auth.defaultDept,
      activeNotices,
      recentEndedNotices,
    });
  } catch (error: any) {
    console.error('[Staff Notices GET Error]:', error);
    return NextResponse.json({ error: error.message || '조회에 실패했습니다.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action = 'create', pin } = body;

    const auth = await verifyStaffAuth(req, pin);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: '직원 인증 코드(PIN)가 일치하지 않습니다. (기본 공통코드: 1566)' },
        { status: 401 }
      );
    }

    if (action === 'verify_pin') {
      return NextResponse.json({
        success: true,
        department: auth.defaultDept || '벨포레 현장팀',
      });
    }

    // 1. AI 문장 미리 다듬기
    if (action === 'ai_polish') {
      const {
        category = '단체행사',
        title = '',
        location = '',
        rawContent = '',
        startDate = null,
        endDate = null,
      } = body;

      if (!title.trim() && !rawContent.trim()) {
        return NextResponse.json({ error: '행사 이름이나 내용을 입력해 주세요.' }, { status: 400 });
      }

      const timeRangeText = formatKstDateTimeRange(startDate, endDate);
      const polished = await polishStaffNoticeWithAI({
        category,
        title: title.trim() || rawContent.trim().slice(0, 25),
        location: location.trim(),
        rawContent: rawContent.trim() || title.trim(),
        timeRangeText,
      });

      return NextResponse.json({
        success: true,
        ...polished,
        timeRangeText,
      });
    }

    // 2. 진행 중인 행사/공지 즉시 완료(종료) 처리
    if (action === 'end_now') {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ error: '종료할 일정 ID가 필요합니다.' }, { status: 400 });
      }
      const nowIso = new Date().toISOString();
      await adminDb.collection(STAFF_COLLECTION).doc(String(id)).update({
        isActive: false,
        status: 'completed',
        endDate: nowIso,
        updatedAt: nowIso,
      });
      return NextResponse.json({ success: true, id });
    }

    // 3. 개별 항목 영구 삭제
    if (action === 'delete_one') {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ error: '삭제할 ID가 필요합니다.' }, { status: 400 });
      }
      await adminDb.collection(STAFF_COLLECTION).doc(String(id)).delete();
      return NextResponse.json({ success: true, id });
    }

    // 4. 테스트 데이터 전체 초기화 (일괄 삭제)
    if (action === 'reset_all_test_data') {
      const snap = await adminDb.collection(STAFF_COLLECTION).get();
      let deletedCount = 0;
      const batch = adminDb.batch();
      snap.docs.forEach((doc) => {
        batch.delete(doc.ref);
        deletedCount++;
      });
      if (deletedCount > 0) {
        await batch.commit();
      }
      return NextResponse.json({ success: true, deletedCount });
    }

    // 5. 새 현장 일정/행사/안내 DB 저장 (전용 staff_field_events 컬렉션에 저장, 고객 AI 미전달)
    const {
      category = '단체행사',
      title = '',
      location = '',
      rawContent = '',
      startDate = null,
      endDate = null,
      department = '',
      autoPolish = true,
    } = body;

    if (!title.trim() && !rawContent.trim()) {
      return NextResponse.json({ error: '행사/상황 제목과 안내 내용을 입력해 주세요.' }, { status: 400 });
    }

    const startIso = startDate ? new Date(startDate).toISOString() : new Date().toISOString();
    const endIso = endDate
      ? new Date(endDate).toISOString()
      : new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

    const timeRangeText = formatKstDateTimeRange(startIso, endIso);

    let finalTitle = title.trim();
    let finalContent = rawContent.trim() || title.trim();

    if (autoPolish) {
      const polished = await polishStaffNoticeWithAI({
        category,
        title: finalTitle || finalContent.slice(0, 25),
        location: location.trim(),
        rawContent: finalContent,
        timeRangeText,
      });
      finalTitle = polished.polishedTitle;
      finalContent = polished.polishedContent;
    } else {
      finalTitle = `[${category}] ${location ? `${location} ` : ''}${finalTitle} (${timeRangeText})`;
      finalContent = `${location ? `[장소: ${location}] ` : ''}[진행 시간: ${timeRangeText}] ${finalContent}`;
    }

    const nowIso = new Date().toISOString();
    const docRef = adminDb.collection(STAFF_COLLECTION).doc();
    const noticeData = {
      title: finalTitle,
      content: finalContent,
      rawTitle: title.trim(),
      rawContent: rawContent.trim(),
      category,
      location: location.trim() || '벨포레 리조트 내',
      department: department.trim() || auth.defaultDept || '현장직원',
      source: 'staff_mobile_app',
      aiSyncEnabled: false, // 테스트 모드: 실제 고객 응대 AI에는 아직 넘기지 않음
      status: 'active',
      isActive: true,
      startDate: startIso,
      endDate: endIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await docRef.set(noticeData);

    return NextResponse.json({
      success: true,
      id: docRef.id,
      notice: { id: docRef.id, ...noticeData },
    });
  } catch (error: any) {
    console.error('[Staff Notices POST Error]:', error);
    return NextResponse.json({ error: error.message || '현장 정보 등록 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
