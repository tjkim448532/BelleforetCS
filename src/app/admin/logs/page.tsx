'use client';

import { useState, useEffect, useMemo } from 'react';
import { Loader2, AlertCircle, RefreshCw, Download, BarChart2 } from 'lucide-react';
import { ChatLog } from '@/lib/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function LogsAdmin() {
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">일시 / IP</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/3">고객 질문</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">AI 답변</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-neutral-800">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors align-top">
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
                      </div>
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
