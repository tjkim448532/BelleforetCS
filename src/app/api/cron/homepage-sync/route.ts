import { NextResponse } from 'next/server';
import { syncHomepageCatalogToDb } from '@/lib/homepage-sync';

export const dynamic = 'force-dynamic';

/**
 * 매일 아침(예: 06:00 / 08:00 KST) 자동 호출되는 홈페이지 크롤링 데이터 동기화 엔드포인트
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get('force') === 'true';

    const result = await syncHomepageCatalogToDb({ force });

    return NextResponse.json({
      status: 'success',
      ...result,
    });
  } catch (error: any) {
    console.error('[Cron Homepage Sync] Error:', error);
    return NextResponse.json(
      { status: 'error', error: error.message || '동기화 실패' },
      { status: 500 }
    );
  }
}
