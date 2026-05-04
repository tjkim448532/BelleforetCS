import { NextResponse } from 'next/server';
import { adminDb, verifyAdminSession } from '@/lib/firebase/admin';
import { smartEditFacilityDescription } from '@/lib/gemini';

export async function POST(req: Request) {
  try {
    // 1. 인증 체크
    await verifyAdminSession(req);

    // 2. 바디 파싱
    const { originalText, instruction } = await req.json();
    if (!originalText || !instruction) {
      return NextResponse.json({ error: '원본 텍스트와 수정 지시어는 필수입니다.' }, { status: 400 });
    }

    // 3. AI 호출
    const result = await smartEditFacilityDescription(originalText, instruction);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Smart Edit Error:', error);
    if (error?.message === 'Unauthorized' || error?.code?.startsWith('auth/')) {
      return NextResponse.json({ error: '인증되지 않은 사용자입니다. 다시 로그인해주세요.' }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || 'AI 수정 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
