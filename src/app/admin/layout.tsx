'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LogOut,
  BookOpen,
  Bell,
  Menu,
  X,
  MessageSquare,
  ExternalLink,
  Smile,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { useState } from 'react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showBeginnerGuide, setShowBeginnerGuide] = useState(false);

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    try {
      if (auth) {
        await signOut(auth);
      }
      await fetch('/api/admin/logout', { method: 'POST' });
      router.push('/admin/login');
      router.refresh();
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  const navLinks = [
    {
      href: '/admin/facilities',
      step: '1',
      label: 'AI 지식창고',
      subLabel: '시설 · 요금 · 상시 규정',
      icon: BookOpen,
    },
    {
      href: '/admin/operations',
      step: '2',
      label: '오늘의 긴급 공지',
      subLabel: '임시 휴장 · 시간 변경',
      icon: Bell,
    },
    {
      href: '/admin/logs',
      step: '3',
      label: '통합 인박스 & 로봇DB',
      subLabel: '웹 · 카톡 · 전화 · 로봇데이터',
      icon: MessageSquare,
    },
    {
      href: '/admin/settings',
      step: '4',
      label: 'AI 말투 설정',
      subLabel: '응대 톤앤매너 설정',
      icon: Smile,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      {/* 상단 고정 헤더 (데스크탑 와이드 1줄 최적화 · 무채색 슬레이트 톤) */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10">
          <div className="flex justify-between items-center h-16 gap-6">
            {/* 좌측 로고 & 데스크탑 메뉴 */}
            <div className="flex items-center gap-8 min-w-0">
              <Link
                href="/admin/facilities"
                className="flex items-center gap-2.5 whitespace-nowrap shrink-0"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-slate-900" />
                <span className="text-lg font-bold text-slate-900 tracking-tight">
                  벨포레 AI 상담 관리실
                </span>
              </Link>

              {/* 데스크탑 4대 핵심 메뉴 (줄바꿈 방지 및 단일 톤앤매너) */}
              <div className="hidden lg:flex items-center gap-1.5">
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = pathname.startsWith(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[15px] whitespace-nowrap transition-colors ${
                        isActive
                          ? 'bg-slate-900 text-white font-semibold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0 opacity-85" />
                      <span>
                        {link.step}. {link.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* 우측 도구 모음 (데스크탑 1줄 정렬) */}
            <div className="flex items-center gap-2.5 shrink-0 whitespace-nowrap">
              <button
                type="button"
                onClick={() => setShowBeginnerGuide(!showBeginnerGuide)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  showBeginnerGuide
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <HelpCircle className="w-4 h-4" />
                <span>화면별 사용 안내</span>
                {showBeginnerGuide ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              <Link
                href="/"
                target="_blank"
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 text-sm font-semibold rounded-lg text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                title="새 창에서 고객용 챗봇 화면을 열어 직접 질문해 봅니다"
              >
                <ExternalLink className="w-4 h-4" />
                <span>고객용 챗봇 열기</span>
              </Link>

              <button
                onClick={handleLogout}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                title="관리자 페이지에서 로그아웃합니다"
              >
                <LogOut className="w-4 h-4" />
                <span>로그아웃</span>
              </button>

              {/* 모바일 햄버거 버튼 */}
              <div className="flex items-center lg:hidden">
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="inline-flex items-center justify-center p-2 rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  <span className="sr-only">메뉴 열기</span>
                  {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 상황별 빠른 사용 안내 패널 (차분한 무채색 카드) */}
        {showBeginnerGuide && (
          <div className="bg-slate-100/80 border-t border-slate-200">
            <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    상황별 메뉴 선택 가이드
                  </h3>
                  <p className="text-sm text-slate-600 mt-0.5">
                    업무 목적에 맞는 메뉴를 선택하면 해당 관리 화면으로 바로 이동합니다.
                  </p>
                </div>
                <button
                  onClick={() => setShowBeginnerGuide(false)}
                  className="text-sm font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
                >
                  닫기 <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Link
                  href="/admin/facilities"
                  onClick={() => setShowBeginnerGuide(false)}
                  className="bg-white p-5 rounded-xl border border-slate-200 hover:border-slate-400 transition-all"
                >
                  <div className="text-xs font-semibold text-slate-500 mb-1">
                    메뉴 1 · 상시 운영 정보
                  </div>
                  <div className="text-base font-bold text-slate-900 mb-2">
                    1. AI 지식창고
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    시설 운영시간, 이용요금, 키 제한, 회원 할인 등 상시 유지되는 규정을 등록하거나 수정합니다.
                  </p>
                </Link>

                <Link
                  href="/admin/operations"
                  onClick={() => setShowBeginnerGuide(false)}
                  className="bg-white p-5 rounded-xl border border-slate-200 hover:border-slate-400 transition-all"
                >
                  <div className="text-xs font-semibold text-slate-500 mb-1">
                    메뉴 2 · 일시적 현장 변경
                  </div>
                  <div className="text-base font-bold text-slate-900 mb-2">
                    2. 오늘의 긴급 공지
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    우천 휴장, 시설 점검 등 당일 또는 특정 기간에만 적용되는 임시 공지를 최우선으로 안내합니다.
                  </p>
                </Link>

                <Link
                  href="/admin/logs"
                  onClick={() => setShowBeginnerGuide(false)}
                  className="bg-white p-5 rounded-xl border border-slate-200 hover:border-slate-400 transition-all"
                >
                  <div className="text-xs font-semibold text-slate-500 mb-1">
                    메뉴 3 · 대화 내역 &amp; 카톡 학습
                  </div>
                  <div className="text-base font-bold text-slate-900 mb-2">
                    3. 통합 인박스 &amp; 로봇DB
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    웹·카카오톡 대화 내역을 확인하고, 직원이 카톡에서 응대한 답변을 AI 지식창고로 흡수합니다.
                  </p>
                </Link>

                <Link
                  href="/admin/settings"
                  onClick={() => setShowBeginnerGuide(false)}
                  className="bg-white p-5 rounded-xl border border-slate-200 hover:border-slate-400 transition-all"
                >
                  <div className="text-xs font-semibold text-slate-500 mb-1">
                    메뉴 4 · 응답 스타일
                  </div>
                  <div className="text-base font-bold text-slate-900 mb-2">
                    4. AI 말투 설정
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    친절한 호텔리어 말투, 간결한 요약형, 테마파크 가이드, 외국인 영어 모드 중 응대 톤을 선택합니다.
                  </p>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* 모바일/태블릿 드롭다운 메뉴 */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-b border-slate-200 shadow-lg">
            <div className="p-4 space-y-1.5">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center px-4 py-3 rounded-lg text-sm font-semibold ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-5 h-5 mr-3" />
                    <div>
                      <div>
                        {link.step}. {link.label}
                      </div>
                      <div
                        className={`text-xs font-normal mt-0.5 ${
                          isActive ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {link.subLabel}
                      </div>
                    </div>
                  </Link>
                );
              })}
              <Link
                href="/"
                target="_blank"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center px-4 py-3 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                <ExternalLink className="w-5 h-5 mr-3" />
                고객용 챗봇 열기 (새 창)
              </Link>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center px-4 py-3 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                <LogOut className="w-5 h-5 mr-3" />
                로그아웃
              </button>
            </div>
          </div>
        )}
      </nav>

      <main className="max-w-[1600px] mx-auto px-6 lg:px-10 py-8">
        {children}
      </main>
    </div>
  );
}
