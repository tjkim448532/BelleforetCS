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
