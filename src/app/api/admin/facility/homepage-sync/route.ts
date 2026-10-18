import { NextResponse } from 'next/server';
import { adminDb, verifyAdminSession } from '@/lib/firebase/admin';
import {
  fetchBelleforetCatalog,
  syncHomepageCatalogToDb,
} from '@/lib/homepage-sync';

export async function GET(req: Request) {
  try {
    await verifyAdminSession(req);

    const [catalog, syncSnap] = await Promise.all([
      fetchBelleforetCatalog(),
      adminDb.doc('settings/homepage_sync').get(),
    ]);

    const syncHistory = syncSnap.exists ? syncSnap.data() : null;

    const catalogInfo = {
      lastUpdated: catalog.lastUpdated,
      source: catalog.source,
      summary: catalog.summary,
      specialOffersCount: catalog.specialOffers?.length || 0,
      diningVenuesCount: (catalog.diningVenues || catalog.dining || []).length,
      golfFacility: catalog.golfSnapshot?.facilityName || '블랙스톤 벨포레 CC',
      golfVerified: Boolean(catalog.golfSnapshot?.verified),
    };

    return NextResponse.json({
      status: 'success',
      catalog: catalogInfo,
      catalogPreview: catalogInfo,
      syncHistory,
      syncStatus: syncHistory
        ? {
            ...syncHistory,
            ...(syncHistory.stats || {}),
          }
        : null,
      isUpToDate: Boolean(
        syncHistory && syncHistory.catalogLastUpdated === catalog.lastUpdated
      ),
    });
  } catch (error: any) {
    console.error('Homepage Sync GET Error:', error);
    return NextResponse.json(
      { error: error.message || '홈페이지 연동 상태 조회 실패' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await verifyAdminSession(req);
    const body = await req.json().catch(() => ({}));
    const force = body.force !== false;

    const syncRes = await syncHomepageCatalogToDb({ force });

    return NextResponse.json({
      success: true,
      result: {
        ...syncRes,
        golfUpdated: syncRes.stats.golfUpdated ? 1 : 0,
        diningUpserted: syncRes.stats.diningUpserted,
        offersUpserted: syncRes.stats.offersUpserted,
        offersExpired: syncRes.stats.offersExpired,
      },
    });
  } catch (error: any) {
    console.error('Homepage Sync POST Error:', error);
    return NextResponse.json(
      { error: error.message || '홈페이지 데이터 동기화 실패' },
      { status: 500 }
    );
  }
}
