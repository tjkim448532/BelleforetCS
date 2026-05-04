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
    const { question } = data;

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // 1. Vector DB에서 관련 문서 검색
    const similarDocs = await querySimilarDocuments(question, 3);
    
    // 검색된 문서가 없으면 기본 응답
    if (similarDocs.length === 0) {
      return NextResponse.json({ 
        answer: '현재 시스템에 관련 정보가 등록되어 있지 않습니다. 프론트 데스크에 문의해주세요.' 
      });
    }

    // 2. 컨텍스트 구성 (검색된 벡터 데이터의 메타데이터 활용)
    let context = similarDocs.map((doc, index) => {
      return `[문서 ${index + 1}]\n${doc.metadata?.text || ''}`;
    }).join('\n\n');

    // --- 동적 운영 정보 (Operational Notices) 주입 ---
    try {
      const now = new Date();
      const noticesSnapshot = await adminDb.collection('operational_notices')
        .where('isActive', '==', true)
        .get();

      const activeNotices = noticesSnapshot.docs
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
    } catch (noticeError) {
      console.error('Error fetching operational notices:', noticeError);
      // 공지사항 로드 실패 시 무시하고 진행
    }
    // ------------------------------------------------

    // --- AI 페르소나 설정 가져오기 ---
    let currentPersona = 'friendly';
    try {
      const settingsDoc = await adminDb.collection('settings').doc('system').get();
      if (settingsDoc.exists) {
        currentPersona = settingsDoc.data()?.persona || 'friendly';
      }
    } catch (e) {
      console.error('Failed to fetch persona settings', e);
    }

    // 3. AI 모델에 컨텍스트, 질문, 페르소나 전달하여 응답 생성
    const answer = await generateAnswer(question, context, currentPersona);

    // 4. 질문 로그 저장 (데이터 분석용) - 사용자 응답 지연을 막기 위해 비동기로 처리
    const logRef = adminDb.collection('chat_logs').doc();
    const logId = logRef.id;
    
    logRef.set({
      question,
      answer,
      contextUsed: similarDocs.map(d => d.id),
      ip: ip, // IP 로깅 추가
      timestamp: new Date().toISOString(),
    }).catch(error => {
      console.error('Failed to save chat log in background:', error);
    });

    return NextResponse.json({ answer, contextUsed: similarDocs, logId });
  } catch (error: unknown) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: 'Failed to generate answer' }, { status: 500 });
  }
}
