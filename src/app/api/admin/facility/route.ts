import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { upsertDocument } from '@/lib/pinecone';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { name, category, description, location, tags, status } = data;

    if (!name || !description) {
      return NextResponse.json({ error: 'Name and description are required' }, { status: 400 });
    }

    const docRef = adminDb.collection('facilities').doc();
    const newFacility = {
      name,
      category: category || '기타',
      description,
      location: location || '',
      tags: tags || [],
      status: status || 'pending', // 기본적으로 대기 상태
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await docRef.set(newFacility);

    // 바로 활성화(승인) 상태로 요청이 왔다면 벡터화 진행
    if (newFacility.status === 'approved') {
      const textToVectorize = `시설명: ${name}\n카테고리: ${newFacility.category}\n위치: ${newFacility.location}\n설명: ${description}\n태그: ${newFacility.tags.join(', ')}`;
      
      await upsertDocument({
        id: docRef.id,
        text: textToVectorize,
        metadata: {
          type: 'facility',
          name,
          category: newFacility.category,
        }
      });
    }

    return NextResponse.json({ success: true, id: docRef.id, facility: newFacility });
  } catch (error: any) {
    console.error('Error creating facility:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
