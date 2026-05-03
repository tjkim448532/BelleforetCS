import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { password } = await req.json();
    const correctPassword = process.env.ADMIN_PASSWORD;

    // 환경 변수가 설정되지 않았거나 비밀번호가 틀린 경우
    if (!correctPassword || password !== correctPassword) {
      return NextResponse.json({ error: '비밀번호가 일치하지 않습니다.' }, { status: 401 });
    }

    // 보안 토큰 (환경 변수 또는 임시 키)
    const secretKey = process.env.ADMIN_SESSION_SECRET || 'fallback_secret_key_if_not_set';
    
    // 이 예제에서는 단순함을 위해 고정된 문자열이나 간단한 해시를 사용합니다.
    // 실제 운영에서는 jwt 등을 사용하지만, 현재는 미들웨어에서 쿠키 존재 여부만 체크합니다.
    const sessionToken = Buffer.from(secretKey).toString('base64');

    const response = NextResponse.json({ success: true });

    // HTTP-Only 쿠키 설정
    response.cookies.set('admin_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7일 유지
    });

    return response;
  } catch (error) {
    return NextResponse.json({ error: '로그인 처리 중 오류 발생' }, { status: 500 });
  }
}
