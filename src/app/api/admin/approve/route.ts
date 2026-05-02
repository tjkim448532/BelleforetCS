import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { upsertDocument } from '@/lib/pinecone';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { id } = data;

    if (!id) {
      return NextResponse.json({ error: 'Facility ID is required' }, { status: 400 });
    }

    const docRef = adminDb.collection('facilities').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 });
    }

    const facilityData = docSnap.data();

    // Update status to approved
    await docRef.update({
      status: 'approved',
      updatedAt: new Date().toISOString(),
    });

    // Vectorize and save to Pinecone
    const textToVectorize = `시설명: ${facilityData?.name}\n카테고리: ${facilityData?.category}\n위치: ${facilityData?.location}\n설명: ${facilityData?.description}\n태그: ${(facilityData?.tags || []).join(', ')}`;
    
    await upsertDocument({
      id: docRef.id,
      text: textToVectorize,
      metadata: {
        type: 'facility',
        name: facilityData?.name,
        category: facilityData?.category,
      }
    });

    return NextResponse.json({ success: true, message: 'Approved and vectorized successfully' });
  } catch (error: any) {
    console.error('Error approving facility:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
