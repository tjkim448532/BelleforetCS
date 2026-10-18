import { adminDb } from '@/lib/firebase/admin';
import { querySimilarDocuments } from '@/lib/pinecone';
import { generateAnswer } from '@/lib/gemini';
import { triggerDailyHomepageSyncIfNeeded } from '@/lib/homepage-sync';

export type CsChannel = 'web' | 'kakao' | 'voice';

export type CsSentiment = 'positive' | 'neutral' | 'urgent' | 'complaint';

export interface ConversationClassification {
  channel: CsChannel;
  category: string;
  intentCode: string;
  intentLabel: string;
  sentiment: CsSentiment;
  sentimentLabel: string;
  needsHumanHandoff: boolean;
  isResolved: boolean;
  maskedQuestion: string;
  maskedAnswer: string;
}

export interface RobotFacilitySpecs {
  priceAdult: number | null;
  priceChild: number | null;
  minHeightCm: number | null;
  rainOperation: '가능' | '불가(우천휴장)' | '실내정상운영' | '현장확인';
  petAllowed: '동반가능' | '동반불가' | '케이지/유모차필수';
  operatingHours: string;
  closedDay: string;
  contactPhone: string;
  navigationZone: string;
}

/**
 * 개인정보(전화번호, 주민번호, 이메일, 계좌/카드번호) 자동 마스킹 (로봇 학습 데이터셋 표준)
 */
export function maskPersonalInfo(text: string): string {
  if (!text) return '';
  return text
    .replace(/(01[016789]|02|0[3-6][1-5])[-.\s]?\d{3,4}[-.\s]?\d{4}/g, '$1-****-****')
    .replace(/\d{6}[-.\s]?[1-4]\d{6}/g, '******-*******')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '***@***.***');
}

/**
 * 직원이 외부 PC/모바일 카카오톡에서 고객 질문을 드래그해 그대로 복붙했을 때
 * "[홍길동] [오후 2:10]" 또는 "2026년 10월 18일 오후 2:10, 홍길동 :" 같은 카톡 말풍선 헤더를 자동 제거합니다.
 */
export function cleanKakaoCopyPasteQuestion(rawText: string): string {
  if (!rawText) return '';
  const cleaned = maskPersonalInfo(rawText)
    .replace(/\[[^\]]{1,25}\]\s*\[(?:오전|오후|AM|PM)?\s*\d{1,2}:\d{2}\]\s*/gi, '')
    .replace(
      /\d{4}[년.\-\s]+\d{1,2}[월.\-\s]+\d{1,2}[일.\s]+(?:오전|오후)?\s*\d{1,2}:\d{2},\s*[^:：]{1,25}[:：]\s*/g,
      ''
    )
    .replace(/-{3,}\s*\d{4}년.*-{3,}/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return cleaned || rawText.trim();
}

/**
 * 중복 질문 방지를 위한 표준 질문 정규화 키 생성기
 * (띄어쓰기, 물음표, 느낌표, 마침표 차이를 무시하고 동일 질문 여부를 판별합니다)
 */
export function normalizeQuestionKey(question: string): string {
  return cleanKakaoCopyPasteQuestion(question)
    .toLowerCase()
    .replace(/[?？!！.,~"'`’“”\s]/g, '')
    .trim();
}

/**
 * 동일한 질문(normalizedQuestion)이 이미 chat_logs에 존재하면 새 문서를 중복 생성하지 않고
 * 기존 문서의 참조(docRef)와 누적 질문 횟수(askCount)를 반환합니다.
 */
export async function resolveDeduplicatedLogTarget(question: string): Promise<{
  logRef: FirebaseFirestore.DocumentReference;
  normalizedQuestion: string;
  nextAskCount: number;
  existingData: Record<string, any> | null;
}> {
  const normalizedQuestion = normalizeQuestionKey(question);
  if (!normalizedQuestion) {
    return {
      logRef: adminDb.collection('chat_logs').doc(),
      normalizedQuestion: '',
      nextAskCount: 1,
      existingData: null,
    };
  }

  const snap = await adminDb
    .collection('chat_logs')
    .where('normalizedQuestion', '==', normalizedQuestion)
    .limit(1)
    .get();

  if (!snap.empty) {
    const existingDoc = snap.docs[0];
    const data = existingDoc.data() || {};
    const prevCount = typeof data.askCount === 'number' ? data.askCount : 1;
    return {
      logRef: existingDoc.ref,
      normalizedQuestion,
      nextAskCount: prevCount + 1,
      existingData: data,
    };
  }

  return {
    logRef: adminDb.collection('chat_logs').doc(),
    normalizedQuestion,
    nextAskCount: 1,
    existingData: null,
  };
}

/**
 * 고객 질문과 AI 답변을 분석하여 의도(Intent), 분류(Category), 감정/긴급도(Sentiment), 상담원 개입 필요 여부를 즉시 분류합니다.
 */
export function classifyConversation(
  question: string,
  answer: string,
  channel: CsChannel = 'web'
): ConversationClassification {
  const q = (question || '').trim();
  const a = (answer || '').trim();

  // 1. 카테고리 분류
  let category = '기타';
  if (/(마운틴카트|루지|썰매|원더풀|수영장|놀이기구|놀이동산|목장|마리나|보트|모토아레나|미니골프|회전그네|공연|미디어아트|디노)/.test(q)) {
    category = '레저';
  } else if (/(콘도|객실|숙박|체크인|체크아웃|조식|수건|침구|패밀리룸|스위트|연박)/.test(q)) {
    category = '숙박';
  } else if (/(남도예담|딜라이트|브리스킷|투썸|얼룩말|치킨|bhc|밤밤|쿠치나|핏스탑|푸드트럭|식당|맛집|밥|메뉴|카페|편의점|cu)/i.test(q)) {
    category = '식음';
  } else if (/(골프|그린피|카트비|캐디피|라운딩|블랙스톤|cc)/i.test(q)) {
    category = '골프';
  } else if (/(강아지|반려견|애견|펫포레|유모차|휠체어|셔틀|버스|주차|화장실|비|우천)/.test(q)) {
    category = '편의/규정';
  } else if (/(패키지|프로모션|특가|할인|예약|취소|환불|가격|요금|얼마)/.test(q)) {
    category = '예약/요금';
  }

  // 2. 의도(Intent) 코드 및 라벨 분류
  let intentCode = 'GENERAL_INQUIRY';
  let intentLabel = '일반 이용 문의';

  if (/(환불|취소|위약금|바꿔|변경|직원|상담원|사람|연결|전화해|통화|화나|최악|불만|고장|분실|잃어버)/.test(q)) {
    intentCode = 'REFUND_OR_HANDOFF';
    intentLabel = '취소·환불·직원연결 요청';
  } else if (/(비|우천|날씨|눈|폭우|태풍|바람|휴장)/.test(q)) {
    intentCode = 'WEATHER_OPERATION';
    intentLabel = '날씨/우천 시 운영 문의';
  } else if (/(키|신장|cm|센티|나이|개월|돌|아이|어린이|혼자|탑승기준|몸무게)/i.test(q)) {
    intentCode = 'ELIGIBILITY_LIMIT';
    intentLabel = '탑승 키·나이 기준 문의';
  } else if (/(얼마|요금|가격|할인|비용|무료|투숙객|회원|패키지|특가)/.test(q)) {
    intentCode = 'PRICE_AND_DISCOUNT';
    intentLabel = '요금·할인·패키지 문의';
  } else if (/(몇시|몇 시|시간|오픈|마감|언제|휴무|쉬는날|브레이크|야간)/.test(q)) {
    intentCode = 'OPERATING_HOURS';
    intentLabel = '운영시간·휴무일 문의';
  } else if (/(강아지|반려견|애견|개|고양이|펫|목줄|케이지)/.test(q)) {
    intentCode = 'PET_POLICY';
    intentLabel = '반려견 동반 규정 문의';
  } else if (/(어디|위치|길|가는법|셔틀|버스|주차|정류장|지도)/.test(q)) {
    intentCode = 'LOCATION_NAVIGATION';
    intentLabel = '위치·길안내·셔틀 문의';
  } else if (/(메뉴|먹을|식사|조식|맛집|추천)/.test(q)) {
    intentCode = 'DINING_MENU';
    intentLabel = '식당 메뉴·식사 문의';
  } else if (/(체크인|체크아웃|입실|퇴실|객실|비품|취사)/.test(q)) {
    intentCode = 'ROOM_CHECKIN';
    intentLabel = '객실 입퇴실·이용 문의';
  }

  // 3. 감정 및 긴급도 분석
  let sentiment: CsSentiment = 'neutral';
  let sentimentLabel = '일반 문의';

  if (/(왜 안|짜증|화나|최악|환불해|당장|사기|불친절|안받|신고|컴플레인)/.test(q)) {
    sentiment = 'complaint';
    sentimentLabel = '🚨 불만/민원';
  } else if (/(급해|지금 당장|사고|다쳤|잃어버|분실|갇혔|빨리|도와주)/.test(q)) {
    sentiment = 'urgent';
    sentimentLabel = '⚡ 긴급 도움';
  } else if (/(고마워|감사|좋네요|친절|최고|덕분에)/.test(q)) {
    sentiment = 'positive';
    sentimentLabel = '😊 긍정/만족';
  }

  // 4. AI 해결 여부 및 상담원 개입 필요 여부 판단
  const isUnanswered =
    !a ||
    a.includes('제가 아는 정보가 없습니다') ||
    a.includes('등록되어 있지 않습니다') ||
    a.includes('확인되지 않습니다') ||
    a.includes('프론트 데스크에 문의');

  const isResolved = !isUnanswered && sentiment !== 'complaint';
  const needsHumanHandoff =
    isUnanswered ||
    sentiment === 'complaint' ||
    sentiment === 'urgent' ||
    intentCode === 'REFUND_OR_HANDOFF';

  return {
    channel,
    category,
    intentCode,
    intentLabel,
    sentiment,
    sentimentLabel,
    needsHumanHandoff,
    isResolved,
    maskedQuestion: maskPersonalInfo(q),
    maskedAnswer: maskPersonalInfo(a),
  };
}

/**
 * 시설 자연어 설명문에서 로봇(키오스크·자율주행 안내로봇·보이스봇)이 즉시 활용할 수 있는 정형 데이터를 자동 추출합니다.
 */
export function extractRobotSpecsFromText(facility: {
  name?: string;
  category?: string;
  location?: string;
  description?: string;
  seasonalDescription?: string;
  robotSpecs?: Partial<RobotFacilitySpecs>;
}): RobotFacilitySpecs {
  const desc = `${facility.description || ''}\n${facility.seasonalDescription || ''}`;
  const existing = facility.robotSpecs || {};

  // 1. 성인/일반 요금 추출
  let priceAdult: number | null = existing.priceAdult ?? null;
  if (priceAdult === null) {
    const adultMatch =
      desc.match(/(?:성인|대인|1인승|일반|주중 그린피)[^0-9\n]{0,15}([0-9]{1,3}(?:,[0-9]{3})+)\s*원/) ||
      desc.match(/([0-9]{1,3}(?:,[0-9]{3})+)\s*원/);
    if (adultMatch) {
      priceAdult = parseInt(adultMatch[1].replace(/,/g, ''), 10);
    }
  }

  // 2. 소인/어린이/2인승 요금 추출
  let priceChild: number | null = existing.priceChild ?? null;
  if (priceChild === null) {
    const childMatch = desc.match(
      /(?:소인|어린이|청소년|2인승|주말 그린피)[^0-9\n]{0,15}([0-9]{1,3}(?:,[0-9]{3})+)\s*원/
    );
    if (childMatch) {
      priceChild = parseInt(childMatch[1].replace(/,/g, ''), 10);
    }
  }

  // 3. 최소 신장(키 제한 cm) 추출
  let minHeightCm: number | null = existing.minHeightCm ?? null;
  if (minHeightCm === null) {
    const heightMatch = desc.match(/([0-9]{2,3})\s*cm\s*이상/i);
    if (heightMatch) {
      minHeightCm = parseInt(heightMatch[1], 10);
    }
  }

  // 4. 우천 시 운영 여부 추출
  let rainOperation: RobotFacilitySpecs['rainOperation'] =
    existing.rainOperation || '현장확인';
  if (!existing.rainOperation) {
    if (/(실내|미디어아트|원더풀|사우나|식당|카페)/.test(`${facility.name} ${desc}`)) {
      rainOperation = '실내정상운영';
    } else if (/(우천\s*시\s*(?:휴장|운휴|중단|불가)|비\s*오면\s*운휴)/.test(desc)) {
      rainOperation = '불가(우천휴장)';
    } else if (facility.category === '식음' || facility.category === '숙박') {
      rainOperation = '가능';
    }
  }

  // 5. 반려견 동반 여부 추출
  let petAllowed: RobotFacilitySpecs['petAllowed'] =
    existing.petAllowed || '동반불가';
  if (!existing.petAllowed) {
    if (/(반려견\s*동반\s*불가|애견\s*출입\s*금지)/.test(desc)) {
      petAllowed = '동반불가';
    } else if (/(케이지|유모차|목줄)/.test(desc)) {
      petAllowed = '케이지/유모차필수';
    } else if (/(펫포레|반려견\s*동반\s*가능|애견\s*동반)/.test(`${facility.name} ${desc}`)) {
      petAllowed = '동반가능';
    }
  }

  // 6. 운영시간 추출
  const hoursMatch =
    desc.match(/운영시간\s*[:：]\s*([^\n]+)/) ||
    desc.match(/([0-2]?[0-9]:[0-5][0-9]\s*~\s*[0-2]?[0-9]:[0-5][0-9][^\n]*)/);
  const operatingHours =
    existing.operatingHours || (hoursMatch ? hoursMatch[1].trim() : '상세 설명 참조');

  // 7. 휴무일 추출
  const closedMatch =
    desc.match(/휴무일\s*[:：]\s*([^\n]+)/) ||
    desc.match(/(매주\s*[월화수목금토일]요일\s*휴무|연중무휴)/);
  const closedDay =
    existing.closedDay || (closedMatch ? closedMatch[1].trim() : '연중무휴/현장확인');

  // 8. 대표 전화번호 추출
  const phoneMatch = desc.match(/(043-[0-9]{3,4}-[0-9]{4}|1566-[0-9]{4})/);
  const contactPhone =
    existing.contactPhone || (phoneMatch ? phoneMatch[1] : '1566-0162');

  return {
    priceAdult,
    priceChild,
    minHeightCm,
    rainOperation,
    petAllowed,
    operatingHours,
    closedDay,
    contactPhone,
    navigationZone: existing.navigationZone || facility.location || '벨포레 리조트 내',
  };
}

let cachedNotices: any = null;
let cachedSettings: any = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000;

/**
 * 카카오톡 채널 웹훅 및 AI 전화 콜센터(보이스봇) 공용 초고속 RAG 응답 & 통합 인박스 로깅 엔진
 */
export async function answerGuestQuestion(params: {
  question: string;
  channel: CsChannel;
  externalUserId?: string;
  callerPhone?: string;
}): Promise<{
  logId: string;
  answer: string;
  classification: ConversationClassification;
  links: Array<{ label: string; url: string }>;
  quickReplies: string[];
}> {
  const startMs = Date.now();
  const { channel, externalUserId, callerPhone } = params;
  const question = cleanKakaoCopyPasteQuestion(params.question);

  const synonymMap: Record<string, string> = {
    목장: '벨포레 목장',
    미디어: '미디어아트센터',
    아트센터: '미디어아트센터',
    루지: '마운틴카트 루지',
    콘도: '벨포레 리조트',
    수영장: '원더풀',
    사계절썰매: '사계절 썰매',
    썰매장: '사계절 썰매',
    놀이공원: '놀이동산',
  };

  let processedQuestion = question;
  Object.entries(synonymMap).forEach(([shortName, fullName]) => {
    processedQuestion = processedQuestion.replace(new RegExp(shortName, 'g'), fullName);
  });

  // 1. Pinecone 검색, 중복 질문 조회, 긴급 공지, 설정 조회를 모두 병렬 실행 (카카오톡 5초 타임아웃 방어)
  const needCacheRefresh = startMs - cacheTimestamp >= CACHE_TTL || !cachedNotices || !cachedSettings;

  const [similarDocs, dedupTarget, freshNotices, freshSettings] = await Promise.all([
    querySimilarDocuments(processedQuestion, 3),
    resolveDeduplicatedLogTarget(question),
    needCacheRefresh
      ? adminDb.collection('operational_notices').where('isActive', '==', true).get()
      : Promise.resolve(cachedNotices),
    needCacheRefresh
      ? adminDb.collection('settings').doc('system').get()
      : Promise.resolve(cachedSettings),
  ]);

  if (needCacheRefresh) {
    cachedNotices = freshNotices;
    cachedSettings = freshSettings;
    cacheTimestamp = startMs;
  }

  let context = similarDocs
    .map((doc, idx) => `[문서 ${idx + 1}]\n${doc.metadata?.text || ''}`)
    .join('\n\n');

  // 공식 홈페이지 상세 링크 추출 (카카오톡 버튼용)
  const links: Array<{ label: string; url: string }> = [];
  const urlMatches = context.match(/https:\/\/belleforetresort\.com\/[^\s\n)]+/g) || [];
  Array.from(new Set(urlMatches))
    .slice(0, 2)
    .forEach((url) => {
      links.push({
        label: url.includes('/package/') ? '공식 홈페이지 패키지 상세보기' : '공식 홈페이지 매장 안내 보기',
        url,
      });
    });

  // 긴급 공지 최우선 주입
  let hasActiveNotices = false;
  if (cachedNotices && cachedNotices.docs) {
    const now = new Date();
    const activeNotices = cachedNotices.docs
      .map((d: any) => d.data())
      .filter((n: any) => {
        if (n.startDate && new Date(n.startDate) > now) return false;
        if (n.endDate && new Date(n.endDate) < now) return false;
        return true;
      })
      .slice(0, 5);

    if (activeNotices.length > 0) {
      hasActiveNotices = true;
      const noticesText = activeNotices
        .map((n: any) => `- ${n.title}: ${n.content}`)
        .join('\n');
      context = `[🚨 현재 리조트 긴급/운영 상황 (최우선 적용 사항)]\n${noticesText}\n\n[기본 시설/운영 정보]\n${context}`;
    }
  }

  const persona = cachedSettings?.exists ? cachedSettings.data()?.persona || 'friendly' : 'friendly';

  // 채널별 프롬프트 최적화 (음성 통화일 때는 귀로 듣기 편한 2~3문장 구어체로 응답)
  const effectiveQuestion =
    channel === 'voice'
      ? `${question}\n(※ 현재 전화 음성 통화 중입니다. 특수문자나 URL 주소를 읽지 말고, 호텔 컨시어지가 전화로 말하듯 2~3문장 이내로 또렷하고 친절하게 핵심만 답변해 주세요.)`
      : question;

  const { logRef, normalizedQuestion, nextAskCount, existingData } = dedupTarget;

  let rawAnswer = '';
  // 이미 검증된 동일 질문 답변이 있고 긴급 공지가 없으면 0.3초 만에 즉시 캐시 응답 반환
  if (
    channel !== 'voice' &&
    !hasActiveNotices &&
    existingData?.answer &&
    existingData?.isResolved === true &&
    !existingData?.needsHumanHandoff
  ) {
    rawAnswer = existingData.answer;
  } else if (similarDocs.length === 0) {
    rawAnswer =
      '현재 시스템에 관련 상세 정보가 확인되지 않습니다. 담당 직원이 확인 후 안내해 드리겠습니다.';
  } else {
    // 전체 누적 소요시간 기준 3.6초(3600ms) 하드 데드라인 보장 (카카오 5.0초 타임아웃 100% 방어)
    const elapsedMs = Date.now() - startMs;
    const remainingBudgetMs = Math.max(900, 3600 - elapsedMs);
    const topDocFallback = String(similarDocs[0]?.metadata?.text || '').trim();

    rawAnswer = await Promise.race([
      generateAnswer(effectiveQuestion, context, persona, 'ko', []),
      new Promise<string>((resolve) =>
        setTimeout(() => {
          resolve(
            topDocFallback
              ? `🌲 벨포레 리조트 안내입니다.\n\n${topDocFallback.slice(0, 650)}`
              : '잠시 문의가 많아 벨포레 고객센터(1566-0162)로 문의 부탁드립니다.'
          );
        }, remainingBudgetMs)
      ),
    ]);
  }

  const cleanAnswer = rawAnswer
    .replace(/\*\*/g, '')
    .replace(/^\s*\*\s/gm, '• ')
    .trim();

  const classification = classifyConversation(question, cleanAnswer, channel);

  // 통합 인박스(chat_logs) 백그라운드 비동기 병합 기록 (카카오 웹훅 응답 지연 0ms)
  logRef
    .set(
      {
        question,
        normalizedQuestion,
        askCount: nextAskCount,
        answer: cleanAnswer,
        contextUsed: similarDocs.map((d) => d.id),
        channel,
        externalUserId: externalUserId || existingData?.externalUserId || null,
        callerPhone: callerPhone || existingData?.callerPhone || null,
        category: classification.category,
        intentCode: classification.intentCode,
        intentLabel: classification.intentLabel,
        sentiment: classification.sentiment,
        sentimentLabel: classification.sentimentLabel,
        needsHumanHandoff: classification.needsHumanHandoff,
        isResolved: existingData?.isResolved ?? classification.isResolved,
        timestamp: new Date().toISOString(),
      },
      { merge: true }
    )
    .catch((err) => console.error('Failed to save chat log:', err));

  // 카카오톡 하단 빠른 질문 버튼(Quick Replies) 추천
  const quickReplies = [
    '오늘 운영 안 하는 시설 있나요?',
    '마운틴카트 요금 알려줘',
    '식당 운영시간 알려줘',
    '특가 패키지 추천해줘',
  ];

  return {
    logId: logRef.id,
    answer: cleanAnswer,
    classification,
    links,
    quickReplies,
  };
}
