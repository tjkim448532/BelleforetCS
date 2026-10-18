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

  // 로그인 페이지에서는 네비게이션 숨김
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
      subLabel: '시설 · 요금 · 자주 묻는 규정',
      icon: BookOpen,
      activeColor: 'bg-green-50 border-green-600 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    },
    {
      href: '/admin/operations',
      step: '2',
      label: '오늘의 긴급 공지',
      subLabel: '갑작스러운 휴장 · 시간 변경',
      icon: Bell,
      activeColor: 'bg-red-50 border-red-600 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    },
    {
      href: '/admin/logs',
      step: '3',
      label: '통합 인박스 & 로봇DB',
      subLabel: '웹·카톡·AI전화 · 로봇데이터',
      icon: MessageSquare,
      activeColor: 'bg-indigo-50 border-indigo-600 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
    },
    {
      href: '/admin/settings',
      step: '4',
      label: 'AI 말투 설정',
      subLabel: '호텔리어 · 가이드 · 영어 모드',
      icon: Smile,
      activeColor: 'bg-amber-50 border-amber-600 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950">
      {/* 상단 고정 헤더 */}
      <nav className="bg-white dark:bg-neutral-900 shadow-sm border-b border-gray-200 dark:border-neutral-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* 좌측 로고 & 타이틀 */}
            <div className="flex items-center space-x-6">
              <Link href="/admin/facilities" className="flex flex-col">
                <span className="text-xl font-extrabold text-green-700 dark:text-green-400 tracking-tight flex items-center">
                  🌲 벨포레 AI 상담 관리자
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  초보자도 쉽게 쓰는 스마트 CS 관리실
                </span>
              </Link>

              {/* 데스크탑 4대 핵심 메뉴 */}
              <div className="hidden lg:flex items-center space-x-2">
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = pathname.startsWith(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`flex items-center px-3.5 py-2 rounded-xl border-b-2 transition-all ${
                        isActive
                          ? `${link.activeColor} font-bold shadow-xs`
                          : 'border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white dark:bg-neutral-800 shadow-2xs mr-2.5 text-xs font-extrabold border border-gray-200 dark:border-neutral-700">
                        {link.step}
                      </div>
                      <div className="flex flex-col text-left">
                        <span className="text-sm leading-tight flex items-center">
                          <Icon className="w-3.5 h-3.5 mr-1 opacity-80" />
                          {link.label}
                        </span>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 font-normal mt-0.5">
                          {link.subLabel}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* 우측 도움말 / 챗봇 열기 / 로그아웃 버튼 */}
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setShowBeginnerGuide(!showBeginnerGuide)}
                className={`inline-flex items-center px-3 py-2 rounded-lg text-xs sm:text-sm font-bold border transition-colors ${
                  showBeginnerGuide
                    ? 'bg-amber-500 text-white border-amber-600'
                    : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700'
                }`}
              >
                <HelpCircle className="w-4 h-4 mr-1.5" />
                <span>초보자 1분 사용법</span>
                {showBeginnerGuide ? (
                  <ChevronUp className="w-4 h-4 ml-1" />
                ) : (
                  <ChevronDown className="w-4 h-4 ml-1" />
                )}
              </button>

              <Link
                href="/"
                target="_blank"
                className="hidden sm:inline-flex items-center px-3.5 py-2 border border-green-300 dark:border-green-800 text-xs sm:text-sm font-bold rounded-lg text-green-700 bg-green-50 hover:bg-green-100 dark:text-green-300 dark:bg-green-900/20 transition-colors"
                title="새 창에서 고객용 챗봇 화면을 열어 직접 질문해 봅니다"
              >
                <ExternalLink className="w-4 h-4 mr-1.5" />
                고객용 챗봇 열기
              </Link>

              <button
                onClick={handleLogout}
                className="hidden sm:inline-flex items-center px-3 py-2 border border-transparent text-xs sm:text-sm font-medium rounded-lg text-gray-600 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:bg-red-900/20 transition-colors"
                title="관리자 페이지에서 로그아웃합니다"
              >
                <LogOut className="w-4 h-4 mr-1" />
                로그아웃
              </button>

              {/* 모바일/태블릿 메뉴 버튼 */}
              <div className="flex items-center lg:hidden">
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="inline-flex items-center justify-center p-2 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-neutral-800"
                >
                  <span className="sr-only">메뉴 열기</span>
                  {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 💡 어디서나 볼 수 있는 초보자 1분 사용 설명서 (펼침 패널) */}
        {showBeginnerGuide && (
          <div className="bg-amber-50/95 dark:bg-neutral-900 border-t border-b border-amber-200 dark:border-amber-800/60 shadow-inner">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-base font-extrabold text-amber-900 dark:text-amber-300 flex items-center">
                    👋 처음 오셨나요? 상황별로 딱 맞는 메뉴를 골라보세요!
                  </h3>
                  <p className="text-xs text-amber-800 dark:text-amber-400 mt-0.5">
                    어려운 컴퓨터 지식이 없어도 괜찮습니다. 아래 4가지 상황 중 오늘 하실 일만 클릭하시면 됩니다.
                  </p>
                </div>
                <button
                  onClick={() => setShowBeginnerGuide(false)}
                  className="text-xs font-bold text-amber-800 dark:text-amber-400 hover:underline flex items-center"
                >
                  닫기 <X className="w-4 h-4 ml-1" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Link
                  href="/admin/facilities"
                  onClick={() => setShowBeginnerGuide(false)}
                  className="bg-white dark:bg-neutral-800 p-4 rounded-xl border border-amber-200 dark:border-neutral-700 hover:border-green-500 transition-all shadow-2xs"
                >
                  <div className="text-xs font-extrabold text-green-700 dark:text-green-400 mb-1">
                    상황 1️⃣ 평상시 요금·시간·규정이 바뀌었을 때
                  </div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white mb-1.5">
                    👉 [1. AI 지식창고] 메뉴 클릭
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                    마운틴카트 요금, 식당 메뉴, 반려견 입장 규정 등 <strong>계속 유지되는 정보</strong>를 찾거나 수정합니다. (홈페이지 기본 정보는 매일 아침 자동 업데이트됩니다!)
                  </p>
                </Link>

                <Link
                  href="/admin/operations"
                  onClick={() => setShowBeginnerGuide(false)}
                  className="bg-white dark:bg-neutral-800 p-4 rounded-xl border border-amber-200 dark:border-neutral-700 hover:border-red-500 transition-all shadow-2xs"
                >
                  <div className="text-xs font-extrabold text-red-600 dark:text-red-400 mb-1">
                    상황 2️⃣ 오늘 비가 오거나 갑자기 문을 닫을 때
                  </div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white mb-1.5">
                    👉 [2. 오늘의 긴급 공지] 메뉴 클릭
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                    우천 휴장, 기계 점검 등 <strong>일시적인 현장 상황</strong>을 올립니다. 종료 날짜만 정해주면 날짜가 지난 뒤 AI가 알아서 공지를 내립니다!
                  </p>
                </Link>

                <Link
                  href="/admin/logs"
                  onClick={() => setShowBeginnerGuide(false)}
                  className="bg-white dark:bg-neutral-800 p-4 rounded-xl border border-amber-200 dark:border-neutral-700 hover:border-indigo-500 transition-all shadow-2xs"
                >
                  <div className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 mb-1">
                    상황 3️⃣ 손님들이 뭘 물어봤는지 궁금할 때
                  </div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white mb-1.5">
                    👉 [3. 고객 질문 &amp; 오답노트] 클릭
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                    고객과 AI의 실제 대화 내용을 확인하고, AI가 대답하지 못한 질문을 버튼 한 번으로 AI에게 가르쳐 줄 수 있습니다.
                  </p>
                </Link>

                <Link
                  href="/admin/settings"
                  onClick={() => setShowBeginnerGuide(false)}
                  className="bg-white dark:bg-neutral-800 p-4 rounded-xl border border-amber-200 dark:border-neutral-700 hover:border-amber-500 transition-all shadow-2xs"
                >
                  <div className="text-xs font-extrabold text-amber-700 dark:text-amber-400 mb-1">
                    상황 4️⃣ AI의 말투를 바꾸고 싶을 때
                  </div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white mb-1.5">
                    👉 [4. AI 말투 설정] 메뉴 클릭
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                    정중한 호텔리어 말투, 친근한 가이드 말투, 외국인 전용 영어 모드 중 원하는 스타일을 선택합니다.
                  </p>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* 모바일/태블릿 드롭다운 메뉴 */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-800 shadow-lg">
            <div className="p-3 space-y-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center px-3 py-3 rounded-lg text-sm font-bold ${
                      isActive
                        ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <Icon className="w-5 h-5 mr-3" />
                    <div>
                      <div>{link.step}. {link.label}</div>
                      <div className="text-xs font-normal text-gray-500">{link.subLabel}</div>
                    </div>
                  </Link>
                );
              })}
              <Link
                href="/"
                target="_blank"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center px-3 py-3 rounded-lg text-sm font-bold text-green-700 hover:bg-green-50"
              >
                <ExternalLink className="w-5 h-5 mr-3" />
                고객용 챗봇 열기 (새 창)
              </Link>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center px-3 py-3 rounded-lg text-sm font-bold text-red-600 hover:bg-red-50"
              >
                <LogOut className="w-5 h-5 mr-3" />
                로그아웃
              </button>
            </div>
          </div>
        )}
      </nav>

      <main className="py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
