'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Send, Bot, User, Clock, DollarSign, MapPin, Loader2, Settings, ThumbsUp, ThumbsDown, Info, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  logId?: string;
  feedback?: 'up' | 'down' | null;
}

const translations = {
  ko: {
    greeting: '안녕하세요! 벨포레 프론트 데스크 AI입니다. 시설 운영 시간, 요금, 위치 등 무엇이든 물어보세요.',
    placeholder: '무엇이든 물어보세요...',
    error: '앗, 시스템에 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    quick1: '목장 운영시간',
    quick1Q: '목장 운영시간은 어떻게 되나요?',
    quick2: '미디어아트 요금',
    quick2Q: '미디어아트 센터 요금이 얼마인가요?',
    quick3: '콘도 위치',
    quick3Q: '콘도 위치가 어디쯤인가요?',
  },
  en: {
    greeting: 'Hello! I am the Belle Foret Front Desk AI. Ask me anything about facility hours, prices, locations, etc.',
    placeholder: 'Ask me anything...',
    error: 'Oops, a temporary system error occurred. Please try again later.',
    quick1: 'Farm Hours',
    quick1Q: 'What are the operating hours of the farm?',
    quick2: 'Media Art Price',
    quick2Q: 'How much is the Media Art Center?',
    quick3: 'Condo Location',
    quick3Q: 'Where is the condo located?',
  }
};

export default function ChatPage() {
  const [lang, setLang] = useState<'ko' | 'en'>('ko');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: translations['ko'].greeting,
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [notices, setNotices] = useState<any[]>([]);
  const [currentNoticeIndex, setCurrentNoticeIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/notices')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setNotices(data);
      })
      .catch(err => console.error('Failed to fetch notices:', err));
  }, []);

  useEffect(() => {
    if (notices.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentNoticeIndex(prev => (prev + 1) % notices.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [notices.length]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    setMessages([
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: translations[lang].greeting,
      }
    ]);
  }, [lang]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, language: lang }),
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const logId = response.headers.get('X-Log-Id') || undefined;
      
      const aiMessageId = (Date.now() + 1).toString();
      const aiMessage: Message = { 
        id: aiMessageId, 
        role: 'assistant', 
        content: '', // 실시간으로 채워질 예정
        logId: logId,
        feedback: null
      };
      
      setMessages(prev => [...prev, aiMessage]);
      setIsLoading(false); // 응답이 시작되면 로딩 스피너 제거

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No stream available');
      
      const decoder = new TextDecoder('utf-8');
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        
        setMessages(prev => prev.map(msg => 
          msg.id === aiMessageId 
            ? { ...msg, content: msg.content + chunk } 
            : msg
        ));
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = { 
        id: (Date.now() + 1).toString(), 
        role: 'assistant', 
        content: translations[lang].error 
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsLoading(false);
    }
  };

  const handleQuickQuestion = (q: string) => {
    handleSend(q);
  };

  const handleFeedback = async (messageId: string, logId: string, type: 'up' | 'down') => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, feedback: type } : msg
    ));
    
    try {
      await fetch('/api/chat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId, feedback: type }),
      });
    } catch (error) {
      console.error('Feedback error:', error);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-neutral-950 font-sans">
      {/* Header */}
      <header className="bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-800 px-6 py-4 flex items-center justify-between shadow-sm z-10">
        <h1 className="text-xl font-bold text-green-700 dark:text-green-500 tracking-tight flex items-center">
          <Bot className="mr-2" size={24} />
          {lang === 'ko' ? '벨포레 AI 컨시어지' : 'Belle Foret AI'}
        </h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center bg-gray-100 dark:bg-neutral-800 rounded-full p-1">
            <button
              onClick={() => setLang('ko')}
              className={clsx("px-3 py-1 rounded-full text-xs font-medium transition-colors", lang === 'ko' ? "bg-white dark:bg-neutral-700 shadow text-green-700 dark:text-green-400" : "text-gray-500")}
            >
              한국어
            </button>
            <button
              onClick={() => setLang('en')}
              className={clsx("px-3 py-1 rounded-full text-xs font-medium transition-colors", lang === 'en' ? "bg-white dark:bg-neutral-700 shadow text-green-700 dark:text-green-400" : "text-gray-500")}
            >
              English
            </button>
          </div>
          <Link 
            href="/admin/login" 
            className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <Settings size={16} className="mr-1" />
            {lang === 'ko' ? '관리자 로그인' : 'Admin'}
          </Link>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Seasonal Notices Banner */}
        {notices.length > 0 && (
          <div className="flex justify-center mb-6">
            <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-200 dark:border-orange-800 rounded-2xl p-4 max-w-2xl w-full shadow-sm relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
              <div className="flex-shrink-0 bg-orange-100 dark:bg-orange-800/50 p-2 rounded-full text-orange-600 dark:text-orange-400">
                <Info size={20} />
              </div>
              <div className="flex-1 min-w-0 transition-opacity duration-500">
                <h4 className="text-sm font-bold text-orange-800 dark:text-orange-300 flex items-center">
                  🔔 {lang === 'ko' ? '시즌/특별 안내' : 'Seasonal Notice'}
                  <span className="ml-2 text-xs font-normal bg-orange-200 dark:bg-orange-800 text-orange-700 dark:text-orange-200 px-2 py-0.5 rounded-full">
                    {notices[currentNoticeIndex]?.name}
                  </span>
                </h4>
                <p className="text-sm text-orange-700 dark:text-orange-400 mt-1 line-clamp-2">
                  {notices[currentNoticeIndex]?.seasonalDescription}
                </p>
              </div>
              <div className="flex-shrink-0">
                <button
                  onClick={() => handleSend(lang === 'ko' ? `${notices[currentNoticeIndex]?.name} 시즌 정보 알려줘` : `Tell me about ${notices[currentNoticeIndex]?.name} seasonal info`)}
                  className="flex items-center text-xs bg-white dark:bg-neutral-800 hover:bg-orange-50 dark:hover:bg-neutral-700 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-neutral-700 px-3 py-1.5 rounded-full shadow-sm transition-colors font-medium whitespace-nowrap"
                >
                  {lang === 'ko' ? '자세히 묻기' : 'Ask Details'} <ChevronRight size={14} className="ml-1" />
                </button>
              </div>
              {/* Pagination Dots */}
              {notices.length > 1 && (
                <div className="absolute bottom-1.5 left-0 right-0 flex justify-center space-x-1.5">
                  {notices.map((_, idx) => (
                    <div key={idx} className={`w-1.5 h-1.5 rounded-full ${idx === currentNoticeIndex ? 'bg-orange-500' : 'bg-orange-300 dark:bg-orange-800'}`} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={clsx(
              "flex w-full flex-col",
              msg.role === 'user' ? "items-end" : "items-start"
            )}
          >
            <div className={clsx(
              "flex max-w-[80%] sm:max-w-[70%] items-end space-x-2",
              msg.role === 'user' ? "flex-row-reverse space-x-reverse" : "flex-row"
            )}>
              <div className={clsx(
                "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center",
                msg.role === 'user' ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" : "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
              )}>
                {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
              </div>
              
              <div className={clsx(
                "px-4 py-3 rounded-2xl shadow-sm",
                msg.role === 'user' 
                  ? "bg-green-600 text-white rounded-br-sm" 
                  : "bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 rounded-bl-sm"
              )}>
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</p>
              </div>
            </div>
            {/* Feedback Buttons for AI Messages */}
            {msg.role === 'assistant' && msg.logId && (
              <div className="flex items-center space-x-2 mt-2 ml-11">
                <button 
                  onClick={() => handleFeedback(msg.id, msg.logId!, 'up')}
                  className={clsx(
                    "p-1.5 rounded-md transition-colors",
                    msg.feedback === 'up' ? "text-green-600 bg-green-50 dark:bg-green-900/20" : "text-gray-400 hover:text-green-600 hover:bg-gray-100 dark:hover:bg-neutral-800"
                  )}
                  title="도움이 되었어요"
                >
                  <ThumbsUp size={14} />
                </button>
                <button 
                  onClick={() => handleFeedback(msg.id, msg.logId!, 'down')}
                  className={clsx(
                    "p-1.5 rounded-md transition-colors",
                    msg.feedback === 'down' ? "text-red-600 bg-red-50 dark:bg-red-900/20" : "text-gray-400 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-neutral-800"
                  )}
                  title="아쉬워요"
                >
                  <ThumbsDown size={14} />
                </button>
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex w-full justify-start">
            <div className="flex items-end space-x-2">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-neutral-200 text-neutral-600 dark:bg-neutral-800 flex items-center justify-center">
                <Bot size={18} />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-bl-sm">
                <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className="bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Quick actions */}
          <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
            <button 
              onClick={() => handleQuickQuestion(translations[lang].quick1Q)}
              className="flex items-center flex-shrink-0 px-3 py-1.5 rounded-full border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm hover:bg-green-100 transition"
            >
              <Clock size={14} className="mr-1.5" /> {translations[lang].quick1}
            </button>
            <button 
              onClick={() => handleQuickQuestion(translations[lang].quick2Q)}
              className="flex items-center flex-shrink-0 px-3 py-1.5 rounded-full border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-sm hover:bg-blue-100 transition"
            >
              <DollarSign size={14} className="mr-1.5" /> {translations[lang].quick2}
            </button>
            <button 
              onClick={() => handleQuickQuestion(translations[lang].quick3Q)}
              className="flex items-center flex-shrink-0 px-3 py-1.5 rounded-full border border-purple-200 dark:border-purple-900/50 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 text-sm hover:bg-purple-100 transition"
            >
              <MapPin size={14} className="mr-1.5" /> {translations[lang].quick3}
            </button>
          </div>

          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(input); }} 
            className="flex items-center bg-gray-100 dark:bg-neutral-800 rounded-full pr-1 overflow-hidden focus-within:ring-2 focus-within:ring-green-500 transition-shadow"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={translations[lang].placeholder}
              className="flex-1 bg-transparent px-6 py-4 outline-none text-neutral-800 dark:text-neutral-200 placeholder-neutral-400"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-3 mr-1 bg-green-600 text-white rounded-full hover:bg-green-700 disabled:opacity-50 disabled:bg-neutral-400 transition"
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
}
