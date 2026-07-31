import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/firebase/admin';
import { smartSplitFacilityDescription } from '@/lib/gemini';

export async function POST(req: Request) {
  try {
    await verifyAdminSession(req);
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const { description, seasonalDescription } = await smartSplitFacilityDescription(text);

    return NextResponse.json({
      description,
      seasonalDescription
    });
  } catch (error: unknown) {
    console.error('Error in smart split:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
