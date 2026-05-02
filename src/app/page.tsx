import Link from 'next/link';
import { Bot, Settings, ArrowRight } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col font-sans text-neutral-100 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-green-600/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-teal-600/20 blur-[150px]" />
      </div>

      <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 z-10 w-full max-w-5xl mx-auto">
        
        <div className="text-center mb-16 space-y-6 animate-fade-in-up">
          <div className="inline-flex items-center justify-center p-3 bg-white/5 rounded-2xl ring-1 ring-white/10 mb-4 backdrop-blur-md">
            <Bot className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-green-300 via-teal-300 to-green-500">
            Belle Foret AI
          </h1>
          <p className="text-lg sm:text-xl text-neutral-400 max-w-2xl mx-auto font-light leading-relaxed">
            벨포레의 운영 데이터를 학습하여 가장 빠르고 정확하게 안내하는 차세대 RAG 지식 응답 시스템입니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
          {/* Chat Link Card */}
          <Link href="/chat" className="group relative bg-white/5 hover:bg-white/10 border border-white/10 hover:border-green-500/50 p-8 rounded-3xl transition-all duration-500 overflow-hidden backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10 flex flex-col h-full justify-between space-y-8">
              <div className="bg-green-500/20 w-14 h-14 rounded-2xl flex items-center justify-center ring-1 ring-green-500/30">
                <Bot className="w-7 h-7 text-green-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2 flex items-center">
                  고객용 챗봇 시작하기
                  <ArrowRight className="ml-2 w-5 h-5 text-green-400 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                </h2>
                <p className="text-neutral-400 leading-relaxed">
                  시설 운영시간, 요금, 위치 등 방문객의 질문에 AI가 즉각적으로 응답합니다.
                </p>
              </div>
            </div>
          </Link>

          {/* Admin Link Card */}
          <Link href="/admin/facilities" className="group relative bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/50 p-8 rounded-3xl transition-all duration-500 overflow-hidden backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10 flex flex-col h-full justify-between space-y-8">
              <div className="bg-blue-500/20 w-14 h-14 rounded-2xl flex items-center justify-center ring-1 ring-blue-500/30">
                <Settings className="w-7 h-7 text-blue-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2 flex items-center">
                  관리자 시스템 (CMS)
                  <ArrowRight className="ml-2 w-5 h-5 text-blue-400 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                </h2>
                <p className="text-neutral-400 leading-relaxed">
                  AI가 학습할 최신 운영 데이터를 입력하고 관리하는 전용 대시보드입니다.
                </p>
              </div>
            </div>
          </Link>
        </div>
      </main>

      <footer className="py-8 text-center text-neutral-500 text-sm z-10 border-t border-white/5 mt-auto">
        © 2026 Belle Foret AI Concierge System. Powered by Gemini.
      </footer>
    </div>
  );
}
