import { NextResponse } from 'next/server';
import { adminDb, verifyAdminSession } from '@/lib/firebase/admin';

const SETTINGS_DOC = 'settings/facility_categories';
const DEFAULT_CATEGORIES = ['레저', '숙박', '식음', '기타'];

export async function GET(req: Request) {
  try {
    await verifyAdminSession(req);
    const docRef = adminDb.doc(SETTINGS_DOC);
    const docSnap = await docRef.get();
    
    let categories = DEFAULT_CATEGORIES;
    if (docSnap.exists) {
      categories = docSnap.data()?.list || DEFAULT_CATEGORIES;
    } else {
      // Initialize if not exists
      await docRef.set({ list: DEFAULT_CATEGORIES });
    }
    
    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Categories GET error:', error);
    return NextResponse.json({ error: '카테고리를 불러오는 데 실패했습니다.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await verifyAdminSession(req);
    const { action, category, oldCategory, newCategory } = await req.json();
    
    const docRef = adminDb.doc(SETTINGS_DOC);
    const docSnap = await docRef.get();
    let categories: string[] = docSnap.exists ? (docSnap.data()?.list || DEFAULT_CATEGORIES) : DEFAULT_CATEGORIES;

    if (action === 'add') {
      if (!category) return NextResponse.json({ error: '카테고리 이름이 필요합니다.' }, { status: 400 });
      if (categories.includes(category)) {
        return NextResponse.json({ error: '이미 존재하는 카테고리입니다.' }, { status: 400 });
      }
      categories.push(category);
      await docRef.set({ list: categories }, { merge: true });
      return NextResponse.json({ success: true, categories });
      
    } else if (action === 'update') {
      if (!oldCategory || !newCategory) return NextResponse.json({ error: '기존 카테고리와 새 카테고리 이름이 필요합니다.' }, { status: 400 });
      
      // Update list
      categories = categories.map(c => c === oldCategory ? newCategory : c);
      await docRef.set({ list: categories }, { merge: true });
      
      // Batch update facilities that have oldCategory
      const facilitiesRef = adminDb.collection('facilities');
      const q = facilitiesRef.where('category', '==', oldCategory);
      const snapshot = await q.get();
      
      if (!snapshot.empty) {
        const batch = adminDb.batch();
        snapshot.docs.forEach(doc => {
          batch.update(doc.ref, { category: newCategory });
        });
        await batch.commit();
      }
      
      return NextResponse.json({ success: true, categories, updatedCount: snapshot.size });
      
    } else if (action === 'delete') {
      if (!category) return NextResponse.json({ error: '삭제할 카테고리 이름이 필요합니다.' }, { status: 400 });
      
      categories = categories.filter(c => c !== category);
      await docRef.set({ list: categories }, { merge: true });
      return NextResponse.json({ success: true, categories });
      
    } else {
      return NextResponse.json({ error: '잘못된 액션입니다.' }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Categories POST error:', error);
    return NextResponse.json({ error: '카테고리 처리에 실패했습니다.' }, { status: 500 });
  }
}
