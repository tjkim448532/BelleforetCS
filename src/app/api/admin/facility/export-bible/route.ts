import { NextResponse } from 'next/server';
import { adminDb, verifyAdminSession } from '@/lib/firebase/admin';

export async function GET(req: Request) {
  try {
    // 1. 인증 체크
    await verifyAdminSession(req);

    // 2. 전체 시설 데이터 가져오기
    const snapshot = await adminDb.collection('facilities').get();
    const facilities = snapshot.docs.map(doc => doc.data());

    if (facilities.length === 0) {
      return NextResponse.json({ error: '등록된 시설 데이터가 없습니다.' }, { status: 404 });
    }

    // 3. 오늘 날짜 생성 (한국 시간 기준)
    const now = new Date();
    const kstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const currentDateStr = kstDate.toISOString().slice(0, 10);

    // 4. 검수용 구글 시트 포맷 헤더 지정
    const headers = [
      '시설명',
      '카테고리',
      '위치',
      '기존 설명 (원본)',
      '✏️ 이번 달 수정할 설명 (작성)',
      '태그',
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

    facilities.forEach(facility => {
      const row = [
        escapeCsv(facility.name),
        escapeCsv(facility.category),
        escapeCsv(facility.location),
        escapeCsv(facility.description), // 기존 설명 (원본 손실 없이 100% 그대로)
        '""',                            // 이번 달 수정할 설명 (빈칸)
        escapeCsv((facility.tags || []).join(', ')), // 태그
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
        'Content-Disposition': `attachment; filename="belleforet_golden_record_${currentDateStr}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('Export Bible Error:', error);
    
    // Auth 에러 처리
    if (error?.message === 'Unauthorized' || error?.code?.startsWith('auth/')) {
      return NextResponse.json({ error: '인증되지 않은 사용자입니다. 다시 로그인해주세요.' }, { status: 401 });
    }
    
    return NextResponse.json({ error: error.message || '백서 추출 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
