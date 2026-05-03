import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 인증 예외 경로 (로그인 페이지 및 로그인 처리 API)
  if (pathname === '/admin/login' || pathname === '/api/admin/login') {
    return NextResponse.next();
  }

  // 보호할 경로 (/admin 하위 모든 페이지 및 /api/admin 하위 모든 API)
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    // 쿠키에서 인증 토큰 확인
    const adminSession = request.cookies.get('admin_session')?.value;

    // 인증 토큰이 없거나 유효하지 않으면 거부
    if (!adminSession) {
      if (pathname.startsWith('/api/admin')) {
        // API 요청인 경우 401 에러 반환
        return NextResponse.json({ error: 'Unauthorized access' }, { status: 401 });
      } else {
        // 페이지 요청인 경우 로그인 페이지로 리다이렉트
        const loginUrl = new URL('/admin/login', request.url);
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  return NextResponse.next();
}

// 미들웨어가 실행될 경로 지정 (성능 최적화)
export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
