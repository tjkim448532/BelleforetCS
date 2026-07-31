import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

// 캐싱 활성화 (60초 단위 정적 재생성 ISR)
export const revalidate = 60;

export async function GET() {
  try {
    // 모든 승인된 시설 데이터를 가져온 뒤, seasonalDescription이 있는 것만 필터링합니다.
    // (Firestore 인덱스를 추가로 만들지 않기 위해 메모리 필터링 사용)
    const snapshot = await adminDb.collection('facilities')
      .where('status', '==', 'approved')
      .get();
      
    const notices: Array<{
      id: string;
      name: string;
      category: string;
      seasonalDescription: string;
    }> = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.seasonalDescription && data.seasonalDescription.trim() !== '') {
        notices.push({
          id: doc.id,
          name: data.name,
          category: data.category,
          seasonalDescription: data.seasonalDescription.trim()
        });
      }
    });

    return NextResponse.json(notices);
  } catch (error: any) {
    console.error('Error fetching seasonal notices:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
