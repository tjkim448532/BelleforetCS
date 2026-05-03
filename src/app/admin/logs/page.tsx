'use client';

import { useState, useEffect, useMemo } from 'react';
import { Loader2, AlertCircle, RefreshCw, Download, BarChart2, ThumbsUp, ThumbsDown, Bot, Plus } from 'lucide-react';
import { ChatLog } from '@/lib/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function LogsAdmin() {
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Delete States
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // Suggestion States
  const [analyzingSuggestions, setAnalyzingSuggestions] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [addingSuggestionIndex, setAddingSuggestionIndex] = useState<number | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/logs');
      if (!res.ok) {
        throw new Error('데이터를 불러오는데 실패했습니다.');
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
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // CSV 다운로드 기능
  const exportToCSV = () => {
    if (logs.length === 0) return;
    
    // CSV 헤더
    const headers = ['일시', 'IP', '질문', '답변'];
    
    // CSV 데이터 행 (이스케이프 처리 포함)
    const csvRows = logs.map(log => {
      const date = formatDate(log.timestamp);
      const ip = log.ip || 'Unknown';
      const question = `"${log.question.replace(/"/g, '""')}"`;
      const answer = `"${log.answer.replace(/"/g, '""')}"`;
      return [date, ip, question, answer].join(',');
    });
    
    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `belleforet_chat_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말로 이 로그를 삭제하시겠습니까?')) return;
    
    try {
      const response = await fetch(`/api/admin/logs?id=${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('삭제 실패');
      
      alert('삭제되었습니다.');
      fetchLogs();
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
    } catch (error: unknown) {
      alert((error as Error).message);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      alert('삭제할 로그를 선택해주세요.');
      return;
    }
    
    if (!confirm(`선택한 ${selectedIds.length}개의 로그를 정말로 삭제하시겠습니까?`)) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/logs?ids=${selectedIds.join(',')}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('일괄 삭제 실패');
      
      alert('선택한 로그들이 삭제되었습니다.');
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
        alert('분석할 실패 로그가 없거나 보완이 필요한 지식이 발견되지 않았습니다.');
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
        tags: (suggestion.suggestedTags || '').split(',').map((t: string) => t.trim()).filter(Boolean),
        status: 'approved'
      };

      const response = await fetch('/api/admin/facility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('지식 추가 실패');
      
      alert('성공적으로 지식이 추가되고 시스템에 즉시 학습되었습니다!');
      // Remove the successfully added suggestion from the list
      setAiSuggestions(prev => prev.filter((_, i) => i !== index));
    } catch (error: any) {
      alert(error.message);
    } finally {
      setAddingSuggestionIndex(null);
    }
  };

  // 차트 데이터 연산 (일자별 질문 수)
  const dailyData = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach(log => {
      if (!log.timestamp) return;
      const date = log.timestamp.split('T')[0];
      counts[date] = (counts[date] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date: date.slice(5), count })); // MM-DD
  }, [logs]);

  // 주요 키워드 추출 (간단한 형태소 분석 대체)
  const keywordData = useMemo(() => {
    const stopWords = ['있나요', '어디에', '어떻게', '알려줘', '무엇인가요', '어디인가요', '몇시까지', '있나요?', '수', '할', '있는', '어디서', '어디', '어떤', '무슨', '무엇', '얼마인가요', '되나요'];
    const wordCounts: Record<string, number> = {};
    
    logs.forEach(log => {
      const words = log.question.split(/[\s,?.!]+/);
      words.forEach(w => {
        if (w.length > 1 && !stopWords.includes(w)) {
          wordCounts[w] = (wordCounts[w] || 0) + 1;
        }
      });
    });

    return Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10) // Top 10
      .map(([word, count]) => ({ word, count }));
  }, [logs]);

  // AI 답변 실패 및 불만족 데이터 추출 (제안 기능)
  const failedLogs = useMemo(() => {
    return logs.filter(log => log.feedback === 'down' || (log.contextUsed && log.contextUsed.length === 0) || log.answer.includes('제가 아는 정보가 없습니다'));
  }, [logs]);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <div className="border-b pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">대화 로그 분석</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            고객들이 챗봇에 질문한 내용과 AI의 답변 내역을 실시간으로 분석합니다.
          </p>
        </div>
        <div className="flex space-x-3">
          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="inline-flex items-center px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              선택 삭제 ({selectedIds.length})
            </button>
          )}
          <button
            onClick={exportToCSV}
            disabled={logs.length === 0}
            className="inline-flex items-center px-4 py-2 bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4 mr-2" />
            CSV 다운로드
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 bg-green-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-800 rounded-lg flex items-center border border-red-200">
          <AlertCircle className="w-5 h-5 mr-2" />
          {error}
        </div>
      )}

      {/* AI Auto-suggest Alert & Panel */}
      {!loading && failedLogs.length > 0 && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border-l-4 border-indigo-500 p-5 rounded-r-lg shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex">
              <div className="flex-shrink-0 mt-0.5">
                <Bot className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-base font-semibold text-indigo-900 dark:text-indigo-300">
                  AI 지식 보완 제안 (오답 분석)
                </h3>
                <div className="mt-2 text-sm text-indigo-800 dark:text-indigo-200">
                  <p>고객이 부정적인 피드백을 남겼거나 AI가 대답을 하지 못한 로그가 <strong>{failedLogs.length}건</strong> 감지되었습니다.</p>
                  <p className="mt-1">AI가 실패 로그들을 정독하여 우리 시스템에 어떤 지식을 추가해야 할지 자동으로 분석해 드립니다.</p>
                </div>
              </div>
            </div>
            <button
              onClick={handleAnalyzeSuggestions}
              disabled={analyzingSuggestions}
              className="whitespace-nowrap inline-flex items-center px-4 py-2 bg-indigo-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {analyzingSuggestions ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
              {analyzingSuggestions ? 'AI가 반성 중...' : '🤖 AI 오답 노트 분석'}
            </button>
          </div>

          {/* Suggestions List */}
          {aiSuggestions.length > 0 && (
            <div className="mt-6 space-y-4">
              <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-300 border-b border-indigo-200 dark:border-indigo-800 pb-2">
                ✨ AI가 제안하는 신규 지식 리스트
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {aiSuggestions.map((suggestion, idx) => (
                  <div key={idx} className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-indigo-100 dark:border-indigo-900/50 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 mb-2">
                          발견된 문제: {suggestion.problem}
                        </span>
                      </div>
                      <h5 className="text-lg font-bold text-gray-900 dark:text-white mt-1">{suggestion.suggestedName}</h5>
                      <span className="text-xs text-gray-500 bg-gray-100 dark:bg-neutral-700 px-2 py-0.5 rounded mt-1 inline-block">카테고리: {suggestion.suggestedCategory}</span>
                      <p className="mt-3 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-neutral-900/50 p-3 rounded-md">
                        {suggestion.suggestedDescription}
                      </p>
                      {suggestion.suggestedTags && (
                        <p className="mt-3 text-xs text-indigo-600 dark:text-indigo-400">
                          <strong>추천 태그:</strong> {suggestion.suggestedTags}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleAddSuggestion(suggestion, idx)}
                      disabled={addingSuggestionIndex === idx}
                      className="mt-4 w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors disabled:opacity-50"
                    >
                      {addingSuggestionIndex === idx ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 저장 및 학습 중...</>
                      ) : (
                        <><Plus className="w-4 h-4 mr-2" /> 이 지식 추가하기</>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Analytics Charts */}
      {!loading && logs.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-xl border border-gray-200 dark:border-neutral-800 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <BarChart2 className="w-5 h-5 mr-2 text-green-600" />
              일자별 질문 트렌드
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{fontSize: 12}} tickMargin={10} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{fill: 'rgba(0, 0, 0, 0.05)'}}
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}}
                  />
                  <Bar dataKey="count" name="질문 수" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 p-6 rounded-xl border border-gray-200 dark:border-neutral-800 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <BarChart2 className="w-5 h-5 mr-2 text-blue-600" />
              자주 묻는 키워드 (Top 10)
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={keywordData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                  <XAxis type="number" allowDecimals={false} tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                  <YAxis dataKey="word" type="category" tick={{fontSize: 12}} axisLine={false} tickLine={false} width={80} />
                  <Tooltip 
                    cursor={{fill: 'rgba(0, 0, 0, 0.05)'}}
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}}
                  />
                  <Bar dataKey="count" name="언급 횟수" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20">
            <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">기록된 대화가 없습니다</h3>
            <p className="mt-1 text-gray-500">아직 고객이 챗봇에 질문을 남기지 않았습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-700">
              <thead className="bg-gray-50 dark:bg-neutral-800">
                <tr>
                  <th className="px-6 py-4 text-left w-12">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      checked={logs.length > 0 && selectedIds.length === logs.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(logs.map(l => l.id as string).filter(Boolean));
                        } else {
                          setSelectedIds([]);
                        }
                      }}
                    />
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">일시 / IP</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/3">고객 질문</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">AI 답변</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">관리</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-neutral-800">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors align-top">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                        checked={log.id ? selectedIds.includes(log.id) : false}
                        onChange={(e) => {
                          if (e.target.checked) {
                            if (log.id) setSelectedIds(prev => [...prev, log.id as string]);
                          } else {
                            setSelectedIds(prev => prev.filter(id => id !== log.id));
                          }
                        }}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-200">
                        {formatDate(log.timestamp)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        IP: {log.ip || 'Unknown'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 dark:text-white bg-green-50 dark:bg-green-900/10 p-3 rounded-lg border border-green-100 dark:border-green-900/30 whitespace-pre-wrap">
                        {log.question}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-neutral-800 p-3 rounded-lg border border-gray-100 dark:border-neutral-700">
                        <div className="max-h-32 overflow-y-auto whitespace-pre-wrap scrollbar-hide">
                          {log.answer}
                        </div>
                        {log.feedback && (
                          <div className="mt-2 flex items-center pt-2 border-t border-gray-200 dark:border-neutral-700">
                            {log.feedback === 'up' ? (
                              <span className="flex items-center text-xs text-green-600 font-medium">
                                <ThumbsUp className="w-3.5 h-3.5 mr-1" /> 긍정적 피드백
                              </span>
                            ) : (
                              <span className="flex items-center text-xs text-red-600 font-medium">
                                <ThumbsDown className="w-3.5 h-3.5 mr-1" /> 부정적 피드백 (오답/부족)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => log.id && handleDelete(log.id)}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
