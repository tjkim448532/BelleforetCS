import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { analyzeFailedLogs } from '@/lib/gemini';

export async function GET(req: Request) {
  try {
    // 1. 관리자 인증 체크
    const sessionCookie = req.headers.get('cookie')?.split('__session=')[1]?.split(';')[0];
    if (!sessionCookie) {
      return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }
    await adminAuth.verifySessionCookie(sessionCookie, true);

    // 2. 실패한 로그 수집
    // 복합 쿼리 대신 전체 최근 로그(예: 300개)를 가져와서 메모리에서 필터링합니다. 
    // (Firestore 복합 인덱스 생성 대기 시간을 피하기 위함)
    const snapshot = await adminDb.collection('chat_logs')
      .orderBy('timestamp', 'desc')
      .limit(300)
      .get();

    const failedLogs = snapshot.docs.map(doc => doc.data()).filter(log => {
      // 피드백이 명시적으로 'down'이거나
      if (log.feedback === 'down') return true;
      // 대답을 회피한 경우 (데이터 없음)
      if (log.answer && log.answer.includes('프론트 데스크에 문의')) return true;
      return false;
    });

    if (failedLogs.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // AI 토큰 한도를 위해 최대 50개까지만 잘라서 전달
    const logsToAnalyze = failedLogs.slice(0, 50).map(log => ({
      question: log.question,
      answer: log.answer,
      feedback: log.feedback
    }));

    // 3. AI 분석 실행
    const suggestions = await analyzeFailedLogs(logsToAnalyze);

    return NextResponse.json({ suggestions });
  } catch (error: any) {
    console.error('Error generating log suggestions:', error);
    return NextResponse.json({ error: error.message || '오답 분석 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
