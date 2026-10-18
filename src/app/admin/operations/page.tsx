'use client';

import { useState, useEffect } from 'react';
import {
  Loader2,
  Save,
  Trash2,
  Edit2,
  Plus,
  AlertCircle,
  Calendar,
  Power,
  RefreshCw,
} from 'lucide-react';
import { OperationalNotice } from '@/lib/firestore';

export default function OperationsAdmin() {
  const [notices, setNotices] = useState<Array<OperationalNotice & { audit?: any }>>([]);
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

  // AI 초안 검수 & 일괄 정리 상태
  const [isCheckingDraft, setIsCheckingDraft] = useState(false);
  const [draftCheckResult, setDraftCheckResult] = useState<{
    verdict: 'KEEP_ACTIVE' | 'EXPIRED_DELETE' | 'MIGRATE_TO_KNOWLEDGE';
    advice: string;
    suggestedEndDate: string;
    suggestedCategory: string;
  } | null>(null);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [migratingId, setMigratingId] = useState<string | null>(null);

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

  // 기간 원클릭 도우미
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

  // 원클릭 공지 양식 채우기
  const applyTemplate = (type: 'rain' | 'inspect' | 'extend' | 'soldout') => {
    applyQuickPeriod('today');
    setDraftCheckResult(null);
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
    setDraftCheckResult(null);
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
    setDraftCheckResult(null);
  };

  // 작성 중인 공지 AI 검수 및 종료일 자동 세팅
  const handleAiCheckDraft = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      alert('먼저 [1. 공지 제목]과 [2. 상세 내용]을 적어주세요!');
      return;
    }

    setIsCheckingDraft(true);
    setDraftCheckResult(null);
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ai_check_draft',
          title: formData.title.trim(),
          content: formData.content.trim(),
          endDate: formData.endDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI 검수 중 오류가 발생했습니다.');

      setDraftCheckResult(data);
      if (data.suggestedEndDate && !formData.endDate) {
        setFormData((prev) => ({
          ...prev,
          endDate: data.suggestedEndDate.slice(0, 16),
        }));
      }
    } catch (e: any) {
      alert(e.message || 'AI 검수 중 오류가 발생했습니다.');
    } finally {
      setIsCheckingDraft(false);
    }
  };

  // 불필요/만료 공지 한 번에 삭제
  const handleBulkDeleteExpired = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (
      !confirm(
        `AI가 찾아낸 날짜가 지났거나 종료된 불필요 공지 ${ids.length}건을 한 번에 삭제하시겠습니까?`
      )
    )
      return;

    setIsCleaningUp(true);
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_delete',
          ids,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '일괄 삭제 실패');
      alert(`불필요한 과거 공지 ${data.deletedCount}건이 삭제되었습니다.`);
      fetchNotices();
    } catch (e: any) {
      alert(e.message || '삭제 중 오류가 발생했습니다.');
    } finally {
      setIsCleaningUp(false);
    }
  };

  // 상시 혜택/규정 공지를 [1. AI 지식창고]로 이관 후 긴급 공지에서 삭제
  const handleMigrateToFacility = async (notice: any) => {
    if (
      !confirm(
        `'${notice.title}' 내용은 일시적인 긴급 휴장이 아니라 계속 유지되는 [상시 혜택/이용 규정]입니다.\n\n[1. AI 지식창고]에 정식 지식으로 등록하고 긴급 공지 목록에서는 지우시겠습니까?`
      )
    )
      return;

    setMigratingId(notice.id);
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'migrate_to_facility',
          noticeId: notice.id,
          category: notice.audit?.suggestedCategory || '기타',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '이관 실패');
      alert(
        `'${data.facilityName}' 항목이 [1. AI 지식창고]로 이동되었으며 긴급 공지 목록에서 정리되었습니다.`
      );
      fetchNotices();
    } catch (e: any) {
      alert(e.message || '지식창고 이동 중 오류가 발생했습니다.');
    } finally {
      setMigratingId(null);
    }
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
          ? '공지가 성공적으로 수정되어 AI 챗봇에 즉시 반영되었습니다.'
          : '새 긴급 공지가 등록되어 AI 챗봇이 지금부터 이 내용으로 안내합니다.'
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
    setDraftCheckResult(null);
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

  const checkIsCurrentlyActive = (notice: OperationalNotice & { audit?: any }) => {
    if (!notice.isActive) return false;
    const now = new Date();
    if (notice.startDate && new Date(notice.startDate) > now) return false;
    if (notice.endDate && new Date(notice.endDate) < now) return false;
    if (notice.audit?.verdict === 'EXPIRED_DELETE') return false;
    return true;
  };

  const expiredDeleteIds = notices
    .filter((n) => n.audit?.verdict === 'EXPIRED_DELETE' && n.id)
    .map((n) => n.id as string);
  const migrateCandidates = notices.filter((n) => n.audit?.verdict === 'MIGRATE_TO_KNOWLEDGE');

  return (
    <div className="space-y-8">
      {/* 상단 헤더 카드 (차분한 무채색 & 높은 가독성) */}
      <div className="bg-white p-7 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              메뉴 2 · 현장 긴급 속보 관리
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              오늘의 긴급 공지 (임시 휴장 · 운영시간 변경)
            </h1>
            <p className="mt-1.5 text-[15px] text-slate-600 leading-relaxed">
              여기에 등록된 공지는 평소 기본 정보보다 <strong className="text-slate-900 font-semibold">1순위로 최우선 안내</strong>되며, 종료일(또는 본문 내 날짜)이 지나면 자동으로 안내가 종료됩니다.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 pt-5 border-t border-slate-100">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <p className="text-sm font-bold text-slate-900 mb-1.5">
              작성 대상 (일시적 현장 변동 사항)
            </p>
            <ul className="text-slate-600 space-y-1 list-disc list-inside text-sm leading-relaxed">
              <li>당일 우천·기상 악화로 인한 마운틴카트/썰매장 임시 휴장</li>
              <li>시설 안전 점검으로 인한 특정 시간대 임시 운휴</li>
              <li>연휴·행사 기간 특정 매장 영업시간 임시 연장 또는 조기 마감</li>
            </ul>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <p className="text-sm font-bold text-slate-900 mb-1.5">
              AI 자동 종료일 인식 및 정리 안내
            </p>
            <ul className="text-slate-600 space-y-1 list-disc list-inside text-sm leading-relaxed">
              <li>종료일을 비워두어도 본문에 적힌 날짜(예: <code className="text-slate-900 font-semibold">10월 25일</code>)를 AI가 인식해 기한 경과 시 자동 차단합니다.</li>
              <li>계속 유지되는 상시 혜택·규정은 우측 목록에서 <strong className="text-slate-900 font-semibold">지식창고로 원클릭 승격</strong>할 수 있습니다.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 데스크탑 2단 레이아웃 (좌측 입력 5 : 우측 목록 7) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* 좌측: 공지 작성 폼 (5칸) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-2xs p-7 lg:sticky lg:top-24">
          <div className="flex justify-between items-center mb-5 pb-4 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">
              {isEditing ? '공지 내용 수정하기' : '새 긴급 공지 등록'}
            </h2>
            {isEditing && (
              <button
                onClick={resetForm}
                className="text-sm font-semibold px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 flex items-center gap-1 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" /> 취소하고 새로 작성
              </button>
            )}
          </div>

          {/* 빠른 예시 문구 채우기 */}
          {!isEditing && (
            <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-sm font-semibold text-slate-800 mb-2.5">
                자주 쓰는 공지 양식 (클릭 시 자동 입력)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => applyTemplate('rain')}
                  className="text-left px-3 py-2 text-sm font-medium bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-800 transition-colors"
                >
                  비·날씨로 휴장할 때
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate('inspect')}
                  className="text-left px-3 py-2 text-sm font-medium bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-800 transition-colors"
                >
                  시설 안전 점검할 때
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate('extend')}
                  className="text-left px-3 py-2 text-sm font-medium bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-800 transition-colors"
                >
                  운영시간 임시 변경
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate('soldout')}
                  className="text-left px-3 py-2 text-sm font-medium bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-800 transition-colors"
                >
                  현장 매표 조기 마감
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-900 mb-1.5">
                1. 공지 제목 <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                name="title"
                required
                value={formData.title}
                onChange={handleChange}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                placeholder="예: 오늘 우천으로 인한 마운틴카트 임시 휴장"
              />
            </div>

            <div>
              <div className="mb-1.5">
                <label className="block text-sm font-bold text-slate-900">
                  2. 상세 내용 (AI가 고객에게 안내할 내용) <span className="text-rose-600">*</span>
                </label>
                <p className="text-sm text-slate-500 mt-0.5">
                  핵심 내용을 적어주시면 AI가 자연스러운 문장으로 고객에게 전달합니다.
                </p>
              </div>
              <textarea
                name="content"
                required
                rows={4}
                value={formData.content}
                onChange={handleChange}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none leading-relaxed"
                placeholder="예: 오늘 우천으로 인해 마운틴카트와 사계절썰매는 휴장합니다. 실내 미디어아트센터는 정상 운영합니다."
              />
              <div className="mt-2.5 flex justify-end">
                <button
                  type="button"
                  onClick={handleAiCheckDraft}
                  disabled={isCheckingDraft || !formData.title.trim() || !formData.content.trim()}
                  className="inline-flex items-center px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  {isCheckingDraft && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                  AI 종료일 자동 추출 및 내용 검수
                </button>
              </div>
            </div>

            {draftCheckResult && (
              <div className="p-4 rounded-xl border border-slate-300 bg-slate-50 text-sm text-slate-800 space-y-1.5">
                <div className="font-bold text-slate-900">
                  {draftCheckResult.verdict === 'KEEP_ACTIVE'
                    ? 'AI 검수 완료: 긴급 공지로 적합합니다.'
                    : draftCheckResult.verdict === 'MIGRATE_TO_KNOWLEDGE'
                    ? 'AI 안내: 상시 규정에 해당하므로 [1. AI 지식창고] 등록을 권장합니다.'
                    : 'AI 주의: 본문 속 날짜가 이미 지난 과거 날짜인지 확인해 주세요.'}
                </div>
                <p className="leading-relaxed text-slate-700">{draftCheckResult.advice}</p>
                {draftCheckResult.suggestedEndDate && (
                  <p className="font-semibold text-slate-900">
                    추천 자동 종료일: {draftCheckResult.suggestedEndDate.replace('T', ' ')}
                  </p>
                )}
              </div>
            )}

            {/* 기간 설정 영역 */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3.5">
              <div>
                <label className="block text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-700" />
                  3. 공지 적용 기간 (자동 종료 설정)
                </label>
                <p className="text-sm text-slate-500 mt-0.5">
                  종료 시각이 지나면 자동으로 비활성화됩니다.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyQuickPeriod('today')}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  오늘 하루만 적용
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickPeriod('tomorrow')}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                >
                  내일까지 적용
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickPeriod('week')}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                >
                  일주일 동안
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickPeriod('always')}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                >
                  직접 끌 때까지 유지
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    시작 일시
                  </label>
                  <input
                    type="datetime-local"
                    name="startDate"
                    value={formData.startDate}
                    onChange={handleChange}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    종료 일시 (경과 시 자동 해제)
                  </label>
                  <input
                    type="datetime-local"
                    name="endDate"
                    value={formData.endDate}
                    onChange={handleChange}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <input
                id="isActive"
                name="isActive"
                type="checkbox"
                checked={formData.isActive}
                onChange={handleChange}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <label
                htmlFor="isActive"
                className="ml-2.5 block text-sm text-slate-900 font-semibold cursor-pointer"
              >
                등록 즉시 AI 챗봇 안내에 적용 (켜짐)
              </label>
            </div>

            {message && (
              <div className="p-3.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-900 border border-slate-300">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3.5 text-[15px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Save className="mr-2 h-5 w-5" />
              )}
              {isEditing ? '수정 내용 저장하기' : '긴급 공지 등록하기'}
            </button>
          </form>
        </div>

        {/* 우측: 현재 등록된 공지 목록 & AI 자동 검수/정리 (7칸) */}
        <div className="lg:col-span-7 space-y-5">
          {/* AI 공지 자동 검수 & 원클릭 정리 배너 */}
          {(expiredDeleteIds.length > 0 || migrateCandidates.length > 0) && (
            <div className="bg-white p-5 rounded-2xl border border-slate-300 shadow-2xs">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    AI 공지 검수 결과: 정리가 필요한 항목이 있습니다
                  </h3>
                  <p className="text-sm text-slate-600 mt-1">
                    기한이 지난 과거 공지 <strong className="text-slate-900">{expiredDeleteIds.length}건</strong>
                    {migrateCandidates.length > 0 && (
                      <>
                        {' '}
                        · 지식창고로 이동 권장하는 상시 규정{' '}
                        <strong className="text-slate-900">{migrateCandidates.length}건</strong>
                      </>
                    )}
                  </p>
                </div>
                {expiredDeleteIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleBulkDeleteExpired(expiredDeleteIds)}
                    disabled={isCleaningUp}
                    className="inline-flex items-center px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl shrink-0 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {isCleaningUp ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-1.5" />
                    )}
                    만료된 공지 {expiredDeleteIds.length}건 일괄 삭제
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-slate-50/70">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  등록된 긴급 공지 목록 ({notices.length}건)
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  AI 안내 중 상태인 공지만 현재 챗봇 답변에 반영됩니다.
                </p>
              </div>
              <button
                onClick={fetchNotices}
                className="inline-flex items-center px-3.5 py-2 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-300 transition-colors whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4 mr-1.5" /> 새로고침
              </button>
            </div>

            {loadingManage ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-7 h-7 text-slate-500 animate-spin" />
              </div>
            ) : notices.length === 0 ? (
              <div className="text-center py-20 px-6">
                <AlertCircle className="mx-auto h-10 w-10 text-slate-400 mb-3" />
                <h3 className="text-base font-bold text-slate-900">
                  현재 등록된 긴급 공지가 없습니다
                </h3>
                <p className="mt-1.5 text-sm text-slate-500">
                  모든 시설이 평상시 기본 정보(AI 지식창고) 기준으로 정상 안내되고 있습니다.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-200">
                {notices.map((notice) => {
                  const isActiveNow = checkIsCurrentlyActive(notice);
                  const audit = notice.audit;

                  return (
                    <li
                      key={notice.id}
                      className={`p-6 transition-colors ${
                        editingId === notice.id
                          ? 'bg-slate-50'
                          : isActiveNow
                          ? 'bg-white'
                          : 'bg-slate-50/50'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center flex-wrap gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleQuickToggleActive(notice)}
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap ${
                              isActiveNow
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                            }`}
                            title="클릭하면 이 공지를 즉시 켜거나 끕니다"
                          >
                            <Power className="w-3.5 h-3.5 mr-1.5" />
                            {isActiveNow ? 'AI 안내 중 (클릭 시 종료)' : '안내 종료됨 (클릭 시 켜기)'}
                          </button>
                          <h4 className="text-lg font-bold text-slate-900">
                            {notice.title}
                          </h4>
                          {audit?.verdict === 'EXPIRED_DELETE' && (
                            <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                              기한 경과 · 삭제 권장
                            </span>
                          )}
                          {audit?.verdict === 'MIGRATE_TO_KNOWLEDGE' && (
                            <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                              상시 규정 · 지식창고 이동 권장
                            </span>
                          )}
                        </div>

                        <div className="flex items-center flex-wrap gap-2 shrink-0">
                          {audit?.verdict === 'MIGRATE_TO_KNOWLEDGE' && (
                            <button
                              type="button"
                              onClick={() => handleMigrateToFacility(notice)}
                              disabled={migratingId === notice.id}
                              className="inline-flex items-center px-3 py-1.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
                              title="이 상시 규정을 [1. AI 지식창고]에 정식 등록하고 긴급 공지에서는 지웁니다"
                            >
                              {migratingId === notice.id && (
                                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                              )}
                              지식창고로 이관
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(notice)}
                            className="inline-flex items-center px-3 py-1.5 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-300 transition-colors whitespace-nowrap"
                          >
                            <Edit2 className="w-3.5 h-3.5 mr-1.5" /> 수정
                          </button>
                          <button
                            onClick={() => notice.id && handleDelete(notice.id, notice.title)}
                            className="inline-flex items-center px-3 py-1.5 text-sm font-semibold text-rose-600 bg-white hover:bg-rose-50 rounded-lg border border-slate-300 transition-colors whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> 삭제
                          </button>
                        </div>
                      </div>

                      {audit && audit.verdict !== 'KEEP_ACTIVE' && (
                        <div className="mt-3 p-3.5 rounded-xl text-sm bg-slate-50 border border-slate-200 text-slate-700">
                          <strong className="text-slate-900 font-semibold">AI 검수 의견:</strong>{' '}
                          {audit.reason}
                        </div>
                      )}

                      <div className="mt-4 text-[15px] text-slate-800 bg-slate-50 p-4 rounded-xl border border-slate-200 whitespace-pre-wrap leading-7">
                        {notice.content}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center text-sm text-slate-500 gap-4">
                        {notice.startDate || notice.endDate ? (
                          <div>
                            <span className="font-semibold text-slate-700 mr-1.5">
                              적용 기간:
                            </span>
                            {notice.startDate
                              ? new Date(notice.startDate).toLocaleString('ko-KR')
                              : '즉시'}{' '}
                            ~{' '}
                            {notice.endDate
                              ? new Date(notice.endDate).toLocaleString('ko-KR')
                              : '계속'}
                          </div>
                        ) : audit?.detectedMaxDate ? (
                          <span className="text-slate-700 font-medium">
                            종료일 미입력 (본문 감지 종료일: {audit.detectedMaxDate})
                          </span>
                        ) : (
                          <span>기간 제한 없음 (직접 종료할 때까지 안내)</span>
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
