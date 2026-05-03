import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export async function GET() {
  try {
    // Limit to 200 most recent logs to avoid overloading the UI
    const snapshot = await adminDb.collection('chat_logs')
      .orderBy('timestamp', 'desc')
      .limit(200)
      .get();
      
    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return NextResponse.json({ logs });
  } catch (error: unknown) {
    console.error('Error fetching chat logs:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const idsParam = searchParams.get('ids');

    if (id) {
      await adminDb.collection('chat_logs').doc(id).delete();
      return NextResponse.json({ success: true });
    }

    if (idsParam) {
      const ids = idsParam.split(',').filter(Boolean);
      if (ids.length === 0) {
        return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
      }

      const batch = adminDb.batch();
      ids.forEach((docId) => {
        const docRef = adminDb.collection('chat_logs').doc(docId);
        batch.delete(docRef);
      });

      await batch.commit();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Missing id or ids parameter' }, { status: 400 });
  } catch (error: unknown) {
    console.error('Error deleting chat logs:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
