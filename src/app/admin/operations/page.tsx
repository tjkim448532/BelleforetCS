'use client';

import { useState, useEffect } from 'react';
import {
  Loader2,
  Save,
  Trash2,
  Edit2,
  Plus,
  AlertCircle,
  Sparkles,
  Calendar,
  Power,
  RefreshCw,
} from 'lucide-react';
import { OperationalNotice } from '@/lib/firestore';

export default function OperationsAdmin() {
  const [notices, setNotices] = useState<OperationalNotice[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingManage, setLoadingManage] = useState(false);
  const [message, setMessage] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    isActive: true,
    startDate: '',
    endDate: '',
  });

  const fetchNotices = async () => {
    setLoadingManage(true);
    try {
      const res = await fetch('/api/admin/operations');
      if (res.ok) {
        const data = await res.json();
        setNotices(data.notices || []);
      }
    } catch (e) {
      console.error('Failed to fetch notices', e);
    } finally {
      setLoadingManage(false);
    }
  };

  useEffect(() => {
    fetchNotices();
  }, []);

  const toLocalInputString = (date: Date) => {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };

  // 초보자용 기간 원클릭 도우미
  const applyQuickPeriod = (mode: 'today' | 'tomorrow' | 'week' | 'always') => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    if (mode === 'always') {
      setFormData((prev) => ({ ...prev, startDate: '', endDate: '' }));
      return;
    }

    const end = new Date(now);
    if (mode === 'today') {
      end.setHours(23, 59, 0, 0);
    } else if (mode === 'tomorrow') {
      end.setDate(end.getDate() + 1);
      end.setHours(23, 59, 0, 0);
    } else if (mode === 'week') {
      end.setDate(end.getDate() + 7);
      end.setHours(23, 59, 0, 0);
    }

    setFormData((prev) => ({
      ...prev,
      startDate: toLocalInputString(start),
      endDate: toLocalInputString(end),
    }));
  };

  // 초보자용 원클릭 공지 양식 채우기
  const applyTemplate = (type: 'rain' | 'inspect' | 'extend' | 'soldout') => {
    applyQuickPeriod('today');
    if (type === 'rain') {
      setFormData((prev) => ({
        ...prev,
        title: '오늘 우천으로 인한 야외 시설 휴장 안내',
        content:
          '오늘 비(악천후)로 인해 고객 안전을 위하여 [마운틴카트, 사계절썰매, 루지] 등 야외 놀이시설이 임시 휴장합니다. 실내 시설인 미디어아트센터와 아쿠아풀(원더풀)은 정상 운영합니다.',
        isActive: true,
      }));
    } else if (type === 'inspect') {
      setFormData((prev) => ({
        ...prev,
        title: '시설 안전 점검으로 인한 임시 운휴 안내',
        content:
          '오늘 [시설 이름을 적어주세요] 시설이 긴급 안전 점검으로 인해 [오후 2시]까지 임시 운휴합니다. 점검 완료 후 즉시 정상 운영할 예정입니다.',
        isActive: true,
      }));
    } else if (type === 'extend') {
      setFormData((prev) => ({
        ...prev,
        title: '오늘 영업시간 임시 변경 안내',
        content:
          '오늘 현장 사정으로 인해 [시설/매장 이름]의 운영 시간이 [오전 10시 ~ 오후 8시]로 임시 변경되었습니다. 방문에 참고 부탁드립니다.',
        isActive: true,
      }));
    } else if (type === 'soldout') {
      setFormData((prev) => ({
        ...prev,
        title: '오늘 현장 매표 조기 마감 안내',
        content:
          '오늘 [마운틴카트] 탑승 인원 초과로 인해 금일 현장 매표가 조기 마감되었습니다. 내일 오전 10시부터 정상 이용 가능합니다.',
        isActive: true,
      }));
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      isActive: true,
      startDate: '',
      endDate: '',
    });
    setEditingId(null);
    setIsEditing(false);
    setMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const payload = {
        ...formData,
        startDate: formData.startDate
          ? new Date(formData.startDate).toISOString()
          : null,
        endDate: formData.endDate
          ? new Date(formData.endDate).toISOString()
          : null,
      };

      const url = '/api/admin/operations';
      const method = isEditing ? 'PUT' : 'POST';
      const body = isEditing ? { ...payload, id: editingId } : payload;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || '저장에 실패했습니다.');
      }

      setMessage(
        isEditing
          ? '✅ 공지가 성공적으로 수정되어 AI 챗봇에 즉시 반영되었습니다!'
          : '✅ 새 긴급 공지가 등록되어 AI 챗봇이 지금부터 이 내용으로 안내합니다!'
      );
      resetForm();
      fetchNotices();
    } catch (error: unknown) {
      setMessage((error as Error).message || '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickToggleActive = async (notice: OperationalNotice) => {
    try {
      const nextActive = !notice.isActive;
      const response = await fetch('/api/admin/operations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: notice.id,
          title: notice.title,
          content: notice.content,
          startDate: notice.startDate || null,
          endDate: notice.endDate || null,
          isActive: nextActive,
        }),
      });
      if (!response.ok) throw new Error('상태 변경 실패');
      fetchNotices();
    } catch (e: any) {
      alert(e.message || '상태 변경 중 오류가 발생했습니다.');
    }
  };

  const handleEdit = (notice: OperationalNotice) => {
    const formatForInput = (isoString?: string) => {
      if (!isoString) return '';
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return '';
      return toLocalInputString(date);
    };

    setFormData({
      title: notice.title,
      content: notice.content,
      isActive: notice.isActive,
      startDate: formatForInput(notice.startDate),
      endDate: formatForInput(notice.endDate),
    });
    setEditingId(notice.id || null);
    setIsEditing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`'${title}' 공지를 정말 삭제하시겠습니까?`)) return;

    try {
      const response = await fetch(`/api/admin/operations?id=${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('삭제 실패');

      if (editingId === id) {
        resetForm();
      }
      fetchNotices();
    } catch (error: unknown) {
      alert((error as Error).message);
    }
  };

  const checkIsCurrentlyActive = (notice: OperationalNotice) => {
    if (!notice.isActive) return false;
    const now = new Date();
    if (notice.startDate && new Date(notice.startDate) > now) return false;
    if (notice.endDate && new Date(notice.endDate) < now) return false;
    return true;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
      {/* 상단 초보자 친절 설명 배너 */}
      <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl shadow-xs border border-red-200 dark:border-red-900/50">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 mb-2">
              메뉴 2 · 현장 긴급 속보 전용
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
              🚨 오늘의 긴급 공지 (갑작스러운 휴장 · 시간 변경)
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              여기에 글을 올리면 AI 챗봇이 <strong>평소 기본 안내보다 이 공지를 무조건 1순위로 먼저</strong> 손님에게 안내합니다!
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-neutral-800 text-xs sm:text-sm">
          <div className="bg-red-50/70 dark:bg-red-900/15 p-3.5 rounded-xl border border-red-100 dark:border-red-800/40">
            <p className="font-bold text-red-800 dark:text-red-300 mb-1">
              ⭕ 이럴 때 여기에 적으세요! (임시 변경)
            </p>
            <ul className="text-red-700 dark:text-red-400 space-y-1 list-disc list-inside text-xs">
              <li>&quot;오늘 비가 와서 마운틴카트랑 썰매장 안 해요&quot;</li>
              <li>&quot;오늘 기계 점검 때문에 오후 2시까지 루지 쉬어요&quot;</li>
              <li>&quot;이번 연휴에만 특별히 밤 9시까지 야간개장 해요&quot;</li>
            </ul>
          </div>
          <div className="bg-blue-50/70 dark:bg-blue-900/15 p-3.5 rounded-xl border border-blue-100 dark:border-blue-800/40">
            <p className="font-bold text-blue-800 dark:text-blue-300 mb-1">
              💡 꿀팁: 종료 날짜를 정해두면 퇴근 후에도 안심!
            </p>
            <ul className="text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside text-xs">
              <li>아래 <strong>[오늘 하루만 적용]</strong> 버튼을 눌러서 올리면, 오늘 밤 12시가 지나면 AI가 알아서 공지를 끄고 내일 아침부터 평소 시간표대로 대답합니다.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 좌측: 공지 작성 폼 (5칸) */}
        <div className="lg:col-span-5 bg-white dark:bg-neutral-900 rounded-2xl shadow-xs border border-neutral-200 dark:border-neutral-800 p-6 self-start sticky top-24">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-extrabold text-gray-900 dark:text-white flex items-center">
              {isEditing ? '✏️ 공지 내용 고치기' : '📝 새 긴급 공지 올리기'}
            </h2>
            {isEditing && (
              <button
                onClick={resetForm}
                className="text-xs font-bold px-2.5 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 rounded-md text-gray-700 dark:text-gray-300 flex items-center"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> 취소하고 새로 쓰기
              </button>
            )}
          </div>

          {/* 초보자용 원클릭 양식 자동 채우기 */}
          {!isEditing && (
            <div className="mb-5 p-3.5 bg-amber-50/80 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800/60">
              <p className="text-xs font-bold text-amber-900 dark:text-amber-300 mb-2 flex items-center">
                <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-600" />
                글쓰기가 막막하신가요? 버튼을 누르면 예시 문장이 자동으로 채워집니다!
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => applyTemplate('rain')}
                  className="text-left px-2.5 py-2 text-xs font-semibold bg-white dark:bg-neutral-800 hover:bg-amber-100 border border-amber-200 dark:border-neutral-700 rounded-lg text-gray-800 dark:text-gray-200 transition-colors"
                >
                  🌧️ 비/날씨로 휴장할 때
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate('inspect')}
                  className="text-left px-2.5 py-2 text-xs font-semibold bg-white dark:bg-neutral-800 hover:bg-amber-100 border border-amber-200 dark:border-neutral-700 rounded-lg text-gray-800 dark:text-gray-200 transition-colors"
                >
                  🔧 시설 안전 점검할 때
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate('extend')}
                  className="text-left px-2.5 py-2 text-xs font-semibold bg-white dark:bg-neutral-800 hover:bg-amber-100 border border-amber-200 dark:border-neutral-700 rounded-lg text-gray-800 dark:text-gray-200 transition-colors"
                >
                  ⏰ 운영시간 임시 변경
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate('soldout')}
                  className="text-left px-2.5 py-2 text-xs font-semibold bg-white dark:bg-neutral-800 hover:bg-amber-100 border border-amber-200 dark:border-neutral-700 rounded-lg text-gray-800 dark:text-gray-200 transition-colors"
                >
                  🎫 오늘 티켓 조기 마감
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-800 dark:text-gray-200">
                1. 공지 제목 <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-500 mt-0.5 mb-1.5">
                어떤 시설의 무슨 공지인지 한눈에 알아볼 수 있게 적어주세요.
              </p>
              <input
                type="text"
                name="title"
                required
                value={formData.title}
                onChange={handleChange}
                className="block w-full rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3.5 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                placeholder="예: 오늘 비가 와서 마운틴카트 임시 휴장"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-800 dark:text-gray-200">
                2. 상세 내용 (AI가 손님에게 안내할 내용) <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-500 mt-0.5 mb-1.5">
                손님에게 말하듯 편하게 적어주시면 AI가 예쁜 문장으로 다듬어 대답합니다.
              </p>
              <textarea
                name="content"
                required
                rows={4}
                value={formData.content}
                onChange={handleChange}
                className="block w-full rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3.5 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 leading-relaxed"
                placeholder="예: 오늘 우천으로 인해 마운틴카트와 사계절썰매는 휴장합니다. 실내 미디어아트센터는 정상 운영합니다."
              />
            </div>

            {/* 기간 설정 영역 */}
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-200 dark:border-neutral-700 space-y-3">
              <div>
                <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center">
                  <Calendar className="w-4 h-4 mr-1.5 text-green-600" />
                  3. 언제까지 이 공지를 띄울까요? (자동 종료 설정)
                </label>
                <p className="text-xs text-gray-500 mt-0.5">
                  아래 버튼만 누르면 날짜가 자동으로 맞춰집니다!
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => applyQuickPeriod('today')}
                  className="px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-md transition-colors"
                >
                  ⚡ 오늘 하루만 적용
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickPeriod('tomorrow')}
                  className="px-2.5 py-1.5 bg-white dark:bg-neutral-800 hover:bg-gray-100 border border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors"
                >
                  내일까지 적용
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickPeriod('week')}
                  className="px-2.5 py-1.5 bg-white dark:bg-neutral-800 hover:bg-gray-100 border border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors"
                >
                  일주일 동안
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickPeriod('always')}
                  className="px-2.5 py-1.5 bg-white dark:bg-neutral-800 hover:bg-gray-100 border border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-md transition-colors"
                >
                  직접 끌 때까지 계속
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400">
                    시작 날짜/시간
                  </label>
                  <input
                    type="datetime-local"
                    name="startDate"
                    value={formData.startDate}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2.5 py-1.5 text-xs focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400">
                    종료 날짜/시간 (이 시간이 지나면 자동 해제)
                  </label>
                  <input
                    type="datetime-local"
                    name="endDate"
                    value={formData.endDate}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2.5 py-1.5 text-xs focus:border-green-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center p-3 rounded-lg bg-green-50/60 dark:bg-green-900/10 border border-green-200 dark:border-green-800/40">
              <input
                id="isActive"
                name="isActive"
                type="checkbox"
                checked={formData.isActive}
                onChange={handleChange}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <label
                htmlFor="isActive"
                className="ml-2.5 block text-sm text-gray-900 dark:text-white font-bold cursor-pointer"
              >
                등록 즉시 AI 챗봇에게 알려주기 (켜짐)
              </label>
            </div>

            {message && (
              <div
                className={`p-3.5 rounded-lg text-sm font-medium ${
                  message.includes('✅') || message.includes('성공')
                    ? 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-900/30 dark:text-red-300'
                }`}
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center rounded-xl bg-green-600 px-4 py-3 text-base font-extrabold text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Save className="mr-2 h-5 w-5" />
              )}
              {isEditing ? '고친 내용 저장하기' : '지금 바로 긴급 공지 올리기'}
            </button>
          </form>
        </div>

        {/* 우측: 현재 등록된 공지 목록 (7칸) */}
        <div className="lg:col-span-7">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xs border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <div className="p-5 border-b border-gray-200 dark:border-neutral-800 flex justify-between items-center bg-gray-50/60 dark:bg-neutral-900/50">
              <div>
                <h3 className="text-lg font-extrabold text-gray-900 dark:text-white">
                  📋 등록된 긴급 공지 목록 ({notices.length}건)
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  <strong>[🟢 AI 안내 중]</strong> 표시가 켜진 공지만 현재 손님에게 안내됩니다. 상황이 끝나면 버튼을 눌러 끌 수 있습니다.
                </p>
              </div>
              <button
                onClick={fetchNotices}
                className="inline-flex items-center px-3 py-1.5 text-xs font-bold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg border border-green-200 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> 새로고침
              </button>
            </div>

            {loadingManage ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
              </div>
            ) : notices.length === 0 ? (
              <div className="text-center py-16 px-4">
                <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  현재 등록된 긴급 공지가 없습니다
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  모든 시설이 평상시 기본 정보대로 정상 안내되고 있습니다.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-neutral-800">
                {notices.map((notice) => {
                  const isActiveNow = checkIsCurrentlyActive(notice);

                  return (
                    <li
                      key={notice.id}
                      className={`p-5 transition-colors ${
                        editingId === notice.id
                          ? 'bg-blue-50/50 dark:bg-blue-900/10'
                          : isActiveNow
                          ? 'bg-white dark:bg-neutral-900'
                          : 'bg-gray-50/70 dark:bg-neutral-900/40 opacity-75'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleQuickToggleActive(notice)}
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold border transition-colors ${
                              isActiveNow
                                ? 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300'
                                : 'bg-gray-200 text-gray-700 border-gray-300 hover:bg-gray-300 dark:bg-neutral-800 dark:text-gray-400'
                            }`}
                            title="클릭하면 이 공지를 즉시 켜거나 끕니다"
                          >
                            <Power className="w-3 h-3 mr-1" />
                            {isActiveNow ? '🟢 현재 AI 안내 중 (클릭 시 끄기)' : '⚪ 안내 종료됨 (클릭 시 켜기)'}
                          </button>
                          <h4 className="text-base font-extrabold text-gray-900 dark:text-white">
                            {notice.title}
                          </h4>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          <button
                            onClick={() => handleEdit(notice)}
                            className="inline-flex items-center px-2.5 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5 mr-1" /> 내용 고치기
                          </button>
                          <button
                            onClick={() => notice.id && handleDelete(notice.id, notice.title)}
                            className="inline-flex items-center px-2.5 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" /> 지우기
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-neutral-800 p-3.5 rounded-xl border border-gray-200/80 dark:border-neutral-700 whitespace-pre-wrap leading-relaxed">
                        {notice.content}
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center text-xs text-gray-500 gap-4">
                        {notice.startDate || notice.endDate ? (
                          <div>
                            <span className="font-bold text-gray-700 dark:text-gray-300 mr-1">
                              📅 안내 기간:
                            </span>
                            {notice.startDate
                              ? new Date(notice.startDate).toLocaleString('ko-KR')
                              : '즉시'}{' '}
                            ~{' '}
                            {notice.endDate
                              ? new Date(notice.endDate).toLocaleString('ko-KR')
                              : '계속'}
                          </div>
                        ) : (
                          <span>♾️ 기간 제한 없음 (직접 끌 때까지 안내)</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
