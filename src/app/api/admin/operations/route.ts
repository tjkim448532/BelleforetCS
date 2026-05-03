import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { title, content, isActive, startDate, endDate } = data;

    if (!title || !content) {
      return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
    }

    const docRef = adminDb.collection('operational_notices').doc();
    
    const noticeData = {
      title,
      content,
      isActive: isActive ?? true,
      startDate: startDate || null,
      endDate: endDate || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await docRef.set(noticeData);

    return NextResponse.json({ success: true, id: docRef.id, notice: noticeData });
  } catch (error: any) {
    console.error('Error creating notice:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const snapshot = await adminDb.collection('operational_notices').orderBy('createdAt', 'desc').get();
    const notices = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return NextResponse.json({ notices });
  } catch (error: any) {
    console.error('Error fetching notices:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const data = await req.json();
    const { id, title, content, isActive, startDate, endDate } = data;

    if (!id || !title || !content) {
      return NextResponse.json({ error: 'ID, title, and content are required' }, { status: 400 });
    }

    const docRef = adminDb.collection('operational_notices').doc(id);
    const updatedNotice = {
      title,
      content,
      isActive: isActive ?? true,
      startDate: startDate || null,
      endDate: endDate || null,
      updatedAt: new Date().toISOString(),
    };

    await docRef.update(updatedNotice);

    return NextResponse.json({ success: true, id: docRef.id, notice: updatedNotice });
  } catch (error: any) {
    console.error('Error updating notice:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    await adminDb.collection('operational_notices').doc(id).delete();

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('Error deleting notice:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
