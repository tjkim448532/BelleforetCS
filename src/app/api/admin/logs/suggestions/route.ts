import { NextResponse } from 'next/server';
import { adminDb, verifyAdminSession } from '@/lib/firebase/admin';
import { analyzeFailedLogs } from '@/lib/gemini';

export async function GET(req: Request) {
  try {
    // 1. 관리자 인증 체크 (보안 취약점 패치)
    await verifyAdminSession(req);

    // 2. 실패한 로그 수집 (메모리 최적화 OOM 방지)
    // 필요한 필드만 select 하여 페이로드 크기를 대폭 절감
    const snapshot = await adminDb.collection('chat_logs')
      .select('question', 'answer', 'feedback')
      .orderBy('timestamp', 'desc')
      .limit(150)
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
    if (error.message === 'Unauthorized' || error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
      return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }
    console.error('Error generating log suggestions:', error);
    return NextResponse.json({ error: error.message || '오답 분석 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
