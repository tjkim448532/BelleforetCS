import { NextResponse } from 'next/server';
import { querySimilarDocuments } from '@/lib/pinecone';
import { generateAnswer } from '@/lib/gemini';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(req: Request) {
  try {
    const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const ip = rawIp.trim();
    const nowMs = Date.now();
    
    // --- Firestore 기반 Rate Limiting (도배 방지) ---
    // 동일 IP에서 1분에 15회 초과 시 차단
    if (ip !== 'unknown') {
      const sanitizedIp = ip.replace(/[^a-zA-Z0-9]/g, '_');
      const rateLimitRef = adminDb.collection('rate_limits').doc(sanitizedIp);
      
      try {
        await adminDb.runTransaction(async (transaction) => {
          const doc = await transaction.get(rateLimitRef);
          if (!doc.exists) {
            transaction.set(rateLimitRef, { count: 1, resetTime: nowMs + 60000 });
          } else {
            const data = doc.data()!;
            if (nowMs < data.resetTime) {
              if (data.count >= 15) {
                throw new Error('RATE_LIMIT_EXCEEDED');
              }
              transaction.update(rateLimitRef, { count: data.count + 1 });
            } else {
              // Reset count if time expired
              transaction.update(rateLimitRef, { count: 1, resetTime: nowMs + 60000 });
            }
          }
        });
      } catch (error: any) {
        if (error.message === 'RATE_LIMIT_EXCEEDED') {
          console.warn(`Rate limit exceeded for IP: ${ip}`);
          return NextResponse.json({ 
            answer: '너무 많은 질문을 연속으로 하셨습니다. 1분 후 다시 시도해주세요.' 
          }, { status: 429 });
        }
      }
    }

    const data = await req.json();
    const { question, language = 'ko' } = data;

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // 1. 병렬로 검색 및 설정 정보 가져오기 (속도 최적화)
    const [similarDocsResult, noticesSnapshot, settingsDoc] = await Promise.allSettled([
      querySimilarDocuments(question, 3),
      adminDb.collection('operational_notices').where('isActive', '==', true).get(),
      adminDb.collection('settings').doc('system').get()
    ]);

    const similarDocs = similarDocsResult.status === 'fulfilled' ? similarDocsResult.value : [];
    
    // 검색된 문서가 없으면 스트리밍 형태로 기본 응답
    if (similarDocs.length === 0) {
      const fallback = '현재 시스템에 관련 정보가 등록되어 있지 않습니다. 프론트 데스크에 문의해주세요.';
      return new Response(fallback, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    // 2. 컨텍스트 구성
    let context = similarDocs.map((doc, index) => {
      return `[문서 ${index + 1}]\n${doc.metadata?.text || ''}`;
    }).join('\n\n');

    // --- 동적 운영 정보 (Operational Notices) 주입 ---
    if (noticesSnapshot.status === 'fulfilled' && noticesSnapshot.value) {
      const now = new Date();
      const activeNotices = noticesSnapshot.value.docs
        .map(doc => doc.data())
        .filter(notice => {
          if (notice.startDate && new Date(notice.startDate) > now) return false;
          if (notice.endDate && new Date(notice.endDate) < now) return false;
          return true;
        });

      if (activeNotices.length > 0) {
        const noticesText = activeNotices.map((n, i) => `- ${n.title}: ${n.content}`).join('\n');
        context = `[🚨 현재 리조트 긴급/운영 상황 (최우선 적용 사항)]\n${noticesText}\n\n[기본 시설/운영 정보]\n${context}`;
      }
    }

    // --- AI 페르소나 설정 ---
    let currentPersona = 'friendly';
    if (settingsDoc.status === 'fulfilled' && settingsDoc.value.exists) {
      currentPersona = settingsDoc.value.data()?.persona || 'friendly';
    }

    // 3. AI 모델에 스트리밍 요청
    const { generateAnswerStream } = await import('@/lib/gemini');
    const resultStream = await generateAnswerStream(question, context, currentPersona, language);

    // 4. 스트리밍 응답 설정 및 백그라운드 로깅
    const logRef = adminDb.collection('chat_logs').doc();
    const logId = logRef.id;

    const stream = new ReadableStream({
      async start(controller) {
        let fullAnswer = '';
        try {
          for await (const chunk of resultStream.stream) {
            const chunkText = chunk.text();
            fullAnswer += chunkText;
            controller.enqueue(new TextEncoder().encode(chunkText));
          }
          
          // AI 마크다운 후처리 (스트리밍 완료 후 DB 저장 시에만 적용)
          let cleanAnswer = fullAnswer.replace(/\*\*/g, '').replace(/^\s*\*\s/gm, '- ');

          // 백그라운드에서 로그 저장
          logRef.set({
            question,
            answer: cleanAnswer,
            contextUsed: similarDocs.map(d => d.id),
            ip: ip,
            timestamp: new Date().toISOString(),
          }).catch(err => console.error('Failed to save chat log:', err));

        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Log-Id': logId, // 프론트엔드에서 피드백 기능을 위해 헤더로 logId 전달
      }
    });

  } catch (error: unknown) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: 'Failed to generate answer' }, { status: 500 });
  }
}
