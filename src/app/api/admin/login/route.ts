import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';

export async function POST(req: Request) {
  try {
    const { idToken } = await req.json();

    if (!idToken) {
      return NextResponse.json({ error: '인증 토큰이 없습니다.' }, { status: 401 });
    }

    // 1. Firebase Admin을 사용하여 ID 토큰 검증
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userEmail = decodedToken.email;

    // 2. 관리자 이메일 권한 검증 (화이트리스트)
    const adminEmailsEnv = process.env.ADMIN_EMAILS || '';
    const allowedEmails = adminEmailsEnv.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

    // 환경 변수에 등록된 이메일이 없거나, 현재 로그인한 이메일이 목록에 없는 경우 차단
    if (allowedEmails.length === 0 || !userEmail || !allowedEmails.includes(userEmail.toLowerCase())) {
      console.warn(`Unauthorized login attempt: ${userEmail}`);
      return NextResponse.json({ error: '관리자로 등록되지 않은 구글 계정입니다.' }, { status: 403 });
    }
    
    // 3. 세션 쿠키 생성 (유효기간: 5일)
    const expiresIn = 60 * 60 * 24 * 5 * 1000;
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

    const response = NextResponse.json({ success: true });

    // 3. HTTP-Only 쿠키 설정 (Firebase Hosting에서는 쿠키 이름을 __session으로 해야 작동함)
    response.cookies.set('__session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: expiresIn / 1000,
    });

    return response;
  } catch (error: unknown) {
    console.error('Firebase Auth Error:', error);
    return NextResponse.json({ error: '인증 세션을 생성할 수 없습니다.' }, { status: 401 });
  }
}
