import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { logId, feedback } = data;

    if (!logId || !feedback || !['up', 'down'].includes(feedback)) {
      return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
    }

    const docRef = adminDb.collection('chat_logs').doc(logId);
    await docRef.update({ feedback });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Feedback API Error:', error);
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 });
  }
}
