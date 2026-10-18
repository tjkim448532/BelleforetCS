'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Download,
  BarChart2,
  ThumbsUp,
  ThumbsDown,
  Bot,
  Plus,
  PieChart as PieChartIcon,
  Search,
  X,
  Edit3,
  Save,
} from 'lucide-react';
import { ChatLog } from '@/lib/firestore';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const COLORS = [
  '#16a34a',
  '#3b82f6',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
];

export default function LogsAdmin() {
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 필터 및 검색 상태
  const [filterMode, setFilterMode] = useState<'all' | 'failed' | 'good'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 삭제 상태
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // AI 오답노트 자동 제안 상태
  const [analyzingSuggestions, setAnalyzingSuggestions] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [addingSuggestionIndex, setAddingSuggestionIndex] = useState<number | null>(null);

  // 초보자용 "이 질문 정답 바로 가르쳐주기" 모달 상태
  const [teachModal, setTeachModal] = useState<{
    question: string;
    name: string;
    category: string;
    description: string;
    saving: boolean;
  } | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/logs');
      if (!res.ok) {
        throw new Error('대화 기록을 불러오는데 실패했습니다.');
      }
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const formatDate = (isoString: string) => {
    if (!isoString) return '-';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(
      d.getMinutes()
    ).padStart(2, '0')}`;
  };

  const isFailedLog = (log: ChatLog) => {
    return (
      log.feedback === 'down' ||
      (log.contextUsed && log.contextUsed.length === 0) ||
      (log.answer || '').includes('제가 아는 정보가 없습니다') ||
      (log.answer || '').includes('확인되지 않습니다') ||
      (log.answer || '').includes('어렵습니다')
    );
  };

  const failedLogs = useMemo(() => logs.filter(isFailedLog), [logs]);
  const goodLogs = useMemo(() => logs.filter((l) => l.feedback === 'up'), [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterMode === 'failed' && !isFailedLog(log)) return false;
      if (filterMode === 'good' && log.feedback !== 'up') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          (log.question || '').toLowerCase().includes(q) ||
          (log.answer || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logs, filterMode, searchQuery]);

  // CSV 다운로드 기능
  const exportToCSV = (onlyFailed = false) => {
    const targetList = onlyFailed ? failedLogs : logs;
    if (targetList.length === 0) {
      alert('다운로드할 대화 내역이 없습니다.');
      return;
    }

    const headers = ['일시', '고객 질문', 'AI 답변', '상태'];
    const csvRows = targetList.map((log) => {
      const date = formatDate(log.timestamp);
      const question = `"${(log.question || '').replace(/"/g, '""')}"`;
      const answer = `"${(log.answer || '').replace(/"/g, '""')}"`;
      const status = isFailedLog(log) ? '보완필요(미답변/불만족)' : '정상응답';
      return [date, question, answer, status].join(',');
    });

    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `belleforet_${onlyFailed ? 'failed_questions' : 'chat_logs'}_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 대화 기록을 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/admin/logs?id=${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('삭제 실패');

      fetchLogs();
      setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== id));
    } catch (error: unknown) {
      alert((error as Error).message);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`선택한 ${selectedIds.length}개의 대화 기록을 삭제하시겠습니까?`))
      return;

    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/admin/logs?ids=${selectedIds.join(',')}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) throw new Error('일괄 삭제 실패');

      setSelectedIds([]);
      fetchLogs();
    } catch (error: unknown) {
      alert((error as Error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAnalyzeSuggestions = async () => {
    setAnalyzingSuggestions(true);
    try {
      const res = await fetch('/api/admin/logs/suggestions');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAiSuggestions(data.suggestions || []);
      if (data.suggestions && data.suggestions.length === 0) {
        alert('현재 보완이 필요한 미답변 질문이 없습니다.');
      }
    } catch (error: any) {
      alert(error.message);
    } finally {
      setAnalyzingSuggestions(false);
    }
  };

  const handleAddSuggestion = async (suggestion: any, index: number) => {
    setAddingSuggestionIndex(index);
    try {
      const payload = {
        name: suggestion.suggestedName,
        category: suggestion.suggestedCategory || '기타',
        location: '',
        description: suggestion.suggestedDescription,
        tags: (suggestion.suggestedTags || '')
          .split(',')
          .map((t: string) => t.trim())
          .filter(Boolean),
        status: 'approved',
      };

      const response = await fetch('/api/admin/facility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('지식 추가 실패');

      alert('✅ AI 지식창고에 추가되어 지금부터 챗봇이 대답할 수 있습니다!');
      setAiSuggestions((prev) => prev.filter((_, i) => i !== index));
    } catch (error: any) {
      alert(error.message);
    } finally {
      setAddingSuggestionIndex(null);
    }
  };

  const handleSaveTeachModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teachModal) return;
    setTeachModal((prev) => (prev ? { ...prev, saving: true } : null));
    try {
      const res = await fetch('/api/admin/facility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: teachModal.name.trim(),
          category: teachModal.category,
          location: '',
          description: teachModal.description.trim(),
          tags: ['고객질문보완'],
          status: 'approved',
          duplicateAction: 'merge',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '지식 등록 실패');

      alert(
        `✅ "${teachModal.name}" 지식이 성공적으로 학습되었습니다!\n이제 같은 질문이 들어오면 AI가 정확히 대답합니다.`
      );
      setTeachModal(null);
    } catch (err: any) {
      alert(err.message);
      setTeachModal((prev) => (prev ? { ...prev, saving: false } : null));
    }
  };

  // 일자별 질문 차트 데이터
  const dailyData = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach((log) => {
      if (!log.timestamp) return;
      const date = log.timestamp.split('T')[0];
      counts[date] = (counts[date] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([date, count]) => ({ date: date.slice(5), count }));
  }, [logs]);

  // 핫 키워드 Top 5
  const keywordData = useMemo(() => {
    const stopWords = [
      '있나요',
      '어디에',
      '어떻게',
      '알려줘',
      '무엇인가요',
      '어디인가요',
      '몇시까지',
      '있나요?',
      '어디서',
      '어디',
      '어떤',
      '무슨',
      '무엇',
      '얼마인가요',
      '되나요',
      '안녕하세요',
      '벨포레',
      '리조트',
      '알려주세요',
      '궁금합니다',
      '대한',
      '대해',
      '부탁드립니다',
      '혹시',
    ];
    const wordCounts: Record<string, number> = {};

    logs.forEach((log) => {
      const rawWords = (log.question || '').split(/[\s,?.!]+/);
      rawWords.forEach((w) => {
        const word = w.replace(/(은|는|이|가|을|를|에|에서|의|로|으로)$/, '').trim();
        if (word.length >= 2 && !stopWords.includes(word)) {
          wordCounts[word] = (wordCounts[word] || 0) + 1;
        }
      });
    });

    return Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word, count]) => ({ name: word, value: count }));
  }, [logs]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
      {/* 상단 초보자 안내 배너 */}
      <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl shadow-xs border border-indigo-200 dark:border-indigo-900/50">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-indigo-100 text-indigo-800 mb-2">
              메뉴 3 · 상담 내역 및 AI 오답노트
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
              💬 고객 질문 내역 &amp; AI 오답노트
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              손님들이 챗봇에게 실제로 무엇을 물어봤는지 확인하고, <strong>AI가 몰라서 대답 못 한 질문은 [✏️ 정답 가르쳐주기] 버튼</strong>으로 바로 알려줄 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => exportToCSV(true)}
              disabled={failedLogs.length === 0}
              className="inline-flex items-center px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs sm:text-sm font-bold transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4 mr-1.5" />
              미답변 질문만 엑셀 저장 ({failedLogs.length}건)
            </button>
            <button
              onClick={() => exportToCSV(false)}
              disabled={logs.length === 0}
              className="inline-flex items-center px-3.5 py-2 bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-700 rounded-xl text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4 mr-1.5" />
              전체 대화 엑셀 저장
            </button>
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 rounded-xl text-xs sm:text-sm font-bold text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
          </div>
        </div>

        {/* 한눈에 보는 3대 요약 카드 (클릭 시 바로 필터링) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-5 border-t border-gray-100 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`text-left p-4 rounded-xl border transition-all ${
              filterMode === 'all'
                ? 'bg-gray-900 text-white border-gray-900 shadow-sm dark:bg-white dark:text-gray-900'
                : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-900 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white'
            }`}
          >
            <span className="text-xs font-bold opacity-80 block">1. 전체 고객 상담 건수 (클릭 시 전체보기)</span>
            <span className="text-2xl font-extrabold mt-1 block">{logs.length}건</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterMode('failed')}
            className={`text-left p-4 rounded-xl border transition-all ${
              filterMode === 'failed'
                ? 'bg-red-600 text-white border-red-700 shadow-sm'
                : 'bg-red-50/70 hover:bg-red-100/80 border-red-200 text-red-900 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
            }`}
          >
            <span className="text-xs font-bold opacity-90 block">
              2. 🚨 AI가 대답 못한 질문 (클릭 시 모아보기)
            </span>
            <span className="text-2xl font-extrabold mt-1 block">
              {failedLogs.length}건
              <span className="text-xs font-normal ml-2 opacity-85">
                {failedLogs.length > 0 ? '👈 눌러서 확인해보세요!' : '(모두 잘 대답함)'}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterMode('good')}
            className={`text-left p-4 rounded-xl border transition-all ${
              filterMode === 'good'
                ? 'bg-green-600 text-white border-green-700 shadow-sm'
                : 'bg-green-50/70 hover:bg-green-100/80 border-green-200 text-green-900 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
            }`}
          >
            <span className="text-xs font-bold opacity-90 block">
              3. 👍 고객이 만족(좋아요) 누른 답변
            </span>
            <span className="text-2xl font-extrabold mt-1 block">{goodLogs.length}건</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-800 rounded-xl flex items-center border border-red-200">
          <AlertCircle className="w-5 h-5 mr-2" />
          {error}
        </div>
      )}

      {/* AI 오답노트 자동 분석 배너 */}
      {!loading && failedLogs.length > 0 && (
        <div className="bg-indigo-50/80 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 p-5 rounded-2xl shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start">
              <Bot className="h-7 w-7 text-indigo-600 dark:text-indigo-400 mr-3 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-extrabold text-indigo-900 dark:text-indigo-200">
                  🤖 AI 오답노트 자동 분석 도우미 ({failedLogs.length}건 감지됨)
                </h3>
                <p className="mt-1 text-xs sm:text-sm text-indigo-800 dark:text-indigo-300">
                  오른쪽 버튼을 누르면 AI가 대답하지 못했던 질문들을 스스로 읽고, <strong>&quot;이런 지식을 추가하면 좋겠습니다&quot;</strong>라고 초안을 만들어 줍니다.
                </p>
              </div>
            </div>
            <button
              onClick={handleAnalyzeSuggestions}
              disabled={analyzingSuggestions}
              className="whitespace-nowrap inline-flex items-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-sm font-extrabold text-white transition-colors disabled:opacity-50 shrink-0"
            >
              {analyzingSuggestions ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Bot className="w-4 h-4 mr-2" />
              )}
              {analyzingSuggestions ? 'AI가 오답 분석 중...' : 'AI에게 보완할 지식 추천받기'}
            </button>
          </div>

          {aiSuggestions.length > 0 && (
            <div className="mt-5 pt-4 border-t border-indigo-200 dark:border-indigo-800 space-y-3">
              <h4 className="text-sm font-extrabold text-indigo-900 dark:text-indigo-200">
                ✨ AI가 추천하는 보완 지식 ({aiSuggestions.length}건) — 내용을 확인하고 [이 지식 추가하기]만 누르세요!
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {aiSuggestions.map((suggestion, idx) => (
                  <div
                    key={idx}
                    className="bg-white dark:bg-neutral-900 rounded-xl p-4 border border-indigo-200 dark:border-indigo-800 flex flex-col justify-between"
                  >
                    <div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800 mb-2">
                        원인: {suggestion.problem}
                      </span>
                      <h5 className="text-base font-extrabold text-gray-900 dark:text-white">
                        {suggestion.suggestedName}
                      </h5>
                      <span className="text-xs text-gray-500 bg-gray-100 dark:bg-neutral-800 px-2 py-0.5 rounded mt-1 inline-block">
                        분류: {suggestion.suggestedCategory}
                      </span>
                      <p className="mt-2.5 text-xs sm:text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-neutral-800 p-3 rounded-lg">
                        {suggestion.suggestedDescription}
                      </p>
                    </div>
                    <button
                      onClick={() => handleAddSuggestion(suggestion, idx)}
                      disabled={addingSuggestionIndex === idx}
                      className="mt-3 w-full inline-flex justify-center items-center px-4 py-2 text-xs sm:text-sm font-extrabold rounded-lg text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                    >
                      {addingSuggestionIndex === idx ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> AI에 학습 중...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-1.5" /> 이 지식 바로 추가하기
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 차트 요약 */}
      {!loading && logs.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-xs">
            <h3 className="text-base font-extrabold text-gray-900 dark:text-white mb-1 flex items-center">
              <BarChart2 className="w-5 h-5 mr-2 text-green-600" />
              날짜별 고객 질문 횟수 (최근 2주)
            </h3>
            <p className="text-xs text-gray-500 mb-4">어느 날에 손님들이 가장 많이 질문했는지 보여줍니다.</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="질문 수" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-xs">
            <h3 className="text-base font-extrabold text-gray-900 dark:text-white mb-1 flex items-center">
              <PieChartIcon className="w-5 h-5 mr-2 text-blue-600" />
              손님들이 가장 많이 찾은 단어 Top 5
            </h3>
            <p className="text-xs text-gray-500 mb-4">가장 문의가 많은 인기 시설이나 키워드입니다.</p>
            <div className="h-56 flex items-center justify-center">
              {keywordData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie
                      data={keywordData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) =>
                        `${name} ${((percent || 0) * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {keywordData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500 text-sm">데이터가 충분하지 않습니다.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 대화 목록 테이블 */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xs border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-gray-200 dark:border-neutral-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-50/50 dark:bg-neutral-900">
          <div className="flex items-center space-x-2">
            <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
              {filterMode === 'failed'
                ? `🚨 AI가 대답 못한 질문 목록 (${filteredLogs.length}건)`
                : filterMode === 'good'
                ? `👍 고객이 만족한 대화 목록 (${filteredLogs.length}건)`
                : `전체 대화 기록 (${filteredLogs.length}건)`}
            </h3>
            {filterMode !== 'all' && (
              <button
                onClick={() => setFilterMode('all')}
                className="text-xs text-blue-600 hover:underline font-bold"
              >
                [전체 보기로 돌아가기]
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="질문이나 답변 내용 검색..."
                className="w-full rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 pl-9 pr-8 py-1.5 text-sm focus:border-green-500 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {selectedIds.length > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-bold hover:bg-red-100 shrink-0"
              >
                선택 삭제 ({selectedIds.length})
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-16">
            <AlertCircle className="mx-auto h-10 w-10 text-gray-400 mb-3" />
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              해당하는 대화 내역이 없습니다
            </h3>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-700">
              <thead className="bg-gray-50 dark:bg-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-green-600"
                      checked={
                        filteredLogs.length > 0 &&
                        selectedIds.length === filteredLogs.length
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(
                            filteredLogs.map((l) => l.id as string).filter(Boolean)
                          );
                        } else {
                          setSelectedIds([]);
                        }
                      }}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 w-36">
                    질문 시각
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 w-1/3">
                    손님이 물어본 질문
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500">
                    AI 챗봇의 답변
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 w-36">
                    관리 / 정답 가르치기
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-neutral-800">
                {filteredLogs.map((log) => {
                  const failed = isFailedLog(log);
                  return (
                    <tr
                      key={log.id}
                      className={`hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors align-top ${
                        failed ? 'bg-red-50/20 dark:bg-red-900/5' : ''
                      }`}
                    >
                      <td className="px-4 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-green-600"
                          checked={log.id ? selectedIds.includes(log.id) : false}
                          onChange={(e) => {
                            if (e.target.checked) {
                              if (log.id)
                                setSelectedIds((prev) => [...prev, log.id as string]);
                            } else {
                              setSelectedIds((prev) =>
                                prev.filter((id) => id !== log.id)
                              );
                            }
                          }}
                        />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                          {formatDate(log.timestamp)}
                        </div>
                        {failed && (
                          <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800">
                            🚨 보완 필요
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-900 dark:text-white bg-green-50/70 dark:bg-green-900/10 p-3 rounded-xl border border-green-100 dark:border-green-900/30 whitespace-pre-wrap">
                          {log.question}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-neutral-800 p-3 rounded-xl border border-gray-100 dark:border-neutral-700">
                          <div className="max-h-32 overflow-y-auto whitespace-pre-wrap">
                            {log.answer}
                          </div>
                          {log.feedback && (
                            <div className="mt-2 flex items-center pt-2 border-t border-gray-200 dark:border-neutral-700">
                              {log.feedback === 'up' ? (
                                <span className="flex items-center text-xs text-green-600 font-bold">
                                  <ThumbsUp className="w-3.5 h-3.5 mr-1" /> 고객이 &apos;도움돼요&apos;를 눌렀습니다
                                </span>
                              ) : (
                                <span className="flex items-center text-xs text-red-600 font-bold">
                                  <ThumbsDown className="w-3.5 h-3.5 mr-1" /> 고객이 &apos;아쉬워요&apos;를 눌렀습니다
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right text-xs font-medium space-y-2">
                        <button
                          type="button"
                          onClick={() =>
                            setTeachModal({
                              question: log.question,
                              name: log.question.slice(0, 30),
                              category: '기타',
                              description: '',
                              saving: false,
                            })
                          }
                          className="w-full inline-flex items-center justify-center px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-bold transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5 mr-1" /> 정답 가르치기
                        </button>
                        <button
                          type="button"
                          onClick={() => log.id && handleDelete(log.id)}
                          className="w-full inline-flex items-center justify-center px-2.5 py-1 text-gray-400 hover:text-red-600 rounded-lg transition-colors"
                        >
                          기록 삭제
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ✏️ 초보자용 "이 질문 정답 바로 가르쳐주기" 모달 */}
      {teachModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div
              className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs"
              onClick={() => !teachModal.saving && setTeachModal(null)}
            />
            <div className="relative w-full max-w-lg p-6 bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border dark:border-neutral-800 z-10">
              <div className="flex justify-between items-center border-b dark:border-neutral-800 pb-3 mb-4">
                <h3 className="text-lg font-extrabold text-gray-900 dark:text-white">
                  ✏️ AI에게 이 질문의 정답 가르쳐주기
                </h3>
                <button
                  type="button"
                  onClick={() => !teachModal.saving && setTeachModal(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-4 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 text-xs text-green-900 dark:text-green-200">
                <span className="font-bold block mb-1">💬 손님이 실제로 물어본 질문:</span>
                &quot;{teachModal.question}&quot;
              </div>

              <form onSubmit={handleSaveTeachModal} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      1. 지식 제목 (시설명 또는 주제)
                    </label>
                    <input
                      type="text"
                      required
                      value={teachModal.name}
                      onChange={(e) =>
                        setTeachModal((prev) =>
                          prev ? { ...prev, name: e.target.value } : null
                        )
                      }
                      placeholder="예: 유모차 대여 안내"
                      className="w-full rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      2. 분류
                    </label>
                    <select
                      value={teachModal.category}
                      onChange={(e) =>
                        setTeachModal((prev) =>
                          prev ? { ...prev, category: e.target.value } : null
                        )
                      }
                      className="w-full rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                    >
                      {['레저', '숙박', '식음', '편의', '기타'].map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    3. 앞으로 이렇게 대답해 주세요 (정답 내용)
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={teachModal.description}
                    onChange={(e) =>
                      setTeachModal((prev) =>
                        prev ? { ...prev, description: e.target.value } : null
                      )
                    }
                    placeholder="예: 유모차는 웰컴센터 프런트에서 신분증 보관 후 무료로 대여하실 수 있습니다."
                    className="w-full rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-3 border-t dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setTeachModal(null)}
                    disabled={teachModal.saving}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-xs font-bold text-gray-700"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={teachModal.saving}
                    className="inline-flex items-center px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-xs font-extrabold text-white"
                  >
                    {teachModal.saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> 저장 중...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-1.5" /> AI 지식창고에 저장하기
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
