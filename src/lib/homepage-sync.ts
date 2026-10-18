import { adminDb } from '@/lib/firebase/admin';
import { upsertDocument, deleteDocument } from '@/lib/pinecone';

export const HOMEPAGE_CATALOG_API_URL =
  'https://belleforet-data.vercel.app/api/v6/leisure/pricing-catalog';

export interface BelleforetCatalogApiResponse {
  status: 'success' | 'error';
  data: BelleforetCatalogData;
}

export interface BelleforetCatalogData {
  /** 최근 크롤링 완료 시각 (ISO 8601 KST, 예: "2026-10-18T00:00:39.832+09:00") */
  lastUpdated: string;
  /** 데이터 출처 설명 */
  source: string;
  /** 크롤링 요약 메타데이터 */
  summary: {
    categories: Array<'golf' | 'room' | 'leisure' | 'dining'>;
    specialOffersCount: number;
    pmsPackagesCount: number;
    diningVenuesCount: number;
    golfVerified: boolean;
    safeguardActive: boolean;
  };
  /** 홈페이지 진행 중인 객실·레저 특가 프로모션 및 패키지 목록 */
  specialOffers: BelleforetSpecialOfferItem[];
  /** 블랙스톤 벨포레 CC 골프장 공식 요금 정보 */
  golfSnapshot: BelleforetGolfSnapshot;
  /** 리조트 내 12개 식음 영업장 운영시간·휴무일·연락처·공식링크 목록 */
  dining: BelleforetDiningVenueItem[];
  /** dining과 동일한 배열 (하위 호환용 별칭 필드) */
  diningVenues: BelleforetDiningVenueItem[];
  /** PMS 패키지 확장 배열 */
  pmsPackages: any[];
}

export interface BelleforetSpecialOfferItem {
  id: string;
  category: 'room' | 'leisure' | string;
  categoryLabel: string;
  title: string;
  normalizedName: string;
  desc: string;
  period: string;
  tags: string[];
  link: string;
}

export interface BelleforetGolfSnapshot {
  verified: boolean;
  facilityName: string;
  greenFeeWeekday: string;
  greenFeeWeekend: string;
  cartFee: string;
  caddieFee: string;
  lastChecked: string;
}

export interface BelleforetDiningVenueItem {
  venueName: string;
  rawName: string;
  normalizedName: string;
  closedDay: string;
  operatingHours: string;
  contact: string;
  officialUrl: string;
}

export interface HomepageSyncResult {
  skipped: boolean;
  reason?: string;
  catalogLastUpdated: string;
  syncedAt: string;
  stats: {
    golfUpdated: boolean;
    diningUpserted: number;
    offersUpserted: number;
    offersExpired: number;
  };
}

function normalizeKey(str: string): string {
  return (str || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[^a-zA-Z0-9가-힣]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * 패키지/프로모션 제목 비교용 정규화 함수
 * - 괄호 안에 상품 구분자(예: "(조식 2인 PKG)", "(썰매,햄버거PKG)")가 있으므로 일반 괄호는 유지하고,
 *   단순 수식어 괄호("(소인/대인)", "(리턴즈!)")와 대괄호("[BEST 재출시]")만 제거합니다.
 */
function normalizeOfferKey(str: string): string {
  return (str || '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\((소인\/대인|리턴즈!?)\)/g, '')
    .replace(/[^a-zA-Z0-9가-힣]/g, '')
    .toLowerCase()
    .trim();
}

function getKstDateString(date = new Date()): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

/**
 * 기존 설명문에서 이전 홈페이지 자동 동기화 블록을 제거하고 순수 상세 설명만 추출합니다.
 */
function stripHomepageBlock(desc: string): string {
  if (!desc) return '';
  return desc
    .replace(/\n*\[🌐 공식 홈페이지 실시간 운영 정보\][\s\S]*$/m, '')
    .trim();
}

/**
 * 벨포레 공식 홈페이지 크롤링 오픈 API를 조회합니다.
 */
export async function fetchBelleforetCatalog(): Promise<BelleforetCatalogData> {
  const res = await fetch(HOMEPAGE_CATALOG_API_URL, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`홈페이지 크롤링 API 호출 실패 (HTTP ${res.status})`);
  }

  const json = (await res.json()) as BelleforetCatalogApiResponse;
  if (json.status !== 'success' || !json.data) {
    throw new Error('홈페이지 크롤링 API 응답 포맷이 올바르지 않습니다.');
  }

  return json.data;
}

/**
 * 홈페이지 크롤링 데이터를 Firestore(facilities) 및 Pinecone 벡터 DB에 동기화합니다.
 */
export async function syncHomepageCatalogToDb(options?: {
  force?: boolean;
}): Promise<HomepageSyncResult> {
  const catalog = await fetchBelleforetCatalog();
  const syncDocRef = adminDb.doc('settings/homepage_sync');
  const syncSnap = await syncDocRef.get();
  const todayKst = getKstDateString();

  if (!options?.force && syncSnap.exists) {
    const prev = syncSnap.data()!;
    if (
      prev.catalogLastUpdated === catalog.lastUpdated &&
      prev.lastSyncedDateKst === todayKst
    ) {
      return {
        skipped: true,
        reason: '이미 오늘자 최신 홈페이지 크롤링 데이터와 동기화되어 있습니다.',
        catalogLastUpdated: catalog.lastUpdated,
        syncedAt: prev.syncedAt,
        stats: prev.stats || {
          golfUpdated: false,
          diningUpserted: 0,
          offersUpserted: 0,
          offersExpired: 0,
        },
      };
    }
  }

  // 전체 시설 목록 로드
  const facSnap = await adminDb.collection('facilities').get();
  const existingFacilities: Array<Record<string, any> & { id: string }> = facSnap.docs.map(d => ({
    id: d.id,
    ...(d.data() as Record<string, any>),
  }));

  let golfUpdated = false;
  let diningUpserted = 0;
  let offersUpserted = 0;
  let offersExpired = 0;

  // ---------------------------------------------------------------------------
  // 1. 블랙스톤 벨포레 CC (골프장) 동기화
  // ---------------------------------------------------------------------------
  if (catalog.golfSnapshot && catalog.golfSnapshot.verified) {
    const g = catalog.golfSnapshot;
    const existingGolf = existingFacilities.find(
      f =>
        f.homepageSourceType === 'golf' ||
        normalizeKey(f.name).includes('블랙스톤') ||
        normalizeKey(f.name).includes('벨포레cc') ||
        normalizeKey(f.name) === '골프장'
    );

    const golfName = g.facilityName || '블랙스톤 벨포레 CC';
    const baseDesc = existingGolf ? stripHomepageBlock(existingGolf.description || '') : '';
    const golfBlock = `[🌐 공식 홈페이지 실시간 운영 정보]
- 시설명: ${golfName}
- 주중 그린피: ${g.greenFeeWeekday}
- 주말 그린피: ${g.greenFeeWeekend}
- 카트비: ${g.cartFee}
- 캐디피: ${g.caddieFee}
- 공식 요금 기준일: ${g.lastChecked ? g.lastChecked.split('T')[0] : todayKst}`;

    const finalGolfDesc = baseDesc ? `${baseDesc}\n\n${golfBlock}` : golfBlock;
    const golfTags = Array.from(
      new Set([
        ...(Array.isArray(existingGolf?.tags) ? existingGolf.tags : []),
        '골프장',
        '블랙스톤',
        '벨포레CC',
        '그린피',
        '카트비',
        '캐디피',
      ])
    );

    const golfRef = existingGolf
      ? adminDb.collection('facilities').doc(existingGolf.id)
      : adminDb.collection('facilities').doc();

    const golfData: Record<string, any> = {
      name: golfName,
      category: existingGolf?.category || '레저',
      location: existingGolf?.location || '블랙스톤 벨포레 클럽하우스',
      description: finalGolfDesc,
      seasonalDescription: existingGolf?.seasonalDescription || '',
      tags: golfTags,
      status: 'approved',
      type: 'facility',
      homepageSourceType: 'golf',
      homepageSyncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!existingGolf) golfData.createdAt = new Date().toISOString();

    if (!existingGolf || existingGolf.description !== finalGolfDesc) {
      await golfRef.set(golfData, { merge: true });
      const vecText = `시설명: ${golfName}\n카테고리: ${golfData.category}\n위치: ${golfData.location}\n설명: ${finalGolfDesc}\n태그: ${golfTags.join(', ')}`;
      await upsertDocument({
        id: golfRef.id,
        text: vecText,
        metadata: { type: 'facility', name: golfName, category: golfData.category },
      });
      golfUpdated = true;
    }
  }

  // ---------------------------------------------------------------------------
  // 2. 식음 매장 12곳 (diningVenues) 동기화
  // ---------------------------------------------------------------------------
  const diningList = catalog.diningVenues || catalog.dining || [];
  for (const venue of diningList) {
    const normVenue = normalizeKey(venue.venueName);
    const normRaw = normalizeKey(venue.rawName);
    // "BHC 치킨" -> "bhc", "CU 편의점" -> "cu" 매칭 호환
    const shortKey = normVenue.replace(/(치킨|편의점|인벨포레)$/g, '');

    const existingVenue = existingFacilities.find(f => {
      if (f.homepageVenueName && f.homepageVenueName === venue.venueName) return true;
      const fNorm = normalizeKey(f.name);
      if (!fNorm) return false;
      if (fNorm === normVenue || fNorm === normRaw) return true;
      if (shortKey.length >= 2 && fNorm === shortKey) return true;
      return false;
    });

    const baseDesc = existingVenue ? stripHomepageBlock(existingVenue.description || '') : '';
    const diningBlock = `[🌐 공식 홈페이지 실시간 운영 정보]
- 매장명: ${venue.venueName} (${venue.rawName})
- 운영시간: ${venue.operatingHours}
- 휴무일: ${venue.closedDay}
- 대표 연락처(전화번호): ${venue.contact}
- 공식 안내 페이지: ${venue.officialUrl}`;

    const finalDesc = baseDesc ? `${baseDesc}\n\n${diningBlock}` : diningBlock;
    const defaultCat = venue.venueName.includes('편의점') ? '편의' : '식음';
    const venueCategory = existingVenue?.category || defaultCat;
    const venueName = existingVenue?.name || venue.venueName;
    const venueTags = Array.from(
      new Set([
        ...(Array.isArray(existingVenue?.tags) ? existingVenue.tags : []),
        venue.venueName,
        '식당',
        '식음',
        '운영시간',
        '휴무일',
        '전화번호',
      ])
    );

    const docRef = existingVenue
      ? adminDb.collection('facilities').doc(existingVenue.id)
      : adminDb.collection('facilities').doc();

    const venueData: Record<string, any> = {
      name: venueName,
      category: venueCategory,
      location: existingVenue?.location || '',
      description: finalDesc,
      seasonalDescription: existingVenue?.seasonalDescription || '',
      tags: venueTags,
      status: 'approved',
      type: 'facility',
      homepageSourceType: 'dining',
      homepageVenueName: venue.venueName,
      homepageSyncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!existingVenue) venueData.createdAt = new Date().toISOString();

    if (!existingVenue || existingVenue.description !== finalDesc || existingVenue.status !== 'approved') {
      await docRef.set(venueData, { merge: true });
      let vecText = `시설명: ${venueName}\n카테고리: ${venueCategory}\n위치: ${venueData.location}\n설명: ${finalDesc}\n`;
      if (venueData.seasonalDescription) {
        vecText += `시즌/임시안내: ${venueData.seasonalDescription}\n`;
      }
      vecText += `태그: ${venueTags.join(', ')}`;

      await upsertDocument({
        id: docRef.id,
        text: vecText,
        metadata: { type: 'facility', name: venueName, category: venueCategory },
      });
      diningUpserted++;
    }
  }

  // ---------------------------------------------------------------------------
  // 3. 특가 패키지 및 프로모션 (specialOffers) 동기화 및 종료 패키지 자동 만료
  // ---------------------------------------------------------------------------
  const activeOfferIds = new Set<string>();
  const matchedFacilityIds = new Set<string>();

  for (const offer of catalog.specialOffers || []) {
    // 기간 만료 여부 확인 (예: "2026-04-24 ~ 2026-11-30")
    const dateMatches = (offer.period || '').match(/202\d-\d{2}-\d{2}/g);
    const endDate = dateMatches && dateMatches.length > 0 ? dateMatches[dateMatches.length - 1] : null;
    if (endDate && endDate < todayKst) {
      continue; // 이미 기간이 끝난 상품은 건너뜀
    }

    activeOfferIds.add(String(offer.id));
    const normTitle = normalizeOfferKey(offer.title);

    const existingOffer = existingFacilities.find(f => {
      if (matchedFacilityIds.has(f.id)) return false;
      if (f.homepageOfferId && String(f.homepageOfferId) === String(offer.id)) return true;
      const fOfferNorm = normalizeOfferKey(f.name);
      if (!fOfferNorm) return false;
      if (fOfferNorm === normTitle) return true;
      // "패밀리 올데이 5종 패스" <-> "패밀리 올데이 5종 통합 패키지 (소인/대인)" 매칭
      if (
        normTitle.startsWith('패밀리올데이5종') &&
        fOfferNorm.startsWith('패밀리올데이5종')
      ) {
        return true;
      }
      return false;
    });

    const baseDesc = existingOffer ? stripHomepageBlock(existingOffer.description || '') : '';
    const cleanOfferTags = (offer.tags || []).map(t => t.replace(/^#/, '').trim()).filter(Boolean);

    const offerBlock = `[🌐 공식 홈페이지 실시간 운영 정보]
- 프로모션/패키지명: ${offer.title}
- 분류: ${offer.categoryLabel || (offer.category === 'room' ? '객실 패키지' : '레저 패키지')}
- 운영 및 판매 기간: ${offer.period}
- 주요 구성 및 혜택: ${(offer.desc || '').replace(/\r\n/g, '\n')}
- 상세 및 예약 링크: ${offer.link}`;

    const finalDesc = baseDesc ? `${baseDesc}\n\n${offerBlock}` : offerBlock;
    const offerCategory =
      existingOffer?.category || (offer.category === 'room' ? '숙박' : '레저');
    const offerName = existingOffer?.name || offer.title.trim();
    const mergedTags = Array.from(
      new Set([
        ...(Array.isArray(existingOffer?.tags) ? existingOffer.tags : []),
        ...cleanOfferTags,
        '패키지',
        '프로모션',
      ])
    );

    const docRef = existingOffer
      ? adminDb.collection('facilities').doc(existingOffer.id)
      : adminDb.collection('facilities').doc();

    matchedFacilityIds.add(docRef.id);

    const offerData: Record<string, any> = {
      name: offerName,
      category: offerCategory,
      location: existingOffer?.location || '벨포레 리조트 공식 홈페이지',
      description: finalDesc,
      seasonalDescription: `운영 기간: ${offer.period}`,
      tags: mergedTags,
      status: 'approved',
      type: 'facility',
      homepageSourceType: 'specialOffer',
      homepageOfferId: String(offer.id),
      homepagePeriod: offer.period,
      homepageLink: offer.link,
      homepageSyncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!existingOffer) offerData.createdAt = new Date().toISOString();

    if (
      !existingOffer ||
      existingOffer.description !== finalDesc ||
      existingOffer.status !== 'approved' ||
      existingOffer.name !== offerName
    ) {
      await docRef.set(offerData, { merge: true });
      const vecText = `시설명: ${offerName}\n카테고리: ${offerCategory}\n위치: ${offerData.location}\n설명: ${finalDesc}\n시즌/임시안내: ${offerData.seasonalDescription}\n태그: ${mergedTags.join(', ')}`;
      await upsertDocument({
        id: docRef.id,
        text: vecText,
        metadata: { type: 'facility', name: offerName, category: offerCategory },
      });
      offersUpserted++;
    }
  }

  // 홈페이지에서 내려갔거나 기간이 종료된 이전 홈페이지 패키지 자동 만료 처리
  for (const fac of existingFacilities) {
    if (
      fac.status === 'approved' &&
      fac.homepageSourceType === 'specialOffer' &&
      fac.homepageOfferId &&
      !activeOfferIds.has(String(fac.homepageOfferId)) &&
      !matchedFacilityIds.has(fac.id)
    ) {
      await adminDb.collection('facilities').doc(fac.id).update({
        status: 'expired',
        seasonalDescription: '',
        updatedAt: new Date().toISOString(),
      });
      await deleteDocument(fac.id);
      offersExpired++;
    }
  }

  const syncedAt = new Date().toISOString();
  const stats = {
    golfUpdated,
    diningUpserted,
    offersUpserted,
    offersExpired,
  };

  await syncDocRef.set(
    {
      catalogLastUpdated: catalog.lastUpdated,
      source: catalog.source,
      lastSyncedDateKst: todayKst,
      syncedAt,
      summary: catalog.summary,
      stats,
    },
    { merge: true }
  );

  return {
    skipped: false,
    catalogLastUpdated: catalog.lastUpdated,
    syncedAt,
    stats,
  };
}

/**
 * 매일 아침(06:00 KST 이후) 첫 요청 시 백그라운드에서 자동으로 홈페이지 동기화를 트리거합니다.
 */
let inMemoryLastCheckedDateKst = '';
let isSyncInProgress = false;

export function triggerDailyHomepageSyncIfNeeded() {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayKst = nowKst.toISOString().split('T')[0];
  const hourKst = nowKst.getUTCHours();

  // 자정 크롤러(00:00:40 KST) 완료 후 아침 06시 이후부터 당일 1회 자동 실행
  if (hourKst < 1) return;
  if (inMemoryLastCheckedDateKst === todayKst || isSyncInProgress) return;

  isSyncInProgress = true;
  syncHomepageCatalogToDb({ force: false })
    .then(res => {
      inMemoryLastCheckedDateKst = todayKst;
      if (!res.skipped) {
        console.log('[Auto Homepage Sync] 일일 홈페이지 크롤링 자동 동기화 완료:', res.stats);
      }
    })
    .catch(err => {
      console.error('[Auto Homepage Sync] 오류:', err);
    })
    .finally(() => {
      isSyncInProgress = false;
    });
}
