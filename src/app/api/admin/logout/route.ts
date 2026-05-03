import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });

  // 세션 쿠키 삭제 (Firebase Hosting 필수 쿠키명 __session)
  response.cookies.delete('__session');

  return response;
}
