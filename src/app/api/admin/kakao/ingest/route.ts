import { NextResponse } from 'next/server';
import { adminDb, verifyAdminSession } from '@/lib/firebase/admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  classifyConversation,
  maskPersonalInfo,
} from '@/lib/cs-intelligence';

/**
 * 카카오톡 대화 내보내기(.txt / .csv) 및 상담 대화 통째로 흡수 API
 * - 개인정보(전화번호, 실명, 이메일 등)를 100% 마스킹한 뒤,
 *   AI가 고객 질문과 상담원 답변 쌍(Q&A) 및 핵심 지식을 자동 추출하여
 *   통합 인박스(chat_logs, channel='kakao')에 적재하고 지식창고 등록 후보를 반환합니다.
 */
export async function POST(req: Request) {
  try {
    await verifyAdminSession(req);
    const body = await req.json();
    const rawText: string = (body.rawText || '').trim();
    const saveToLogs: boolean = body.saveToLogs !== false;

    if (!rawText) {
      return NextResponse.json(
        { error: '분석할 카카오톡 대화 내용을 입력해 주세요.' },
        { status: 400 }
      );
    }

    const maskedText = maskPersonalInfo(rawText).slice(0, 25000);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되어 있지 않습니다.' },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `당신은 벨포레 리조트의 수석 CS 데이터 엔지니어입니다.
아래는 카카오톡에서 고객과 상담원이 주고받은 실제 대화 원문입니다.
이 대화에서 단순 인사말("안녕하세요", "네 감사합니다")이나 개인 신상정보는 모두 제거하고,
의미 있는 [고객 질문 - 상담원 답변] 쌍과 [AI 지식창고에 추가할 표준 지식]을 추출해 주세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "extractedPairs": [
    {
      "question": "고객이 물어본 핵심 질문 (개인정보 제거된 표준 질문 형태)",
      "answer": "상담원이 안내한 핵심 답변 내용",
      "suggestedName": "지식창고에 등록할 대표 제목 (예: 콘도 전기장판 반입 규정, 마운틴카트 우천 안내)",
      "suggestedCategory": "레저 | 숙박 | 식음 | 편의 | 기타 중 하나",
      "suggestedDescription": "AI가 학습할 수 있도록 정리한 상세 안내 문장",
      "suggestedTags": "관련 검색어 태그 (쉼표로 구분)"
    }
  ]
}

[카카오톡 대화 원문]:
${maskedText}`;

    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());
    const pairs: any[] = Array.isArray(parsed.extractedPairs)
      ? parsed.extractedPairs
      : [];

    let savedLogCount = 0;
    const enrichedPairs = [];

    for (const pair of pairs) {
      const q = maskPersonalInfo(pair.question || '');
      const a = maskPersonalInfo(pair.answer || pair.suggestedDescription || '');
      if (!q || !a) continue;

      const cls = classifyConversation(q, a, 'kakao');

      if (saveToLogs) {
        await adminDb.collection('chat_logs').add({
          question: q,
          answer: a,
          contextUsed: ['kakao_import'],
          channel: 'kakao',
          externalUserId: 'kakao_chat_export',
          category: cls.category,
          intentCode: cls.intentCode,
          intentLabel: cls.intentLabel,
          sentiment: cls.sentiment,
          sentimentLabel: cls.sentimentLabel,
          needsHumanHandoff: false,
          isResolved: true,
          timestamp: new Date().toISOString(),
        });
        savedLogCount++;
      }

      enrichedPairs.push({
        ...pair,
        question: q,
        answer: a,
        category: cls.category,
        intentLabel: cls.intentLabel,
        classification: cls,
      });
    }

    return NextResponse.json({
      status: 'success',
      savedLogCount,
      message: `카카오톡 대화에서 핵심 Q&A ${savedLogCount}건을 자동 추출하여 통합 인박스(카카오톡 채널)와 로봇 학습 DB에 저장했습니다!`,
      extractedPairs: enrichedPairs,
    });
  } catch (error: any) {
    console.error('[Kakao Ingest Error]:', error);
    return NextResponse.json(
      { error: error.message || '카카오톡 대화 분석 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
