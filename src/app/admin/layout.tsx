'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Database, Bell, Menu, X, BarChart2, Home } from 'lucide-react';
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

  // 로그인 페이지에서는 네비게이션 숨김
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    try {
      // 1. Firebase Client SDK 로그아웃
      await signOut(auth);
      
      // 2. 서버 사이드 세션 쿠키 삭제
      await fetch('/api/admin/logout', { method: 'POST' });
      
      router.push('/admin/login');
      router.refresh();
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  const navLinks = [
    { href: '/admin/facilities', label: '시설 정보 관리', icon: Database },
    { href: '/admin/operations', label: '운영 현황 / 공지', icon: Bell },
    { href: '/admin/logs', label: '대화 로그 분석', icon: BarChart2 },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-900">
      <nav className="bg-white dark:bg-neutral-800 shadow-sm border-b border-gray-200 dark:border-neutral-700 relative z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <span className="text-xl font-bold text-green-600 dark:text-green-500">벨포레 CMS</span>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                        pathname === link.href
                          ? 'border-green-500 text-gray-900 dark:text-white'
                          : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 hover:text-gray-700 dark:hover:text-gray-300'
                      }`}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Link
                href="/"
                target="_blank"
                className="hidden sm:inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-neutral-600 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 dark:text-gray-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors mr-1"
                title="새 탭에서 첫 페이지 열기"
              >
                <Home className="w-4 h-4 mr-1.5" />
                홈
              </Link>
              <button
                onClick={handleLogout}
                className="hidden sm:inline-flex items-center px-3 py-1.5 border border-transparent text-sm leading-4 font-medium rounded-md text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-900/20 dark:hover:bg-red-900/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
              >
                <LogOut className="w-4 h-4 mr-1.5" />
                로그아웃
              </button>
              
              {/* Mobile menu button */}
              <div className="flex items-center sm:hidden">
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-green-500"
                >
                  <span className="sr-only">메뉴 열기</span>
                  {mobileMenuOpen ? (
                    <X className="block h-6 w-6" aria-hidden="true" />
                  ) : (
                    <Menu className="block h-6 w-6" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden absolute top-16 w-full bg-white dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700 shadow-lg">
            <div className="pt-2 pb-3 space-y-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center pl-3 pr-4 py-3 border-l-4 text-base font-medium ${
                      pathname === link.href
                        ? 'bg-green-50 border-green-500 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                        : 'border-transparent text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-neutral-700'
                    }`}
                  >
                    <Icon className="w-5 h-5 mr-3" />
                    {link.label}
                  </Link>
                );
              })}
              <Link
                href="/"
                target="_blank"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center pl-3 pr-4 py-3 border-l-4 border-transparent text-base font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-neutral-700"
              >
                <Home className="w-5 h-5 mr-3" />
                서비스 홈 (새 탭)
              </Link>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center pl-3 pr-4 py-3 border-l-4 border-transparent text-base font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <LogOut className="w-5 h-5 mr-3" />
                로그아웃
              </button>
            </div>
          </div>
        )}
      </nav>

      <main className="py-4 sm:py-10">
        {children}
      </main>
    </div>
  );
}
