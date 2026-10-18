import { NextResponse } from 'next/server';
import { adminDb, verifyAdminSession } from '@/lib/firebase/admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  classifyConversation,
  expandBelleforetSynonyms,
  extractRobotSpecsFromText,
  maskPersonalInfo,
  normalizeQuestionKey,
  searchHybridFacilityDocs,
} from '@/lib/cs-intelligence';

/**
 * CS 로봇 개발 납품용 DB 현대화 & 표준 데이터셋(JSONL / Structured Specs) 추출 API
 */
export async function GET(req: Request) {
  try {
    await verifyAdminSession(req);
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'summary';

    const [facSnap, logSnap] = await Promise.all([
      adminDb.collection('facilities').get(),
      adminDb.collection('chat_logs').orderBy('timestamp', 'desc').limit(1000).get(),
    ]);

    const facilities: Record<string, any>[] = facSnap.docs
      .map((d): Record<string, any> => ({ id: d.id, ...(d.data() as Record<string, any>) }))
      .filter((f) => f.status === 'approved');

    const logs: Record<string, any>[] = logSnap.docs.map((d): Record<string, any> => ({
      id: d.id,
      ...(d.data() as Record<string, any>),
    }));

    // 1. 로봇 네비게이션·요금계산·자격판단용 정형 시설 스펙 JSON 다운로드
    if (format === 'specs') {
      const specsCatalog = {
        schemaVersion: 'belleforet-robot-spec-v2.0',
        exportedAt: new Date().toISOString(),
        totalFacilities: facilities.length,
        facilities: facilities.map((f) => ({
          id: f.id,
          name: f.name,
          category: f.category,
          location: f.location || '벨포레 리조트 내',
          robotSpecs: f.robotSpecs || extractRobotSpecsFromText(f),
          description: f.description,
          seasonalDescription: f.seasonalDescription || '',
          tags: f.tags || [],
        })),
      };

      return new Response(JSON.stringify(specsCatalog, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="belleforet_robot_facility_specs_${new Date()
            .toISOString()
            .slice(0, 10)}.json"`,
        },
      });
    }

    // 2. 로봇 파인튜닝(SFT/RLHF) 및 대화 엔진 학습용 국제 표준 JSONL 다운로드
    if (format === 'jsonl') {
      const lines: string[] = [];

      // (A) 마스터 시설 지식 기반 표준 Q&A 데이터셋
      for (const f of facilities) {
        const specs = f.robotSpecs || extractRobotSpecsFromText(f);
        const record = {
          dataset_type: 'canonical_knowledge',
          facility_id: f.id,
          category: f.category,
          intent_code: 'FACILITY_MASTER_INFO',
          structured_slots: specs,
          messages: [
            {
              role: 'system',
              content:
                '당신은 벨포레 리조트의 자율주행 CS 안내 로봇이자 공식 AI 컨시어지입니다. 정확한 요금, 운영시간, 탑승 기준, 위치를 친절하게 안내하세요.',
            },
            {
              role: 'user',
              content: `${f.name} 이용 안내와 요금, 운영시간을 알려주세요.`,
            },
            {
              role: 'assistant',
              content: `${f.description}${
                f.seasonalDescription ? `\n\n[시즌/기간 안내] ${f.seasonalDescription}` : ''
              }`,
            },
          ],
        };
        lines.push(JSON.stringify(record));
      }

      // (B) 실제 고객 질문·응대 분류 로그 데이터셋 (개인정보 100% 마스킹 & 중복 질문 100% 제거)
      const seenNormalized = new Set<string>();
      for (const log of logs) {
        const cls = classifyConversation(
          log.question || '',
          log.answer || '',
          log.channel || 'web'
        );
        if (!cls.isResolved) continue; // 미해결 오답은 학습 데이터셋에서 자동 제외

        const normKey = log.normalizedQuestion || normalizeQuestionKey(cls.maskedQuestion);
        if (!normKey || seenNormalized.has(normKey)) continue;
        seenNormalized.add(normKey);

        const record = {
          dataset_type: 'real_guest_dialogue',
          log_id: log.id,
          channel: log.channel || 'web',
          ask_count: log.askCount || 1,
          category: log.category || cls.category,
          intent_code: log.intentCode || cls.intentCode,
          intent_label: log.intentLabel || cls.intentLabel,
          sentiment: log.sentiment || cls.sentiment,
          timestamp: log.timestamp,
          messages: [
            {
              role: 'system',
              content:
                '당신은 벨포레 리조트의 자율주행 CS 안내 로봇이자 공식 AI 컨시어지입니다.',
            },
            {
              role: 'user',
              content: cls.maskedQuestion,
            },
            {
              role: 'assistant',
              content: cls.maskedAnswer,
            },
          ],
        };
        lines.push(JSON.stringify(record));
      }

      return new Response(lines.join('\n'), {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Content-Disposition': `attachment; filename="belleforet_cs_robot_training_${new Date()
            .toISOString()
            .slice(0, 10)}.jsonl"`,
        },
      });
    }

    // 3. 요약 통계 반환 (관리자 화면 대시보드용)
    const robotSpecsReadyCount = facilities.filter((f) => Boolean(f.robotSpecs)).length;
    const classifiedLogCount = logs.filter((l) => Boolean(l.intentCode)).length;
    const goldenLogsCount = logs.filter((l) => l.isResolved !== false && !l.needsHumanHandoff).length;

    const byChannel: Record<string, number> = { web: 0, kakao: 0, voice: 0 };
    const byIntent: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    logs.forEach((l) => {
      const ch = l.channel || 'web';
      byChannel[ch] = (byChannel[ch] || 0) + 1;
      const intent = l.intentLabel || '일반 이용 문의';
      byIntent[intent] = (byIntent[intent] || 0) + 1;
      const cat = l.category || '기타';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });

    const sampleFacilities = facilities.slice(0, 25).map((f) => ({
      id: f.id,
      title: f.name || f.title || '',
      category: f.category || '기타',
      robotSpecs: f.robotSpecs || extractRobotSpecsFromText(f),
    }));

    return NextResponse.json({
      status: 'success',
      summary: {
        totalApprovedFacilities: facilities.length,
        totalFacilities: facilities.length,
        robotSpecsReadyCount,
        robotReadyFacilitiesCount: robotSpecsReadyCount,
        totalLogs: logs.length,
        classifiedLogCount,
        goldenLogsCount: goldenLogsCount + facilities.length,
        byChannel,
        channelCounts: byChannel,
        byIntent,
        byCategory,
        categoryCounts: byCategory,
      },
      sampleFacilities,
    });
  } catch (error: any) {
    console.error('[Robot Dataset GET Error]:', error);
    return NextResponse.json(
      { error: error.message || '로봇 데이터셋 조회 실패' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await verifyAdminSession(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'upgrade_all_db';

    // 1. 전체 시설 정형 슬롯(robotSpecs) 추출 및 과거 대화 로그 일괄 자동 분류·중복 병합 현대화
    if (action === 'upgrade_all_db') {
      const [facSnap, logSnap] = await Promise.all([
        adminDb.collection('facilities').orderBy('name').get().catch(() => adminDb.collection('facilities').get()),
        adminDb.collection('chat_logs').orderBy('timestamp', 'desc').get(),
      ]);

      let updatedFacilitiesCount = 0;
      for (const doc of facSnap.docs) {
        const data = doc.data();
        const specs = extractRobotSpecsFromText(data);
        await doc.ref.set({ robotSpecs: specs }, { merge: true });
        updatedFacilitiesCount++;
      }

      const canonicalMap = new Map<
        string,
        { doc: FirebaseFirestore.QueryDocumentSnapshot; totalAskCount: number }
      >();
      const docsToDelete: FirebaseFirestore.DocumentReference[] = [];

      for (const doc of logSnap.docs) {
        const data = doc.data();
        const normKey = normalizeQuestionKey(data.question || '');
        const count = typeof data.askCount === 'number' ? data.askCount : 1;

        if (!normKey) continue;

        if (canonicalMap.has(normKey)) {
          canonicalMap.get(normKey)!.totalAskCount += count;
          docsToDelete.push(doc.ref);
        } else {
          canonicalMap.set(normKey, { doc, totalAskCount: count });
        }
      }

      let updatedLogsCount = 0;
      for (const [normKey, { doc, totalAskCount }] of canonicalMap.entries()) {
        const data = doc.data();
        const cls = classifyConversation(
          data.question || '',
          data.answer || '',
          data.channel || 'web'
        );
        await doc.ref.set(
          {
            question: cls.maskedQuestion,
            normalizedQuestion: normKey,
            askCount: totalAskCount,
            channel: data.channel || 'web',
            category: cls.category,
            intentCode: cls.intentCode,
            intentLabel: cls.intentLabel,
            sentiment: cls.sentiment,
            sentimentLabel: cls.sentimentLabel,
            needsHumanHandoff: data.needsHumanHandoff ?? cls.needsHumanHandoff,
            isResolved: data.isResolved ?? cls.isResolved,
          },
          { merge: true }
        );
        updatedLogsCount++;
      }

      for (const ref of docsToDelete) {
        await ref.delete();
      }

      return NextResponse.json({
        status: 'success',
        updatedFacilitiesCount,
        updatedLogsCount,
        mergedDuplicatesCount: docsToDelete.length,
        message: `전체 시설 ${updatedFacilitiesCount}건 로봇 스펙 추출, 고유 상담 기록 ${updatedLogsCount}건 분류 및 중복 질문 ${docsToDelete.length}건 병합 완료!`,
      });
    }

    // 2. 통합 인박스에서 상담원이 직접 답변 보완 / 메모 저장 및 해결 완료 처리
    if (action === 'save_staff_reply') {
      const { logId, updatedAnswer, staffNote } = body;
      if (!logId) {
        return NextResponse.json({ error: 'logId가 필요합니다.' }, { status: 400 });
      }
      const updatePayload: Record<string, any> = {
        needsHumanHandoff: false,
        isResolved: true,
        staffUpdatedAt: new Date().toISOString(),
      };
      if (typeof updatedAnswer === 'string' && updatedAnswer.trim()) {
        updatePayload.answer = updatedAnswer.trim();
      }
      if (typeof staffNote === 'string') {
        updatePayload.staffNote = staffNote.trim();
      }
      await adminDb.collection('chat_logs').doc(logId).set(updatePayload, { merge: true });

      return NextResponse.json({ status: 'success' });
    }

    // 3. 직원이 입력한 정답을 기존 승인 DB(facilities)와 대조하여 사실 여부·충돌 여부를 AI로 사전 검증
    if (action === 'verify_staff_answer') {
      const { question = '', draftAnswer = '' } = body;
      if (!question.trim() || !draftAnswer.trim()) {
        return NextResponse.json(
          { error: '질문과 검증할 답변 내용을 모두 입력해 주세요.' },
          { status: 400 }
        );
      }

      const processed = expandBelleforetSynonyms(question);
      const { docs } = await searchHybridFacilityDocs(processed, question, {
        topK: 3,
        fastMode: true,
      });

      const refText =
        docs.length > 0
          ? docs.map((d, i) => `[기존 DB 문서 ${i + 1}: ${d.metadata?.name}]\n${d.metadata?.text}`).join('\n\n')
          : '관련된 기존 DB 문서 없음 (완전 신규 지식)';

      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
      const model = genAI.getGenerativeModel({
        model: 'gemini-flash-lite-latest',
        generationConfig: { responseMimeType: 'application/json' },
      });

      const prompt = `당신은 벨포레 리조트의 CS 품질 감사관(Fact-Checker)입니다.
직원이 고객 질문에 대해 새로 등록하려는 [직원 작성 답변]을 [기존 공식 DB 문서]와 대조하여 팩트체크하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "verdict": "PASS" | "WARN" | "NEW",
  "conflictSummary": "검증 결과 요약 (요금, 시간, 규정 등이 기존 DB와 일치하면 '✅ 기존 공식 DB 정보와 정확히 일치합니다.' / 기존 DB 수치와 충돌하면 '⚠️ [시설명]의 기존 DB 정보(수치)와 다릅니다. 확인이 필요합니다.' / 기존 DB에 없던 새로운 세부 정보면 '💡 기존 DB에 없던 새로운 세부 안내 정보입니다.')",
  "polishedAnswer": "직원이 작성한 답변의 핵심 사실을 유지하면서 호텔리어 표준 존댓말과 깔끔한 목록(- 기호)으로 다듬은 추천 답변"
}

[고객 질문]: ${question}
[직원 작성 답변]: ${draftAnswer}

[기존 공식 DB 문서]:
${refText}`;

      const result = await model.generateContent(prompt);
      const parsed = JSON.parse(result.response.text());

      return NextResponse.json({
        status: 'success',
        verdict: parsed.verdict || 'NEW',
        conflictSummary: parsed.conflictSummary || '검증이 완료되었습니다.',
        polishedAnswer: parsed.polishedAnswer || draftAnswer,
        matchedFacilities: docs.map((d) => d.metadata?.name).filter(Boolean),
      });
    }

    return NextResponse.json({ error: '알 수 없는 action입니다.' }, { status: 400 });
  } catch (error: any) {
    console.error('[Robot Dataset POST Error]:', error);
    return NextResponse.json(
      { error: error.message || 'DB 현대화 작업 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
