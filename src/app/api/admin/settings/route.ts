import { NextResponse } from 'next/server';
import { adminDb, verifyAdminSession } from '@/lib/firebase/admin';

export async function GET(req: Request) {
  try {
    await verifyAdminSession(req);
    const docRef = adminDb.collection('settings').doc('system');
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return NextResponse.json({ persona: 'friendly' });
    }
    
    return NextResponse.json(doc.data());
  } catch (error: unknown) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await verifyAdminSession(req);
    const data = await req.json();
    const { persona } = data;

    if (!persona) {
      return NextResponse.json({ error: 'Persona is required' }, { status: 400 });
    }

    const docRef = adminDb.collection('settings').doc('system');
    await docRef.set({ persona }, { merge: true });

    return NextResponse.json({ success: true, persona });
  } catch (error: unknown) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
