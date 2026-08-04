import { NextResponse } from 'next/server';
import { querySimilarDocuments } from '@/lib/pinecone';
import { generateAnswer } from '@/lib/gemini';
import { adminDb } from '@/lib/firebase/admin';
import * as admin from 'firebase-admin';

let cachedNotices: any = null;
let cachedSettings: any = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 60 seconds

export async function POST(req: Request) {
  try {
    const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const ip = rawIp.trim();
    const nowMs = Date.now();
    
    // --- Firestore 기반 Rate Limiting (도배 방지) 병렬 처리용 프로미스 ---
    const rateLimitPromise = (async () => {
      if (ip !== 'unknown') {
        const sanitizedIp = ip.replace(/[^a-zA-Z0-9]/g, '_');
        const rateLimitRef = adminDb.collection('rate_limits').doc(sanitizedIp);
        const doc = await rateLimitRef.get();
        if (!doc.exists) {
          await rateLimitRef.set({ count: 1, resetTime: nowMs + 60000 });
        } else {
          const data = doc.data()!;
          if (nowMs < data.resetTime) {
            if (data.count >= 15) throw new Error('RATE_LIMIT_EXCEEDED');
            // 비동기로 카운트 증가 (Transaction Lock 제거로 병목 현상 해소)
            rateLimitRef.set({ count: admin.firestore.FieldValue.increment(1) }, { merge: true }).catch(console.error);
          } else {
            await rateLimitRef.set({ count: 1, resetTime: nowMs + 60000 });
          }
        }
      }
    })();

    const data = await req.json();
    const { question, language = 'ko', history = [] } = data;

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // --- 동의어 처리 (Synonym Dictionary) ---
    // 사용자가 자주 사용하는 줄임말을 공식 명칭으로 변환하여 검색 정확도를 높입니다.
    const synonymMap: Record<string, string> = {
      "목장": "벨포레 목장",
      "미디어": "미디어아트센터",
      "아트센터": "미디어아트센터",
      "루지": "익스트림 루지",
      "콘도": "벨포레 리조트",
      "수영장": "원더풀",
      "사계절썰매": "사계절 썰매장",
      "썰매장": "사계절 썰매장",
      "놀이공원": "놀이동산"
    };

    let processedQuestion = question;
    Object.entries(synonymMap).forEach(([shortName, fullName]) => {
      // 입력된 질문에 줄임말이 포함되어 있으면 치환
      const regex = new RegExp(shortName, 'g'); 
      processedQuestion = processedQuestion.replace(regex, fullName);
    });

    // Pinecone 검색 정확도를 높이기 위해 이전 사용자의 질문을 덧붙임
    let pineconeQuery = processedQuestion;
    if (history && history.length > 0) {
      const lastUserMessage = [...history].reverse().find((m: any) => m.role === 'user');
      if (lastUserMessage) {
        let lastQ = lastUserMessage.content;
        Object.entries(synonymMap).forEach(([shortName, fullName]) => {
          const regex = new RegExp(shortName, 'g');
          lastQ = lastQ.replace(regex, fullName);
        });
        pineconeQuery = `${lastQ} ${processedQuestion}`;
      }
    }

    // 1. 병렬로 검색 및 설정 정보, 도배 방지 검사 가져오기 (속도 최적화)
    // AI 답변 생성을 위한 질문은 원본(question)을 유지하되, DB 검색용 질문은 치환된 질문(processedQuestion)을 사용
    let noticesPromise: any;
    let settingsPromise: any;

    if (nowMs - cacheTimestamp < CACHE_TTL && cachedNotices && cachedSettings) {
      noticesPromise = Promise.resolve(cachedNotices);
      settingsPromise = Promise.resolve(cachedSettings);
    } else {
      noticesPromise = adminDb.collection('operational_notices').where('isActive', '==', true).get().then(res => {
        cachedNotices = res;
        cacheTimestamp = Date.now();
        return res;
      });
      settingsPromise = adminDb.collection('settings').doc('system').get().then(res => {
        cachedSettings = res;
        return res;
      });
    }

    const [similarDocsResult, noticesSnapshot, settingsDoc, rateLimitResult] = await Promise.allSettled([
      querySimilarDocuments(pineconeQuery, 3),
      noticesPromise,
      settingsPromise,
      rateLimitPromise
    ]);

    if (rateLimitResult.status === 'rejected' && rateLimitResult.reason.message === 'RATE_LIMIT_EXCEEDED') {
      console.warn(`Rate limit exceeded for IP: ${ip}`);
      return NextResponse.json({ 
        answer: '너무 많은 질문을 연속으로 하셨습니다. 1분 후 다시 시도해주세요.' 
      }, { status: 429 });
    }

    if (similarDocsResult.status === 'rejected') {
      console.error('Pinecone search failed:', similarDocsResult.reason);
      return new Response('시스템 내부 일시적 오류로 인해 정보를 찾을 수 없습니다. 프론트 데스크에 문의해주세요.', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    const similarDocs = similarDocsResult.value;
    
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
        .map((doc: any) => doc.data())
        .filter((notice: any) => {
          if (notice.startDate && new Date(notice.startDate) > now) return false;
          if (notice.endDate && new Date(notice.endDate) < now) return false;
          return true;
        })
        .sort((a: any, b: any) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        })
        .slice(0, 5);

      if (activeNotices.length > 0) {
        const noticesText = activeNotices.map((n: any, i: any) => `- ${n.title}: ${n.content}`).join('\n');
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
    const resultStream = await generateAnswerStream(question, context, currentPersona, language, history);

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

          controller.close();
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
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
    return NextResponse.json({ error: 'Failed to generate answer', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
