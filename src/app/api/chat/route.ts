import { NextResponse } from 'next/server';
import { querySimilarDocuments } from '@/lib/pinecone';
import { generateAnswer } from '@/lib/gemini';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(req: Request) {
  try {
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

    // (선택 사항) 관련 시설의 운영 시간이나 가격 정보를 Firestore에서 추가로 가져올 수도 있습니다.
    // 여기서는 벡터에 포함된 text 기반으로만 응답을 생성합니다.

    // 3. AI 모델에 컨텍스트와 질문 전달하여 응답 생성
    const answer = await generateAnswer(question, context);

    // 4. 질문 로그 저장 (데이터 분석용)
    await adminDb.collection('chat_logs').add({
      question,
      answer,
      contextUsed: similarDocs.map(d => d.id),
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ answer, contextUsed: similarDocs });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: 'Failed to generate answer' }, { status: 500 });
  }
}
