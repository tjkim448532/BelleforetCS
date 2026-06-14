import { NextResponse } from 'next/server';
import { adminDb, verifyAdminSession } from '@/lib/firebase/admin';

export async function GET(req: Request) {
  try {
    // 1. 인증 체크
    await verifyAdminSession(req);

    // 2. 최근 채팅 로그 1000개 가져오기 (메모리 필터링 방식)
    const snapshot = await adminDb.collection('chat_logs')
      .orderBy('timestamp', 'desc')
      .limit(1000)
      .get();
      
    const failedLogs: Record<string, any> = {};

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const answer = data.answer || '';
      const question = data.question || '';
      
      // 답변 실패 키워드 검사
      const isFailed = 
        answer.includes('프론트 데스크에 문의해주세요') || 
        answer.includes('제공된 정보만으로는') ||
        answer.includes('contact the front desk');

      if (isFailed && question) {
        // 중복 질문 제거 로직: 완전히 동일한 질문이거나 매우 유사한 경우 하나로 합침
        // 띄어쓰기, 특수문자 제거 후 키로 사용
        const normalizedQ = question.replace(/[\s\?\.\!\,\~]/g, '');
        if (!failedLogs[normalizedQ] && normalizedQ.length > 2) {
          failedLogs[normalizedQ] = {
            originalQuestion: question,
            timestamp: data.timestamp
          };
        }
      }
    });

    const failedQuestionsList = Object.values(failedLogs);

    if (failedQuestionsList.length === 0) {
      return NextResponse.json({ error: '최근 1000건의 대화 중 답변에 실패한 질문이 없습니다.' }, { status: 404 });
    }

    // 3. 오늘 날짜 생성 (한국 시간 기준)
    const now = new Date();
    const kstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const currentDateStr = kstDate.toISOString().slice(0, 10);

    // 4. 검수용 구글 시트 포맷 헤더 지정 (일괄 업로드 완벽 호환)
    const headers = [
      '시설명', // 질문이 여기에 들어감
      '카테고리', // 기본 'FAQ'
      '위치', // 공란
      '기존 설명 (원본)', // '미답변'
      '✏️ 이번 달 수정할 설명 (작성)', // 여기에 정답 작성
      '태그', // 추출 키워드
      '👥 담당 부서',
      '✅ 검수 완료'
    ];

    // 5. CSV 안전 이스케이프 함수
    const escapeCsv = (str: any) => {
      if (str === null || str === undefined) return '""';
      const text = String(str).replace(/"/g, '""');
      return `"${text}"`;
    };

    // 6. CSV 컨텐츠 조립
    let csvContent = headers.join(',') + '\n';

    // 최신 실패 질문 순으로 정렬 (하지만 이미 orderBy desc 라 어느정도 정렬됨)
    failedQuestionsList.forEach(log => {
      // 태그 자동 생성: 명사나 주요 키워드 추출용 (간단히 띄어쓰기로 분리 후 2글자 이상 단어)
      const tags = log.originalQuestion
        .split(/\s+/)
        .filter((word: string) => word.length >= 2)
        .join(', ');

      const row = [
        escapeCsv(log.originalQuestion), // 시설명: 원본 질문
        escapeCsv('FAQ'),                // 카테고리: FAQ 고정
        '""',                            // 위치: 빈칸
        escapeCsv('[미답변 질문]'),       // 기존 설명: 가이드
        '""',                            // 이번 달 수정할 설명 (빈칸 - 관리자 작성칸)
        escapeCsv(tags),                 // 태그: 질문 키워드
        '""',                            // 담당 부서 (빈칸)
        '""'                             // 검수 완료 (빈칸)
      ];
      csvContent += row.join(',') + '\n';
    });

    // 7. 응답 (BOM 포함 CSV 텍스트 반환)
    return new NextResponse('\uFEFF' + csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="unanswered_questions_${currentDateStr}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('Export Failed Logs Error:', error);
    
    // Auth 에러 처리
    if (error?.message === 'Unauthorized' || error?.code?.startsWith('auth/')) {
      return NextResponse.json({ error: '인증되지 않은 사용자입니다. 다시 로그인해주세요.' }, { status: 401 });
    }
    
    return NextResponse.json({ error: error.message || '미답변 내역 추출 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
