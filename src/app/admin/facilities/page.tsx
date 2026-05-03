'use client';

import { useState, useRef } from 'react';
import { Loader2, Plus, Save, Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import Papa from 'papaparse';

export default function FacilitiesAdmin() {
  const [formData, setFormData] = useState({
    name: '',
    category: '레저',
    location: '',
    description: '',
    tags: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  // Bulk Upload State
  const [activeTab, setActiveTab] = useState<'single' | 'bulk' | 'manage'>('single');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkProgress, setBulkProgress] = useState({ total: 0, current: 0, failed: 0 });
  const [bulkErrors, setBulkErrors] = useState<{row: number, error: string}[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [csvText, setCsvText] = useState('');

  // Manage Data State
  const [facilities, setFacilities] = useState<any[]>([]);
  const [loadingManage, setLoadingManage] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // 날짜 포맷팅 헬퍼
  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '-';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const fetchFacilities = async () => {
    setLoadingManage(true);
    try {
      const res = await fetch('/api/admin/facility');
      if (res.ok) {
        const data = await res.json();
        setFacilities(data.facilities || []);
      }
    } catch (e) {
      console.error('Failed to fetch facilities', e);
    } finally {
      setLoadingManage(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const payload = {
        ...formData,
        tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
        status: 'approved' // 테스트 시나리오를 위해 바로 승인 및 벡터화 트리거
      };

      const response = await fetch('/api/admin/facility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || '등록에 실패했습니다.');
      }

      setMessage('성공적으로 등록되고 시스템에 학습되었습니다!');
      setFormData({ name: '', category: '레저', location: '', description: '', tags: '' });
    } catch (error: any) {
      setMessage(error.message || '오류가 발생했습니다.');
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...formData,
        id: editingId,
        tags: typeof formData.tags === 'string' ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : formData.tags,
        status: 'approved'
      };

      const response = await fetch('/api/admin/facility', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('업데이트 실패');
      
      alert('성공적으로 수정 및 재학습되었습니다!');
      setEditingId(null);
      setFormData({ name: '', category: '레저', location: '', description: '', tags: '' });
      fetchFacilities();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말로 삭제하시겠습니까? (AI 학습 데이터도 함께 삭제됩니다)')) return;
    
    try {
      const response = await fetch(`/api/admin/facility?id=${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('삭제 실패');
      
      alert('삭제되었습니다.');
      fetchFacilities();
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      alert('삭제할 항목을 선택해주세요.');
      return;
    }
    
    if (!confirm(`선택한 ${selectedIds.length}개의 항목을 정말로 삭제하시겠습니까? (AI 학습 데이터도 함께 삭제됩니다)`)) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/facility?ids=${selectedIds.join(',')}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('일괄 삭제 실패');
      
      alert('선택한 항목들이 삭제되었습니다.');
      setSelectedIds([]);
      fetchFacilities();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const processBulkData = async (data: Record<string, string>[]) => {
    setBulkProgress({ total: data.length, current: 0, failed: 0 });
    setBulkErrors([]);
    setIsUploading(true);

    let current = 0;
    let failed = 0;
    const errors: {row: number, error: string}[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      const payload = {
        name: row['시설명'] || '',
        category: row['카테고리'] || '기타',
        location: row['위치'] || '',
        description: row['설명'] || '',
        tags: (row['태그'] || '').split(',').map(t => t.trim()).filter(Boolean),
        status: 'approved'
      };

      if (!payload.name || !payload.description) {
        failed++;
        errors.push({ row: i + 1, error: '시설명 또는 설명 누락 (필수 항목)' });
        current++;
        setBulkProgress({ total: data.length, current, failed });
        setBulkErrors([...errors]);
        continue;
      }

      try {
        const response = await fetch('/api/admin/facility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || '등록 실패');
        }
      } catch (err: any) {
        failed++;
        errors.push({ row: i + 1, error: err.message || '업로드 중 오류 발생' });
        setBulkErrors([...errors]);
      }

      current++;
      setBulkProgress({ total: data.length, current, failed });

      if (i < data.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 4500));
      }
    }

    setIsUploading(false);
    setBulkErrors(errors);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setCsvText('');
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        await processBulkData(results.data as Record<string, string>[]);
      },
      error: (error) => {
        alert('CSV 파일 파싱 중 오류가 발생했습니다: ' + error.message);
      }
    });
  };

  const handleBulkTextUpload = () => {
    if (!csvText.trim()) {
      alert('CSV 텍스트를 입력해주세요.');
      return;
    }
    
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        await processBulkData(results.data as Record<string, string>[]);
      },
      error: (error: any) => {
        alert('CSV 텍스트 파싱 중 오류가 발생했습니다: ' + error.message);
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8 border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">시설 정보 관리 (CMS)</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          벨포레의 시설 정보를 입력하세요. 입력된 정보는 AI가 학습하여 고객 질문 응답에 사용됩니다.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 mb-6 border-b dark:border-neutral-800">
        <button
          onClick={() => setActiveTab('single')}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'single'
              ? 'border-green-500 text-green-600 dark:text-green-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          개별 입력
        </button>
        <button
          onClick={() => setActiveTab('bulk')}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'bulk'
              ? 'border-green-500 text-green-600 dark:text-green-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          엑셀 일괄 업로드
        </button>
        <button
          onClick={() => {
            setActiveTab('manage');
            fetchFacilities();
            setSelectedIds([]);
          }}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'manage'
              ? 'border-green-500 text-green-600 dark:text-green-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          등록된 데이터 관리
        </button>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-800 p-6">
        {activeTab === 'single' ? (
          <form onSubmit={editingId ? handleUpdate : handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">시설명</label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                placeholder="예: 목장, 미디어아트센터"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">카테고리</label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              >
                <option value="레저">레저</option>
                <option value="숙박">숙박</option>
                <option value="식음">식음</option>
                <option value="기타">기타</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">위치</label>
            <input
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder="예: 셔틀버스 1정거장 근처"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">자연어 설명 (AI가 이해할 내용)</label>
            <textarea
              name="description"
              required
              rows={4}
              value={formData.description}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder="운영 시간, 특징, 주의사항 등을 상세한 문장으로 적어주세요. (예: 목장은 오전 10시부터 오후 5시까지 운영되며, 양떼 몰이 공연은 주말 오후 2시에 열립니다.)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">태그 (쉼표로 구분)</label>
            <input
              type="text"
              name="tags"
              value={formData.tags}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder="예: 아이동반, 야외, 우천시취소"
            />
          </div>

          {message && (
            <div className={`p-4 rounded-md text-sm ${message.includes('성공') ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>
              {message}
            </div>
          )}

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  저장 및 AI 학습하기
                </>
              )}
            </button>
          </div>
        </form>
        ) : activeTab === 'bulk' ? (
          <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300 flex items-center">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                CSV 업로드 가이드
              </h3>
              <p className="mt-2 text-sm text-blue-700 dark:text-blue-400">
                구글 시트나 엑셀에서 데이터를 작성한 후 <strong>.csv</strong> 파일로 다운로드하여 업로드하세요.<br/>
                첫 번째 줄(헤더)은 반드시 아래 이름을 사용해야 합니다:<br/>
                <code className="bg-blue-100 dark:bg-blue-800 px-1 py-0.5 rounded text-xs font-bold mt-2 inline-block">
                  시설명, 카테고리, 위치, 설명, 태그
                </code>
              </p>
              <p className="mt-2 text-xs text-blue-600 dark:text-blue-500">
                * AI 무료 요금제 제한(분당 15회) 방지를 위해 <strong>데이터 1건당 약 4.5초의 학습 시간</strong>이 소요됩니다. (창을 닫지 마세요)
              </p>
            </div>

            <div className="border-2 border-dashed border-gray-300 dark:border-neutral-700 rounded-lg p-8 text-center relative hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors">
              <input
                type="file"
                accept=".csv"
                ref={fileInputRef}
                onChange={handleBulkUpload}
                disabled={isUploading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                id="csv-upload"
              />
              <div className={`flex flex-col items-center justify-center pointer-events-none ${isUploading ? 'opacity-50' : ''}`}>
                <Upload className="w-10 h-10 text-gray-400 mb-3" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  CSV 파일 선택 또는 드래그 앤 드롭
                </span>
                <span className="text-xs text-gray-500 mt-1">.csv 확장자만 지원</span>
              </div>
            </div>

            <div className="relative border-t border-gray-200 dark:border-neutral-800 pt-6">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-gray-200 dark:border-neutral-700"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white dark:bg-neutral-900 px-2 text-sm text-gray-500">또는 직접 붙여넣기</span>
              </div>
            </div>

            <div className="space-y-3">
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="여기에 CSV 텍스트를 그대로 붙여넣으세요...&#10;예:&#10;시설명,카테고리,위치,설명,태그&#10;&quot;놀이기구&quot;,&quot;레저&quot;,,..."
                rows={6}
                disabled={isUploading}
                className="block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50 font-mono"
              />
              <button
                onClick={handleBulkTextUpload}
                disabled={isUploading || !csvText.trim()}
                className="w-full inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 transition-colors"
              >
                {isUploading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 업로드 중...</>
                ) : (
                  <><Save className="w-4 h-4 mr-2" /> 붙여넣은 텍스트로 업로드 시작</>
                )}
              </button>
            </div>

            {(isUploading || bulkProgress.total > 0) && (
              <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-neutral-800">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">
                    업로드 진행 상황 {bulkProgress.current} / {bulkProgress.total}
                  </span>
                  <span className="text-gray-500">
                    {Math.round((bulkProgress.current / (bulkProgress.total || 1)) * 100)}%
                  </span>
                </div>
                
                <div className="w-full bg-gray-200 dark:bg-neutral-800 rounded-full h-2.5">
                  <div 
                    className="bg-green-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${(bulkProgress.current / (bulkProgress.total || 1)) * 100}%` }}
                  ></div>
                </div>

                <div className="flex space-x-4 text-sm">
                  <span className="text-green-600 dark:text-green-400">성공: {bulkProgress.current - bulkProgress.failed}건</span>
                  <span className="text-red-600 dark:text-red-400">실패: {bulkProgress.failed}건</span>
                </div>

                {isUploading && (
                  <p className="text-sm text-gray-500 animate-pulse flex items-center">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    데이터를 순차적으로 AI에 학습시키는 중입니다...
                  </p>
                )}

                {!isUploading && bulkProgress.total > 0 && (
                  <p className="text-sm text-green-600 font-medium">
                    일괄 업로드가 완료되었습니다!
                  </p>
                )}

                {bulkErrors.length > 0 && (
                  <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-100 dark:border-red-800 max-h-40 overflow-y-auto">
                    <h4 className="text-sm font-medium text-red-800 dark:text-red-400 mb-2 flex items-center">
                      <AlertCircle className="w-4 h-4 mr-1" /> 실패 상세 내역
                    </h4>
                    <ul className="text-xs text-red-700 dark:text-red-300 space-y-1 list-disc list-inside">
                      {bulkErrors.map((err, idx) => (
                        <li key={idx}>Row {err.row}: {err.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">등록된 시설 목록</h3>
                <span className="text-sm text-gray-500 dark:text-gray-400">총 {facilities.length}개</span>
              </div>
              <div className="flex space-x-3">
                {selectedIds.length > 0 && (
                  <button
                    onClick={handleBulkDelete}
                    disabled={isDeleting}
                    className="inline-flex items-center text-sm px-3 py-1.5 bg-red-50 text-red-600 rounded-md hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                    선택 삭제 ({selectedIds.length})
                  </button>
                )}
                <button onClick={fetchFacilities} className="text-sm px-3 py-1.5 text-green-600 hover:text-green-700 bg-green-50 rounded-md border border-green-200 transition-colors">새로고침</button>
              </div>
            </div>
            
            {loadingManage ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
              </div>
            ) : facilities.length === 0 ? (
              <div className="text-center py-10 text-gray-500">등록된 데이터가 없습니다.</div>
            ) : (
              <div className="overflow-x-auto border rounded-lg dark:border-neutral-700">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-700">
                  <thead className="bg-gray-50 dark:bg-neutral-800">
                    <tr>
                      <th className="px-6 py-3 text-left w-12">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                          checked={facilities.length > 0 && selectedIds.length === facilities.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(facilities.map(f => f.id));
                            } else {
                              setSelectedIds([]);
                            }
                          }}
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">시설명</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">카테고리</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">등록일</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">관리</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-neutral-700">
                    {facilities.map((fac) => (
                      <tr key={fac.id} className="hover:bg-gray-50 dark:hover:bg-neutral-800/50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                            checked={selectedIds.includes(fac.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedIds(prev => [...prev, fac.id]);
                              } else {
                                setSelectedIds(prev => prev.filter(id => id !== fac.id));
                              }
                            }}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{fac.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{fac.category}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(fac.createdAt)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => {
                              setFormData({
                                name: fac.name,
                                category: fac.category,
                                location: fac.location || '',
                                description: fac.description,
                                tags: Array.isArray(fac.tags) ? fac.tags.join(', ') : (fac.tags || '')
                              });
                              setEditingId(fac.id);
                              setActiveTab('single');
                            }}
                            className="text-blue-600 hover:text-blue-900 mr-4"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDelete(fac.id)}
                            className="text-red-600 hover:text-red-900"
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
        )}
      </div>
    </div>
  );
}
