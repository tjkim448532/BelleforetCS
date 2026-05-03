'use client';

import { useState, useEffect } from 'react';
import { Loader2, Save, Trash2, Edit2, Plus, AlertCircle } from 'lucide-react';
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
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
        startDate: formData.startDate ? new Date(formData.startDate).toISOString() : null,
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : null,
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

      setMessage(isEditing ? '성공적으로 수정되었습니다!' : '성공적으로 등록되었습니다!');
      resetForm();
      fetchNotices();
    } catch (error: unknown) {
      setMessage((error as Error).message || '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (notice: OperationalNotice) => {
    // Convert ISO string to local datetime-local format if present
    const formatForInput = (isoString?: string) => {
      if (!isoString) return '';
      const date = new Date(isoString);
      // Adjust to local timezone for the input field
      return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
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

  const handleDelete = async (id: string) => {
    if (!confirm('정말로 삭제하시겠습니까?')) return;
    
    try {
      const response = await fetch(`/api/admin/operations?id=${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('삭제 실패');
      
      alert('삭제되었습니다.');
      if (editingId === id) {
        resetForm();
      }
      fetchNotices();
    } catch (error: unknown) {
      alert((error as Error).message);
    }
  };

  // Check if a notice is currently active based on date and toggle
  const checkIsCurrentlyActive = (notice: OperationalNotice) => {
    if (!notice.isActive) return false;
    const now = new Date();
    if (notice.startDate && new Date(notice.startDate) > now) return false;
    if (notice.endDate && new Date(notice.endDate) < now) return false;
    return true;
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">운영 현황 및 공지 관리</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          우천 통제, 시설 대관 등 유동적인 현황을 관리합니다. 여기에 등록된 활성화된 공지는 AI가 고객 질문 시 최우선 규칙으로 인지하여 답변합니다.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Section */}
        <div className="lg:col-span-1 bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-800 p-6 self-start sticky top-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {isEditing ? '공지 수정' : '새 공지 작성'}
            </h2>
            {isEditing && (
              <button onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700 flex items-center">
                <Plus className="w-4 h-4 mr-1" /> 신규 작성
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">제목 (구분용)</label>
              <input
                type="text"
                name="title"
                required
                value={formData.title}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                placeholder="예: 장마철 산책로 통제"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                공지 내용 (AI가 읽을 상세 정보)
              </label>
              <textarea
                name="content"
                required
                rows={5}
                value={formData.content}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                placeholder="예: 안전상의 이유로 수변 산책로 A구역 진입 전면 금지. 대체 경로로 B구역 안내 바람."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 text-gray-500">시작 일시 (선택)</label>
                <input
                  type="datetime-local"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 text-gray-500">종료 일시 (선택)</label>
                <input
                  type="datetime-local"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
              기간을 비워두면 상시 적용됩니다.
            </p>

            <div className="flex items-center mt-4">
              <input
                id="isActive"
                name="isActive"
                type="checkbox"
                checked={formData.isActive}
                onChange={handleChange}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900 dark:text-white font-medium">
                활성화 (AI에게 즉시 반영)
              </label>
            </div>

            {message && (
              <div className={`p-3 rounded-md text-sm flex items-start ${message.includes('성공') ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isEditing ? '공지 수정 완료' : '새 공지 등록'}
            </button>
          </form>
        </div>

        {/* List Section */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-neutral-800 flex justify-between items-center bg-gray-50/50 dark:bg-neutral-900/50">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">등록된 공지 목록</h3>
              <button onClick={fetchNotices} className="text-sm text-green-600 hover:text-green-700 flex items-center">
                새로고침
              </button>
            </div>

            {loadingManage ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
              </div>
            ) : notices.length === 0 ? (
              <div className="text-center py-16 px-4">
                <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">등록된 공지가 없습니다</h3>
                <p className="mt-1 text-sm text-gray-500">새로운 운영 현황이나 긴급 공지를 등록해 보세요.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-neutral-800">
                {notices.map((notice) => {
                  const isActiveNow = checkIsCurrentlyActive(notice);
                  
                  return (
                    <li key={notice.id} className={`p-4 sm:px-6 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors ${editingId === notice.id ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mr-3 ${
                            isActiveNow 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800' 
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                          }`}>
                            {isActiveNow ? 'AI 적용중' : '비활성/기간만료'}
                          </span>
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[200px] sm:max-w-xs">{notice.title}</h4>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEdit(notice)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md transition-colors"
                            title="수정"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => notice.id && handleDelete(notice.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-md transition-colors"
                            title="삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="mt-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-neutral-800 p-3 rounded-md border border-gray-100 dark:border-neutral-700 whitespace-pre-wrap">
                        {notice.content}
                      </div>
                      
                      <div className="mt-3 flex items-center text-xs text-gray-500 space-x-4">
                        {(notice.startDate || notice.endDate) ? (
                          <div className="flex items-center">
                            <span className="font-medium mr-1">적용 기간:</span>
                            {notice.startDate ? new Date(notice.startDate).toLocaleString() : '시작 지정 안됨'} 
                            {' ~ '} 
                            {notice.endDate ? new Date(notice.endDate).toLocaleString() : '종료 지정 안됨'}
                          </div>
                        ) : (
                          <span className="text-gray-400">상시 적용 (기간 없음)</span>
                        )}
                        {!notice.isActive && (
                          <span className="text-red-500 font-medium">(수동 비활성화됨)</span>
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
