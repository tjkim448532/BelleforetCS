import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { generateBibleCSV } from '@/lib/gemini';

export async function GET(req: Request) {
  try {
    // 1. 인증 체크
    const sessionCookie = req.headers.get('cookie')?.split('__session=')[1]?.split(';')[0];
    if (!sessionCookie) {
      return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }
    await adminAuth.verifySessionCookie(sessionCookie, true);

    // 2. 전체 시설 데이터 가져오기
    const snapshot = await adminDb.collection('facilities').get();
    const facilities = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        name: data.name,
        category: data.category,
        location: data.location,
        description: data.description,
        tags: data.tags
      };
    });

    if (facilities.length === 0) {
      return NextResponse.json({ error: '등록된 시설 데이터가 없습니다.' }, { status: 404 });
    }

    // 3. 오늘 날짜 생성 (한국 시간 기준)
    const now = new Date();
    const kstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const currentDateStr = `${kstDate.getFullYear()}년 ${kstDate.getMonth() + 1}월 ${kstDate.getDate()}일`;

    // 4. AI를 통해 백서 CSV 생성
    const csvContent = await generateBibleCSV(facilities, currentDateStr);

    // 5. 응답 (CSV 텍스트 반환)
    return new NextResponse('\uFEFF' + csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="belleforet_bible_${kstDate.toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('Export Bible Error:', error);
    return NextResponse.json({ error: error.message || '백서 추출 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
