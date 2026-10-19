'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Clock,
  MapPin,
  CheckCircle2,
  Loader2,
  Send,
  StopCircle,
  Lock,
  RefreshCw,
  CalendarClock,
  Users,
  PartyPopper,
  AlertTriangle,
  Megaphone,
  ArrowLeft,
} from 'lucide-react';

interface StaffNotice {
  id: string;
  title: string;
  content: string;
  rawContent?: string;
  category?: string;
  location?: string;
  department?: string;
  isActive: boolean;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string;
}

const CATEGORIES = [
  { id: '단체행사', label: '👥 단체행사·대관', desc: '기업 워크샵, 수학여행, 단체 대관' },
  { id: '공연/이벤트', label: '🎉 공연·작은행사', desc: '버스킹, 양떼몰이, 깜짝 이벤트' },
  { id: '혼잡/대기', label: '⏳ 현장혼잡·대기', desc: '대기 시간 발생, 주차장·식당 혼잡' },
  { id: '운휴/점검', label: '🛑 일시운휴·점검', desc: '안전 점검, 우천 일시 중단' },
  { id: '기타안내', label: '📢 일반현장안내', desc: '기타 당일 현장 변경 사항' },
];

const QUICK_PLACES = [
  '익스트림 루지',
  '벨포레 목장',
  '마운틴카트',
  '사계절썰매',
  '미디어아트센터',
  '컨벤션센터(연회장)',
  '웰컴센터/원형광장',
  '남도예담/식음업장',
  '블랙스톤 벨포레 CC',
];

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function formatReadableTime(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function StaffMobileInputApp() {
  const [pin, setPin] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState('');

  const [department, setDepartment] = useState('레저/액티비티팀');
  const [category, setCategory] = useState('단체행사');
  const [location, setLocation] = useState('익스트림 루지');
  const [customLocation, setCustomLocation] = useState('');
  const [title, setTitle] = useState('');
  const [rawContent, setRawContent] = useState('');

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [isPolishing, setIsPolishing] = useState(false);
  const [previewResult, setPreviewResult] = useState<{
    polishedTitle: string;
    polishedContent: string;
  } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccessMsg, setSubmitSuccessMsg] = useState('');

  const [activeNotices, setActiveNotices] = useState<StaffNotice[]>([]);
  const [recentEndedNotices, setRecentEndedNotices] = useState<StaffNotice[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [endingId, setEndingId] = useState<string | null>(null);

  // 초기 기본 시작(현재) ~ 완료(+2시간) 세팅
  const applyDurationPreset = useCallback((mode: '1h' | '2h' | '3h' | 'today14_16' | 'until18' | 'until22') => {
    const now = new Date();
    now.setSeconds(0, 0);
    if (mode === '1h') {
      const end = new Date(now.getTime() + 1 * 60 * 60 * 1000);
      setStartDate(toLocalInputValue(now));
      setEndDate(toLocalInputValue(end));
    } else if (mode === '2h') {
      const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      setStartDate(toLocalInputValue(now));
      setEndDate(toLocalInputValue(end));
    } else if (mode === '3h') {
      const end = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      setStartDate(toLocalInputValue(now));
      setEndDate(toLocalInputValue(end));
    } else if (mode === 'today14_16') {
      const s = new Date(now);
      s.setHours(14, 0, 0, 0);
      const e = new Date(now);
      e.setHours(16, 0, 0, 0);
      setStartDate(toLocalInputValue(s));
      setEndDate(toLocalInputValue(e));
    } else if (mode === 'until18') {
      const e = new Date(now);
      e.setHours(18, 0, 0, 0);
      if (e <= now) e.setHours(23, 59, 0, 0);
      setStartDate(toLocalInputValue(now));
      setEndDate(toLocalInputValue(e));
    } else if (mode === 'until22') {
      const e = new Date(now);
      e.setHours(22, 0, 0, 0);
      if (e <= now) e.setHours(23, 59, 0, 0);
      setStartDate(toLocalInputValue(now));
      setEndDate(toLocalInputValue(e));
    }
    setPreviewResult(null);
  }, []);

  const fetchStaffNotices = useCallback(async (currentPin: string) => {
    setLoadingList(true);
    try {
      const res = await fetch(`/api/staff/notices?pin=${encodeURIComponent(currentPin)}`, {
        headers: currentPin ? { 'x-staff-pin': currentPin } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setIsUnlocked(true);
        setActiveNotices(data.activeNotices || []);
        setRecentEndedNotices(data.recentEndedNotices || []);
        if (data.defaultDept && !localStorage.getItem('bf_staff_dept')) {
          setDepartment(data.defaultDept);
        }
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    applyDurationPreset('2h');
    const savedPin = localStorage.getItem('bf_staff_pin') || '';
    const savedDept = localStorage.getItem('bf_staff_dept') || '';
    if (savedDept) setDepartment(savedDept);
    if (savedPin) setPin(savedPin);

    (async () => {
      const ok = await fetchStaffNotices(savedPin);
      if (!ok && savedPin) {
        setIsUnlocked(false);
      }
      setAuthChecking(false);
    })();
  }, [applyDurationPreset, fetchStaffNotices]);

  const handlePinUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthChecking(true);
    try {
      const res = await fetch('/api/staff/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_pin', pin: pin.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || '인증 번호를 다시 확인해 주세요.');
        return;
      }
      localStorage.setItem('bf_staff_pin', pin.trim());
      if (data.department) {
        setDepartment(data.department);
        localStorage.setItem('bf_staff_dept', data.department);
      }
      setIsUnlocked(true);
      await fetchStaffNotices(pin.trim());
    } catch {
      setAuthError('네트워크 오류가 발생했습니다.');
    } finally {
      setAuthChecking(false);
    }
  };

  const effectiveLocation = location === '직접입력' ? customLocation.trim() : location;

  // 빠른 예시 채우기
  const fillExample = (type: 'group' | 'event' | 'crowd') => {
    if (type === 'group') {
      setCategory('단체행사');
      setLocation('익스트림 루지');
      setTitle('단체 워크샵 탑승 행사');
      setRawContent('대형버스 2대(80명) 단체 탑승으로 해당 시간 동안 일반 고객 대기 시간이 약 20~30분 발생할 수 있습니다.');
      applyDurationPreset('today14_16');
    } else if (type === 'event') {
      setCategory('공연/이벤트');
      setLocation('웰컴센터/원형광장');
      setTitle('원형광장 특별 버스킹 공연');
      setRawContent('웰컴센터 앞 원형광장에서 투숙객과 방문객 누구나 무료로 관람 가능한 어쿠스틱 버스킹 공연이 진행됩니다.');
      applyDurationPreset('2h');
    } else if (type === 'crowd') {
      setCategory('혼잡/대기');
      setLocation('남도예담/식음업장');
      setTitle('점심 단체 예약으로 인한 만석 안내');
      setRawContent('단체 식사 예약으로 인해 해당 시간대 일반 테이블 대기 시간이 발생할 수 있으니 이용에 참고 부탁드립니다.');
      applyDurationPreset('2h');
    }
    setPreviewResult(null);
  };

  const handleAiPreview = async () => {
    if (!title.trim() && !rawContent.trim()) {
      alert('행사 이름이나 안내할 내용을 간단히 적어주세요.');
      return;
    }
    setIsPolishing(true);
    setPreviewResult(null);
    try {
      const res = await fetch('/api/staff/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-staff-pin': pin },
        body: JSON.stringify({
          action: 'ai_polish',
          pin,
          category,
          location: effectiveLocation,
          title: title.trim(),
          rawContent: rawContent.trim(),
          startDate: startDate ? new Date(startDate).toISOString() : null,
          endDate: endDate ? new Date(endDate).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreviewResult({
        polishedTitle: data.polishedTitle,
        polishedContent: data.polishedContent,
      });
    } catch (err: any) {
      alert(err.message || 'AI 문장 다듬기 중 오류가 발생했습니다.');
    } finally {
      setIsPolishing(false);
    }
  };

  const handleSubmitNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !rawContent.trim()) {
      alert('행사 제목 또는 내용을 입력해 주세요.');
      return;
    }
    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      alert('완료 시간은 시작 시간보다 뒤여야 합니다.');
      return;
    }

    setIsSubmitting(true);
    setSubmitSuccessMsg('');
    try {
      localStorage.setItem('bf_staff_dept', department);
      const res = await fetch('/api/staff/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-staff-pin': pin },
        body: JSON.stringify({
          action: 'create',
          pin,
          department,
          category,
          location: effectiveLocation,
          title: previewResult?.polishedTitle || title.trim(),
          rawContent: previewResult?.polishedContent || rawContent.trim() || title.trim(),
          autoPolish: !previewResult, // 미리보기를 이미 했으면 그대로 저장, 안 했으면 서버에서 자동 AI 정제
          startDate: startDate ? new Date(startDate).toISOString() : null,
          endDate: endDate ? new Date(endDate).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSubmitSuccessMsg(
        `✅ 등록 완료! 지금부터 완료 시간(${formatReadableTime(data.notice?.endDate)})까지 AI가 손님들에게 자동으로 안내합니다.`
      );
      setTitle('');
      setRawContent('');
      setPreviewResult(null);
      await fetchStaffNotices(pin);
    } catch (err: any) {
      alert(err.message || '등록 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEndNow = async (notice: StaffNotice) => {
    if (!confirm(`'${notice.title}' 일정을 지금 바로 종료하시겠습니까?\n(종료 즉시 AI 답변에서 제외되며 DB 기록으로만 보관됩니다)`)) {
      return;
    }
    setEndingId(notice.id);
    try {
      const res = await fetch('/api/staff/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-staff-pin': pin },
        body: JSON.stringify({
          action: 'end_now',
          pin,
          id: notice.id,
        }),
      });
      if (res.ok) {
        await fetchStaffNotices(pin);
      } else {
        const d = await res.json();
        alert(d.error || '종료 처리 실패');
      }
    } finally {
      setEndingId(null);
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
          현장 직원 입력앱 불러오는 중...
        </div>
      </div>
    );
  }

  // PIN 잠금 화면 (모바일 친화적)
  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center px-4 py-8">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
          <div className="text-center space-y-1.5">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              벨포레 현장 인포메이션 앱
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              현장 단체행사·공연·혼잡·운휴 시간을 입력하면
              <br />
              <strong>웹·카카오톡·AI전화</strong>가 즉시 손님에게 안내합니다.
            </p>
          </div>

          <form onSubmit={handlePinUnlock} className="space-y-4">
            <div>
              <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                직원용 4자리 인증코드 (PIN)
              </label>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={6}
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="공통 코드: 1566"
                className="w-full text-center text-2xl font-black tracking-widest py-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
              />
              <p className="text-[11px] text-slate-500 mt-1.5 text-center">
                공통 <code>1566</code> / 프론트 <code>1001</code> / 레저 <code>2001</code> / 식음 <code>3001</code>
              </p>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 text-center">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm shadow-sm transition-colors"
            >
              현장 입력 화면 열기
            </button>
          </form>
        </div>
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="min-h-screen bg-slate-100 pb-16">
      {/* 상단 고정 모바일 앱 헤더 */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white shadow-xs">
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-black text-sm">
              BF
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight leading-none">
                벨포레 직원 현장 입력앱
              </h1>
              <p className="text-[11px] text-slate-300 mt-1">
                시작·완료 시간만 넣으면 AI가 자동 안내 후 자동 종료합니다
              </p>
            </div>
          </div>
          <Link
            href="/admin/operations"
            className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-slate-200"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            관리자
          </Link>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        {/* 원터치 예시 버튼 바 */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-800 flex items-center">
              <Sparkles className="w-3.5 h-3.5 mr-1 text-slate-700" />
              터치 한 번으로 예시 양식 채우기
            </span>
            <span className="text-[11px] text-slate-500">바쁠 때 눌러서 숫자만 고치세요</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => fillExample('group')}
              className="px-2.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-extrabold text-slate-800 text-center"
            >
              👥 단체 대관/탑승
            </button>
            <button
              type="button"
              onClick={() => fillExample('event')}
              className="px-2.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-extrabold text-slate-800 text-center"
            >
              🎉 미니공연/행사
            </button>
            <button
              type="button"
              onClick={() => fillExample('crowd')}
              className="px-2.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-extrabold text-slate-800 text-center"
            >
              ⏳ 식당/매장 혼잡
            </button>
          </div>
        </div>

        {/* 메인 모바일 입력 카드 */}
        <form
          onSubmit={handleSubmitNotice}
          className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-5"
        >
          {/* 1. 작성 부서 & 유형 선택 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-black text-slate-900">
                1. 어떤 현장 소식인가요?
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-800"
              >
                <option value="레저/액티비티팀">레저/액티비티팀</option>
                <option value="프론트/객실팀">프론트/객실팀</option>
                <option value="식음/연회팀">식음/연회팀</option>
                <option value="골프/CC팀">골프/CC팀</option>
                <option value="현장운영지원">현장운영지원</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((c) => {
                const active = category === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCategory(c.id);
                      setPreviewResult(null);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-xs font-extrabold">{c.label}</div>
                    <div
                      className={`text-[11px] mt-0.5 line-clamp-1 ${
                        active ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      {c.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. 장소/시설 선택 */}
          <div className="space-y-2">
            <label className="block text-sm font-black text-slate-900">
              2. 어디에서 진행되나요? (장소 터치)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PLACES.map((p) => {
                const selected = location === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setLocation(p);
                      setPreviewResult(null);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-colors ${
                      selected
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setLocation('직접입력')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-colors ${
                  location === '직접입력'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-100 text-slate-700 border-slate-300'
                }`}
              >
                + 직접 입력
              </button>
            </div>
            {location === '직접입력' && (
              <input
                type="text"
                required
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
                placeholder="장소나 시설 이름을 적어주세요 (예: 펫포레 잔디광장)"
                className="mt-2 block w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-bold text-slate-900"
              />
            )}
          </div>

          {/* 3. 시작 시간 ~ 완료 시간 */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-black text-slate-900 flex items-center">
                <CalendarClock className="w-4 h-4 mr-1.5 text-slate-700" />
                3. 시작 시간 ~ 완료 시간
              </label>
              <span className="text-[11px] font-bold text-slate-500">
                완료 시간이 지나면 자동 종료
              </span>
            </div>

            {/* 원터치 시간 프리셋 버튼 */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => applyDurationPreset('1h')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-extrabold text-slate-800"
              >
                지금부터 1시간
              </button>
              <button
                type="button"
                onClick={() => applyDurationPreset('2h')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-extrabold text-slate-800"
              >
                지금부터 2시간
              </button>
              <button
                type="button"
                onClick={() => applyDurationPreset('3h')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-extrabold text-slate-800"
              >
                지금부터 3시간
              </button>
              <button
                type="button"
                onClick={() => applyDurationPreset('today14_16')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-extrabold text-slate-800"
              >
                오늘 14:00~16:00
              </button>
              <button
                type="button"
                onClick={() => applyDurationPreset('until18')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-extrabold text-slate-800"
              >
                오늘 18:00까지
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <label className="block text-[11px] font-extrabold text-slate-600 mb-1">
                  🟢 시작 일시
                </label>
                <input
                  type="datetime-local"
                  required
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPreviewResult(null);
                  }}
                  className="w-full bg-white rounded-lg border border-slate-300 px-2.5 py-2 text-xs sm:text-sm font-bold text-slate-900"
                />
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <label className="block text-[11px] font-extrabold text-slate-600 mb-1">
                  🔴 완료(종료) 일시
                </label>
                <input
                  type="datetime-local"
                  required
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPreviewResult(null);
                  }}
                  className="w-full bg-white rounded-lg border border-slate-300 px-2.5 py-2 text-xs sm:text-sm font-bold text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* 4. 행사 이름 및 현장 메모 입력 */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-black text-slate-900 mb-1">
                4. 행사 이름 및 현장 상황 메모
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setPreviewResult(null);
                }}
                placeholder="행사/일정 제목 (예: OO기업 단체 대관, 양떼몰이 특별 공연)"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 focus:bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-600">
                  상세 내용 (편하게 적으시면 AI가 다듬어 줍니다)
                </span>
                <button
                  type="button"
                  onClick={handleAiPreview}
                  disabled={isPolishing || (!title.trim() && !rawContent.trim())}
                  className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-extrabold text-slate-900 disabled:opacity-50"
                >
                  {isPolishing ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 mr-1" />
                  )}
                  AI 안내 문장 미리보기
                </button>
              </div>
              <textarea
                rows={3}
                value={rawContent}
                onChange={(e) => {
                  setRawContent(e.target.value);
                  setPreviewResult(null);
                }}
                placeholder="예: 100명 단체 행사로 인해 오후 2시~4시 일반 손님 탑승 대기가 30분 정도 길어질 수 있습니다."
                className="w-full rounded-xl border border-slate-300 bg-slate-50 focus:bg-white p-3 text-sm text-slate-900 leading-relaxed focus:border-slate-900 focus:outline-none"
              />
            </div>

            {previewResult && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                <div className="font-extrabold text-slate-900 flex items-center">
                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                  AI가 손님에게 안내할 표준 문장:
                </div>
                <div className="font-bold text-slate-900">{previewResult.polishedTitle}</div>
                <div className="text-slate-700 leading-relaxed bg-white p-2.5 rounded-lg border border-slate-200">
                  {previewResult.polishedContent}
                </div>
              </div>
            )}
          </div>

          {submitSuccessMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-extrabold text-emerald-900 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
              <span>{submitSuccessMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-base shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                AI가 문장을 다듬어 DB에 등록 중...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                현장 일정 등록 (AI 즉시 답변 시작)
              </>
            )}
          </button>
        </form>

        {/* 현재 진행·예정 중인 현장 일정 리스트 */}
        <section className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900">
                📋 현재 AI가 안내 중인 현장 일정 ({activeNotices.length}건)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                행사가 일찍 끝났다면 [지금 완료] 버튼을 눌러주세요
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchStaffNotices(pin)}
              disabled={loadingList}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              title="새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${loadingList ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {activeNotices.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
              현재 진행 중이거나 예정된 현장 특이사항/행사가 없습니다.
            </div>
          ) : (
            <div className="space-y-2.5">
              {activeNotices.map((item) => {
                const isUpcoming = item.startDate && new Date(item.startDate) > now;
                return (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold ${
                              isUpcoming
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            {isUpcoming ? '⏳ 시작 대기(예정)' : '🟢 현재 AI 안내 중'}
                          </span>
                          {item.location && (
                            <span className="inline-flex items-center text-[11px] font-bold text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                              <MapPin className="w-3 h-3 mr-0.5" />
                              {item.location}
                            </span>
                          )}
                          {item.department && (
                            <span className="text-[11px] text-slate-500 font-semibold">
                              {item.department}
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-extrabold text-slate-900">{item.title}</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleEndNow(item)}
                        disabled={endingId === item.id}
                        className="shrink-0 inline-flex items-center px-2.5 py-1.5 rounded-lg bg-white hover:bg-red-50 text-red-600 border border-red-200 text-xs font-extrabold transition-colors"
                      >
                        <StopCircle className="w-3.5 h-3.5 mr-1" />
                        {endingId === item.id ? '종료 중' : '지금 완료'}
                      </button>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed">{item.content}</p>

                    <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500 pt-1 border-t border-slate-200/80">
                      <span className="inline-flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        시작: {formatReadableTime(item.startDate)}
                      </span>
                      <span>~</span>
                      <span>자동종료: {formatReadableTime(item.endDate)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
