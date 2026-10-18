import { NextResponse } from 'next/server';
import { adminDb, verifyAdminSession } from '@/lib/firebase/admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { upsertDocument } from '@/lib/pinecone';
import {
  classifyConversation,
  extractRobotSpecsFromText,
  invalidateFacilityCache,
  maskPersonalInfo,
  resolveDeduplicatedLogTarget,
} from '@/lib/cs-intelligence';

/**
 * 카카오톡 대화 내보내기(.txt / .csv) 및 상담 대화 통째로 흡수 API
 * - 개인정보(전화번호, 실명, 이메일 등)를 100% 마스킹한 뒤,
 *   AI가 고객 질문과 상담원 답변 쌍(Q&A) 및 핵심 지식을 자동 추출하여
 *   통합 인박스(chat_logs, channel='kakao')와 AI 지식창고(facilities + Pinecone 벡터 DB)에 즉시 영구 학습시킵니다.
 */
export async function POST(req: Request) {
  try {
    await verifyAdminSession(req);
    const body = await req.json();
    const rawText: string = (body.rawText || '').trim();
    const saveToLogs: boolean = body.saveToLogs !== false;
    const saveToKnowledgeBase: boolean = body.saveToKnowledgeBase !== false;

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
      model: 'gemini-flash-lite-latest',
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
    let learnedFacilityCount = 0;
    const enrichedPairs = [];

    for (const pair of pairs) {
      const q = maskPersonalInfo(pair.question || '');
      const a = maskPersonalInfo(pair.answer || pair.suggestedDescription || '');
      if (!q || !a) continue;

      const cls = classifyConversation(q, a, 'kakao');

      if (saveToLogs) {
        const { logRef, normalizedQuestion, nextAskCount } =
          await resolveDeduplicatedLogTarget(q);
        await logRef.set(
          {
            question: q,
            normalizedQuestion,
            askCount: nextAskCount,
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
          },
          { merge: true }
        );
        savedLogCount++;
      }

      if (saveToKnowledgeBase) {
        const facTitle = `[상담학습] ${(pair.suggestedName || q).trim().slice(0, 60)}`;
        const facCategory = pair.suggestedCategory || cls.category || '기타';
        const facDesc = `[고객 질문]\n${q}\n\n[상담원 공식 답변]\n${pair.suggestedDescription || a}`;
        const facTags = String(pair.suggestedTags || '')
          .split(',')
          .map((t: string) => t.trim())
          .filter(Boolean);

        const existingSnap = await adminDb
          .collection('facilities')
          .where('name', '==', facTitle)
          .limit(1)
          .get();
        const facRef = existingSnap.empty
          ? adminDb.collection('facilities').doc()
          : existingSnap.docs[0].ref;

        const robotSpecs = extractRobotSpecsFromText({
          name: facTitle,
          category: facCategory,
          description: facDesc,
        });

        await facRef.set(
          {
            name: facTitle,
            category: facCategory,
            location: '벨포레 리조트 내',
            description: facDesc,
            seasonalDescription: '',
            tags: facTags,
            status: 'approved',
            type: 'faq',
            robotSpecs,
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
          { merge: true }
        );

        await upsertDocument({
          id: facRef.id,
          text: `시설명: ${facTitle}\n카테고리: ${facCategory}\n위치: 벨포레 리조트 내\n설명: ${facDesc}\n태그: ${facTags.join(', ')}`,
          metadata: {
            type: 'faq',
            name: facTitle,
            category: facCategory,
          },
        }).catch((err) => console.warn('Pinecone upsert warning:', err));

        learnedFacilityCount++;
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

    if (learnedFacilityCount > 0) {
      invalidateFacilityCache();
    }

    return NextResponse.json({
      status: 'success',
      extractedCount: enrichedPairs.length,
      savedLogCount,
      learnedFacilityCount,
      extractedPairs: enrichedPairs,
      message: `카카오톡 대화에서 총 ${enrichedPairs.length}건의 Q&A를 추출하여 통합 인박스(${savedLogCount}건) 및 AI 지식창고·벡터DB(${learnedFacilityCount}건)에 즉시 영구 학습시켰습니다!`,
    });
  } catch (error: any) {
    console.error('[Kakao Ingest Error]:', error);
    return NextResponse.json(
      { error: error.message || '카카오톡 대화 분석 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
