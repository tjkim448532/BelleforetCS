'use client';

import { useState, useRef, useEffect } from 'react';
import { Loader2, Plus, Save, Upload, FileSpreadsheet, AlertCircle, X, Edit2, Trash2 } from 'lucide-react';
import Papa from 'papaparse';
import { Facility } from '@/lib/firestore';

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
  const [activeTab, setActiveTab] = useState<'single' | 'bulk' | 'manage' | 'categories'>('single');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkProgress, setBulkProgress] = useState({ total: 0, current: 0, failed: 0 });
  const [bulkErrors, setBulkErrors] = useState<{row: number, error: string}[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [csvText, setCsvText] = useState('');

  // Manage Data State
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loadingManage, setLoadingManage] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // Categories State
  const [categories, setCategories] = useState<string[]>(['레저', '숙박', '식음', '기타']);
  const [newCat, setNewCat] = useState('');
  const [editCat, setEditCat] = useState<{old: string, new: string} | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/admin/categories');
      if (res.ok) {
        const data = await res.json();
        if (data.categories) setCategories(data.categories);
        
        // formData.category 값이 받아온 카테고리에 없으면 첫번째 값으로 설정
        setFormData(prev => {
          if (data.categories && data.categories.length > 0 && !data.categories.includes(prev.category)) {
            return { ...prev, category: data.categories[0] };
          }
          return prev;
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCategoryAction = async (action: 'add' | 'update' | 'delete', payload: any) => {
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setCategories(data.categories);
      if (action === 'update' && data.updatedCount > 0) {
        alert(`카테고리가 변경되었으며, 기존에 해당 카테고리를 쓰던 시설 ${data.updatedCount}건이 모두 업데이트되었습니다.`);
        fetchFacilities();
      } else {
        alert('카테고리가 성공적으로 반영되었습니다.');
      }
      setNewCat('');
      setEditCat(null);
    } catch (e: any) {
      alert(e.message);
    }
  };

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
    } catch (error: unknown) {
      setMessage((error as Error).message || '오류가 발생했습니다.');
    } finally {
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
      setIsEditModalOpen(false);
      setFormData({ name: '', category: '레저', location: '', description: '', tags: '' });
      fetchFacilities();
    } catch (error: unknown) {
      alert((error as Error).message);
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
    } catch (error: unknown) {
      alert((error as Error).message);
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
    } catch (error: unknown) {
      alert((error as Error).message);
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
      } catch (err: unknown) {
        failed++;
        errors.push({ row: i + 1, error: (err as Error).message || '업로드 중 오류 발생' });
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
      error: (error: Error) => {
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
        <button
          onClick={() => setActiveTab('categories')}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'categories'
              ? 'border-green-500 text-green-600 dark:text-green-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          카테고리 관리
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
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
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
                              setSelectedIds(facilities.map(f => f.id as string).filter(Boolean));
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
                            checked={fac.id ? selectedIds.includes(fac.id) : false}
                            onChange={(e) => {
                              if (e.target.checked) {
                                if (fac.id) setSelectedIds(prev => [...prev, fac.id as string]);
                              } else {
                                setSelectedIds(prev => prev.filter(id => id !== fac.id));
                              }
                            }}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{fac.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{fac.category}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(fac.createdAt as string | undefined)}</td>
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
                              setEditingId(fac.id || null);
                              setIsEditModalOpen(true);
                            }}
                            className="text-blue-600 hover:text-blue-900 mr-4"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => fac.id && handleDelete(fac.id)}
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
        {activeTab === 'categories' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-3 sm:space-y-0">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">카테고리 관리</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">시설을 분류할 카테고리를 자유롭게 추가하거나 이름을 변경할 수 있습니다.</p>
              </div>
              <div className="flex w-full sm:w-auto space-x-2">
                <input
                  type="text"
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  placeholder="새 카테고리 (예: 이벤트)"
                  className="block w-full sm:w-48 rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                />
                <button
                  onClick={() => handleCategoryAction('add', { category: newCat })}
                  disabled={!newCat.trim()}
                  className="inline-flex items-center justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors shrink-0"
                >
                  <Plus className="w-4 h-4 mr-1" /> 추가
                </button>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300 flex items-start">
              <AlertCircle className="w-5 h-5 mr-2 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">카테고리 수정 시 주의사항</p>
                <p className="mt-1 text-blue-700 dark:text-blue-400">카테고리 이름을 수정하시면, <strong>해당 카테고리로 등록되어 있던 모든 기존 시설 데이터도 새로운 카테고리명으로 일괄 변경(마이그레이션)</strong>됩니다. 데이터 정합성을 위해 매우 유용한 기능입니다.</p>
              </div>
            </div>

            <div className="border rounded-lg dark:border-neutral-700 overflow-hidden">
              <ul className="divide-y divide-gray-200 dark:divide-neutral-700">
                {categories.map(cat => (
                  <li key={cat} className="flex items-center justify-between p-4 bg-white dark:bg-neutral-900 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors">
                    {editCat?.old === cat ? (
                      <div className="flex w-full items-center space-x-3">
                        <input
                          type="text"
                          value={editCat.new}
                          onChange={(e) => setEditCat({ ...editCat, new: e.target.value })}
                          className="flex-1 rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                        />
                        <button
                          onClick={() => handleCategoryAction('update', { oldCategory: cat, newCategory: editCat.new })}
                          disabled={!editCat.new.trim() || editCat.new === cat}
                          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => setEditCat(null)}
                          className="px-3 py-1.5 bg-gray-200 text-gray-700 dark:bg-neutral-700 dark:text-gray-300 text-sm rounded-md hover:bg-gray-300 dark:hover:bg-neutral-600"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium text-gray-900 dark:text-white">{cat}</span>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => setEditCat({ old: cat, new: cat })}
                            className="p-1.5 text-gray-500 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 dark:bg-neutral-800 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                            title="수정"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleCategoryAction('delete', { category: cat })}
                            className="p-1.5 text-gray-500 hover:text-red-600 bg-gray-50 hover:bg-red-50 dark:bg-neutral-800 dark:hover:bg-red-900/30 rounded-md transition-colors"
                            title="삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
                {categories.length === 0 && (
                  <li className="p-4 text-center text-gray-500 text-sm">등록된 카테고리가 없습니다.</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" aria-hidden="true" onClick={() => setIsEditModalOpen(false)}></div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="inline-block px-4 pt-5 pb-4 overflow-hidden text-left align-bottom transition-all transform bg-white dark:bg-neutral-900 rounded-lg shadow-xl sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full sm:p-6">
              <div className="flex justify-between items-center mb-5 border-b dark:border-neutral-800 pb-3">
                <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white" id="modal-title">
                  시설 정보 수정 (AI 지식 덮어쓰기)
                </h3>
                <button
                  type="button"
                  className="text-gray-400 bg-white dark:bg-neutral-900 hover:text-gray-500 focus:outline-none"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  <span className="sr-only">닫기</span>
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">시설명</label>
                    <input
                      type="text"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      className="mt-1 block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">카테고리</label>
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      className="mt-1 block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                    >
                      {categories.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
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
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">자연어 설명</label>
                  <textarea
                    name="description"
                    required
                    rows={5}
                    value={formData.description}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">태그 (쉼표 구분)</label>
                  <input
                    type="text"
                    name="tags"
                    value={formData.tags}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>

                <div className="mt-5 sm:mt-6 sm:flex sm:flex-row-reverse border-t dark:border-neutral-800 pt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 저장 중...</> : '저장 및 덮어쓰기'}
                  </button>
                  <button
                    type="button"
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                    onClick={() => setIsEditModalOpen(false)}
                  >
                    취소
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
