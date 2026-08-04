import { NextResponse } from 'next/server';
import { adminDb, verifyAdminSession } from '@/lib/firebase/admin';
import { upsertDocument } from '@/lib/pinecone';

export async function POST(req: Request) {
  try {
    await verifyAdminSession(req);
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
    let textToVectorize = `시설명: ${facilityData?.name}\n카테고리: ${facilityData?.category}\n위치: ${facilityData?.location}\n설명: ${facilityData?.description}\n`;
    if (facilityData?.seasonalDescription) {
      textToVectorize += `시즌/임시안내: ${facilityData.seasonalDescription}\n`;
    }
    textToVectorize += `태그: ${(facilityData?.tags || []).join(', ')}`;
    
    try {
      await upsertDocument({
        id: docRef.id,
        text: textToVectorize,
        metadata: {
          type: 'facility',
          name: facilityData?.name,
          category: facilityData?.category,
        }
      });
    } catch (pineconeError) {
      console.warn('Pinecone sync failed during approval:', pineconeError);
      return NextResponse.json({ success: true, message: 'Approved successfully, but AI search indexing failed. Please retry indexing later.', warning: true });
    }

    return NextResponse.json({ success: true, message: 'Approved and vectorized successfully' });
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
      return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }
    console.error('Error approving facility:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
