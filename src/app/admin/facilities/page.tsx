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
    seasonalDescription: '',
    tags: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [duplicateAction, setDuplicateAction] = useState<'merge' | 'overwrite'>('merge');
  const [showAdvancedSingle, setShowAdvancedSingle] = useState(false);
  const [showAdvancedBulk, setShowAdvancedBulk] = useState(false);
  
  // Bulk Upload State
  const [activeTab, setActiveTab] = useState<'single' | 'bulk' | 'manage' | 'categories' | 'audit'>('single');
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
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingFailed, setIsExportingFailed] = useState(false);

  // Categories State
  const [categories, setCategories] = useState<string[]>(['레저', '숙박', '식음', '기타']);
  const [newCat, setNewCat] = useState('');
  const [editCat, setEditCat] = useState<{old: string, new: string} | null>(null);

  // Smart Edit State
  const [smartEditInstruction, setSmartEditInstruction] = useState('');
  const [smartEditResult, setSmartEditResult] = useState<{summary: string, updatedText: string} | null>(null);
  const [isSmartEditing, setIsSmartEditing] = useState(false);

  // RAG Audit & Cleaner State
  const [auditData, setAuditData] = useState<any | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [isSyncingVectors, setIsSyncingVectors] = useState(false);
  const [isExpiringItems, setIsExpiringItems] = useState(false);
  const [homepageSyncInfo, setHomepageSyncInfo] = useState<any | null>(null);
  const [isSyncingHomepage, setIsSyncingHomepage] = useState(false);
  const [mergeModal, setMergeModal] = useState<{
    group: any;
    masterId: string;
    name: string;
    category: string;
    location: string;
    description: string;
    seasonalDescription: string;
    tags: string;
    summary: string;
    isGenerating: boolean;
    isExecuting: boolean;
  } | null>(null);

  useEffect(() => {
    fetchCategories();
    fetchFacilities();
  }, []);

  const fetchHomepageSyncInfo = async () => {
    try {
      const res = await fetch('/api/admin/facility/homepage-sync');
      if (res.ok) {
        const data = await res.json();
        setHomepageSyncInfo(data);
      }
    } catch (e) {
      console.error('Failed to fetch homepage sync info:', e);
    }
  };

  const handleHomepageSync = async () => {
    setIsSyncingHomepage(true);
    try {
      const res = await fetch('/api/admin/facility/homepage-sync', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '홈페이지 동기화 실패');
      const r = data.result;
      alert(
        `공식 홈페이지 최신 정보 동기화 완료!\n` +
        `- 골프장 요금 반영: ${r.golfUpdated}건\n` +
        `- 식음 매장 운영시간/휴무일 반영: ${r.diningUpserted}곳\n` +
        `- 특가 패키지 최신 반영: ${r.offersUpserted}건\n` +
        `- 종료된 패키지 자동 만료: ${r.offersExpired}건`
      );
      await Promise.all([fetchHomepageSyncInfo(), runRagAudit(), fetchFacilities()]);
    } catch (e: any) {
      alert(e.message || '홈페이지 동기화 중 오류가 발생했습니다.');
    } finally {
      setIsSyncingHomepage(false);
    }
  };

  const runRagAudit = async () => {
    setLoadingAudit(true);
    fetchHomepageSyncInfo();
    try {
      const res = await fetch('/api/admin/facility/audit');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '진단 실패');
      setAuditData(data);
    } catch (e: any) {
      alert(e.message || 'RAG 데이터 진단 중 오류가 발생했습니다.');
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleSyncVectors = async () => {
    setIsSyncingVectors(true);
    try {
      const res = await fetch('/api/admin/facility/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_vectors' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '동기화 실패');
      alert(`동기화 완료! (유령 벡터 ${data.deletedGhostCount}건 삭제, 누락 벡터 ${data.upsertedMissingCount}건 복구)`);
      await runRagAudit();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsSyncingVectors(false);
    }
  };

  const handleOpenMergeModal = async (group: any) => {
    const masterItem = group.items.find((it: any) => it.id === group.masterId) || group.items[0];
    setMergeModal({
      group,
      masterId: group.masterId,
      name: group.masterName,
      category: group.category,
      location: masterItem?.location || '',
      description: '',
      seasonalDescription: '',
      tags: (masterItem?.tags || []).join(', '),
      summary: '',
      isGenerating: true,
      isExecuting: false,
    });

    try {
      const res = await fetch('/api/admin/facility/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview_merge',
          ids: group.items.map((it: any) => it.id),
          masterName: group.masterName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI 통합 초안 생성 실패');

      setMergeModal(prev =>
        prev
          ? {
              ...prev,
              description: data.preview.description,
              seasonalDescription: data.preview.seasonalDescription || '',
              tags: (data.preview.tags || []).join(', '),
              summary: data.preview.summary,
              isGenerating: false,
            }
          : null
      );
    } catch (e: any) {
      alert(e.message);
      setMergeModal(null);
    }
  };

  const handleExecuteMerge = async () => {
    if (!mergeModal) return;
    setMergeModal(prev => (prev ? { ...prev, isExecuting: true } : null));
    try {
      const res = await fetch('/api/admin/facility/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute_merge',
          masterId: mergeModal.masterId,
          sourceIds: mergeModal.group.items.map((it: any) => it.id),
          name: mergeModal.name,
          category: mergeModal.category,
          location: mergeModal.location,
          description: mergeModal.description,
          seasonalDescription: mergeModal.seasonalDescription,
          tags: mergeModal.tags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '병합 실행 실패');

      alert(`통합 완료! "${mergeModal.name}" 마스터 문서로 병합되었으며, 파편 문서 ${data.deletedCount}건이 정리되었습니다.`);
      setMergeModal(null);
      await Promise.all([runRagAudit(), fetchFacilities()]);
    } catch (e: any) {
      alert(e.message);
      setMergeModal(prev => (prev ? { ...prev, isExecuting: false } : null));
    }
  };

  const handleExpireAction = async (payload: { facilityIds?: string[]; clearSeasonalIds?: string[]; noticeIds?: string[] }) => {
    setIsExpiringItems(true);
    try {
      const res = await fetch('/api/admin/facility/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'expire_items', ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '만료 처리 실패');

      alert('정리가 완료되었습니다. (AI 검색 대상에서 즉시 제외되었습니다)');
      await Promise.all([runRagAudit(), fetchFacilities()]);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsExpiringItems(false);
    }
  };

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

  // 날짜 포맷팅 헬퍼 (시간 제외, 날짜만 표시)
  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '-';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const fetchFacilities = async () => {
    setLoadingManage(true);
    try {
      const res = await fetch('/api/admin/facility');
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.facilities || []).filter((f: any) => f.type !== 'faq');
        setFacilities(filtered);
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

  const handleSmartEdit = async () => {
    if (!smartEditInstruction.trim()) {
      alert('수정 지시어를 입력해주세요.');
      return;
    }
    
    setIsSmartEditing(true);
    setSmartEditResult(null);
    try {
      const res = await fetch('/api/admin/facility/smart-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalText: formData.description,
          instruction: smartEditInstruction
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setSmartEditResult(data);
    } catch (e: any) {
      alert(e.message || 'AI 수정 중 오류가 발생했습니다.');
    } finally {
      setIsSmartEditing(false);
    }
  };

  const applySmartEdit = () => {
    if (smartEditResult) {
      setFormData(prev => ({ ...prev, description: smartEditResult.updatedText }));
      setSmartEditResult(null);
      setSmartEditInstruction('');
    }
  };

  const handleSmartSplit = async () => {
    if (!formData.description) {
      alert('분류할 설명글을 먼저 입력해주세요.');
      return;
    }
    
    setIsSmartEditing(true);
    try {
      const res = await fetch('/api/admin/facility/smart-split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: formData.description + (formData.seasonalDescription ? '\\n' + formData.seasonalDescription : '') })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setFormData(prev => ({
        ...prev,
        description: data.description,
        seasonalDescription: data.seasonalDescription
      }));
      alert('성공적으로 분리되었습니다.');
    } catch (e: any) {
      alert(e.message || 'AI 자동 분류 중 오류가 발생했습니다.');
    } finally {
      setIsSmartEditing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const payload = {
        ...formData,
        tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
        status: 'approved', // 테스트 시나리오를 위해 바로 승인 및 벡터화 트리거
        duplicateAction
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
      setFormData({ name: '', category: '레저', location: '', description: '', seasonalDescription: '', tags: '' });
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
      setSmartEditResult(null);
      setSmartEditInstruction('');
      setFormData({ name: '', category: '레저', location: '', description: '', seasonalDescription: '', tags: '' });
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

  const handleExportBible = async () => {
    try {
      setIsExporting(true);
      const response = await fetch('/api/admin/facility/export-bible');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '백서 추출 실패');
      }

      // CSV 텍스트로 다운로드
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Content-Disposition 헤더에서 파일명을 가져올 수도 있지만, 클라이언트에서도 바로 지정 가능합니다.
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `belleforet_golden_record_${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: unknown) {
      alert(`백서 추출 중 오류가 발생했습니다: ${(error as Error).message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportFailedLogs = async () => {
    try {
      setIsExportingFailed(true);
      const response = await fetch('/api/admin/logs/export-failed');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '미답변 질문 추출 실패');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `unanswered_questions_${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: unknown) {
      alert(`추출 중 오류가 발생했습니다: ${(error as Error).message}`);
    } finally {
      setIsExportingFailed(false);
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
        seasonalDescription: row['시즌설명'] || '',
        tags: (row['태그'] || '').split(',').map(t => t.trim()).filter(Boolean),
        status: 'approved',
        duplicateAction
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

  const filteredFacilities = facilities.filter(fac => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (fac.name || '').toLowerCase().includes(q) ||
      (fac.category || '').toLowerCase().includes(q) ||
      (fac.location || '').toLowerCase().includes(q) ||
      (fac.description || '').toLowerCase().includes(q) ||
      (fac.seasonalDescription || '').toLowerCase().includes(q)
    );
  });

  // 입구 방어 (Input-Time Prevention Guard): 입력 중인 시설명과 유사/동일한 기존 마스터 시설 감지
  const matchedMasterFacility = (() => {
    const typed = formData.name.trim();
    if (typed.length < 2 || editingId) return null;
    const normTyped = typed.replace(/\s+/g, '').toLowerCase();
    const genericWords = new Set(['이벤트', '패키지', 'pkg', '숙박', '레저', '식음', '기타', '할인', '요금']);

    return facilities.find(f => {
      if (f.status === 'expired' || !f.name) return false;
      const normExist = f.name.replace(/\([^)]*\)/g, '').replace(/\s+/g, '').toLowerCase().trim();
      if (!normExist || genericWords.has(normExist)) return false;
      if (normTyped === normExist) return true;
      if (normExist.length >= 2 && (normTyped.startsWith(normExist) || normTyped.includes(normExist))) {
        return true;
      }
      return false;
    }) || null;
  })();

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8 border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">시설 정보 관리 (CMS)</h1>
        <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
          <h3 className="text-sm font-bold text-blue-800 dark:text-blue-300 flex items-center mb-1">
            <span className="mr-2">📚</span> 이 메뉴는 언제 쓰나요? (평상시 기본 안내서)
          </h3>
          <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
            <li>운영 시간, 기본 요금, 키 제한, 위치 등 <strong>변하지 않는 고정 정보</strong>를 등록합니다.</li>
            <li>새로운 놀이기구가 생겼거나 기본 요금표 자체가 바뀌었을 때만 수정하세요.</li>
            <li><span className="font-semibold text-red-600 dark:text-red-400">주의:</span> 오늘 비가 와서 갑자기 문을 닫는 등의 임시 정보는 반드시 <strong>[운영 현황 / 공지]</strong> 메뉴에 적어주세요!</li>
          </ul>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 sm:space-x-4 mb-6 border-b dark:border-neutral-800">
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
        <button
          onClick={() => {
            setActiveTab('audit');
            runRagAudit();
          }}
          className={`pb-3 px-2 text-sm font-bold border-b-2 transition-colors flex items-center ${
            activeTab === 'audit'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-indigo-600/80 hover:text-indigo-700 dark:text-indigo-400'
          }`}
        >
          🧹 RAG 데이터 진단 / 자동 정리
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
              {matchedMasterFacility && (
                <div className="mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-300 space-y-2">
                  <p className="font-semibold flex items-center">
                    <span className="mr-1.5">💡</span>
                    파편화 방지 가드: 이미 마스터 시설 [{matchedMasterFacility.name}] 항목이 등록되어 있습니다!
                  </p>
                  <p className="text-amber-700 dark:text-amber-400 leading-relaxed">
                    예: <code>&quot;{matchedMasterFacility.name} 요금&quot;</code>처럼 별도 항목으로 쪼개어 등록하면 AI 검색 정확도가 떨어집니다. 기존 <strong>[{matchedMasterFacility.name}]</strong>에 내용을 합치시겠습니까?
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {formData.name.trim() !== matchedMasterFacility.name && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            name: matchedMasterFacility.name,
                            category: matchedMasterFacility.category || prev.category,
                            location: prev.location || matchedMasterFacility.location || '',
                          }));
                          setDuplicateAction('merge');
                        }}
                        className="px-2.5 py-1 bg-amber-600 text-white rounded font-medium hover:bg-amber-700 transition-colors"
                      >
                        시설명을 &apos;{matchedMasterFacility.name}&apos;(으)로 맞추고 AI 자동 병합하기
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({
                          name: matchedMasterFacility.name,
                          category: matchedMasterFacility.category || '레저',
                          location: matchedMasterFacility.location || '',
                          description: matchedMasterFacility.description || '',
                          seasonalDescription: matchedMasterFacility.seasonalDescription || '',
                          tags: Array.isArray(matchedMasterFacility.tags)
                            ? matchedMasterFacility.tags.join(', ')
                            : (matchedMasterFacility.tags || ''),
                        });
                      }}
                      className="px-2.5 py-1 bg-white dark:bg-neutral-800 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 rounded font-medium hover:bg-amber-100 transition-colors"
                    >
                      기존 &apos;{matchedMasterFacility.name}&apos; 전체 내용 불러오기
                    </button>
                  </div>
                </div>
              )}
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
            <div className="flex justify-between items-end mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">자연어 설명 (AI가 이해할 내용 - 고정 정보)</label>
              <button
                type="button"
                onClick={handleSmartSplit}
                disabled={isSmartEditing || !formData.description}
                className="inline-flex items-center text-xs px-2 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 rounded transition-colors disabled:opacity-50"
              >
                {isSmartEditing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : '✨ AI 자동 분류 (고정/시즌)'}
              </button>
            </div>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">시즌/시기별 안내 (선택)</label>
            <textarea
              name="seasonalDescription"
              rows={3}
              value={formData.seasonalDescription}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="여름 시즌, 특정 요일, 공사 기간 등 일시적으로 적용되는 정보만 따로 적어주세요. (예: 7~8월 폭염 기간에는 양몰이 공연 대신 동물 설명회를 진행합니다.)"
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

          {/* 중복 데이터 처리 방식 (고급 옵션으로 숨김) */}
          <div className="border-t border-gray-200 dark:border-neutral-800 pt-6">
            <button
              type="button"
              onClick={() => setShowAdvancedSingle(!showAdvancedSingle)}
              className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 flex items-center transition-colors"
            >
              {showAdvancedSingle ? '[-] 고급 옵션 닫기' : '[+] 고급 옵션 보기 (중복 데이터 처리 방식)'}
            </button>
            
            {showAdvancedSingle && (
              <div className="mt-4 p-4 bg-gray-50 dark:bg-neutral-800/50 rounded-lg border border-gray-200 dark:border-neutral-700">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  중복 데이터 처리 방식 (동일한 시설명이 이미 존재할 경우)
                </label>
                <div className="flex space-x-6">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="singleDuplicateAction"
                      value="merge"
                      checked={duplicateAction === 'merge'}
                      onChange={(e) => setDuplicateAction(e.target.value as 'merge' | 'overwrite')}
                      className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">내용 병합하기 (추천)</span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="singleDuplicateAction"
                      value="overwrite"
                      checked={duplicateAction === 'overwrite'}
                      onChange={(e) => setDuplicateAction(e.target.value as 'merge' | 'overwrite')}
                      className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500"
                    />
                    <span className="ml-2 text-sm text-red-600 dark:text-red-400 font-medium">덮어쓰기 (기존 내용 완전 삭제)</span>
                  </label>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  * <strong>내용 병합하기(추천)</strong>: AI가 기존 내용과 새 내용을 똑똑하게 합칩니다. <br/>
                  * <strong>덮어쓰기</strong>: 시설 리뉴얼 등 <strong>기존 데이터를 완전히 초기화</strong>해야 할 때만 제한적으로 사용하세요.
                </p>
              </div>
            )}
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
                  시설명, 카테고리, 위치, 설명, 시즌설명, 태그
                </code>
              </p>
              <p className="mt-2 text-xs text-blue-600 dark:text-blue-500">
                * AI 무료 요금제 제한(분당 15회) 방지를 위해 <strong>데이터 1건당 약 4.5초의 학습 시간</strong>이 소요됩니다. (창을 닫지 마세요)
              </p>
            </div>

            <div className="bg-white dark:bg-neutral-800 p-4 rounded-lg border border-gray-200 dark:border-neutral-700">
              <button
                type="button"
                onClick={() => setShowAdvancedBulk(!showAdvancedBulk)}
                className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 flex items-center transition-colors mb-2"
              >
                {showAdvancedBulk ? '[-] 고급 옵션 닫기' : '[+] 고급 옵션 보기 (중복 데이터 처리 방식)'}
              </button>
              
              {showAdvancedBulk && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-neutral-700">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    중복 데이터 처리 방식 (동일한 시설명이 이미 존재할 경우)
                  </label>
                  <div className="flex space-x-6">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="bulkDuplicateAction"
                        value="merge"
                        checked={duplicateAction === 'merge'}
                        onChange={(e) => setDuplicateAction(e.target.value as 'merge' | 'overwrite')}
                        className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500"
                      />
                      <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">내용 병합하기 (추천)</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="bulkDuplicateAction"
                        value="overwrite"
                        checked={duplicateAction === 'overwrite'}
                        onChange={(e) => setDuplicateAction(e.target.value as 'merge' | 'overwrite')}
                        className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500"
                      />
                      <span className="ml-2 text-sm text-red-600 dark:text-red-400 font-medium">덮어쓰기 (기존 내용 완전 삭제)</span>
                    </label>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    * <strong>내용 병합하기(추천)</strong>: AI가 기존 내용과 새 내용을 똑똑하게 합칩니다. <br/>
                    * <strong>덮어쓰기</strong>: 기존 데이터를 완전히 무시하고 CSV 내용으로 초기화할 때만 사용하세요.
                  </p>
                </div>
              )}
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
                placeholder="여기에 CSV 텍스트를 그대로 붙여넣으세요...&#10;예:&#10;시설명,카테고리,위치,설명,시즌설명,태그&#10;&quot;놀이기구&quot;,&quot;레저&quot;,,..."
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
            <div className="flex flex-col space-y-4 lg:flex-row lg:space-y-0 lg:justify-between lg:items-center">
              <div className="flex items-center space-x-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">등록된 시설 목록</h3>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {searchQuery ? `검색결과 ${filteredFacilities.length}개 (총 ${facilities.length}개)` : `총 ${facilities.length}개`}
                </span>
              </div>
              <div className="flex flex-wrap gap-3 items-center">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="시설명, 내용 검색..."
                    className="block w-full sm:w-64 rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm focus:border-green-500 focus:outline-none"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button 
                  onClick={handleExportBible} 
                  disabled={isExporting || facilities.length === 0}
                  className="inline-flex items-center text-sm px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-md hover:bg-yellow-100 border border-yellow-200 transition-colors disabled:opacity-50 font-medium"
                >
                  {isExporting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <span className="mr-1.5">✨</span>}
                  {isExporting ? 'AI 백서 추출 중...' : 'AI 데이터 백서 추출 (Excel)'}
                </button>
                <button 
                  onClick={handleExportFailedLogs} 
                  disabled={isExportingFailed}
                  className="inline-flex items-center text-sm px-3 py-1.5 bg-purple-50 text-purple-700 rounded-md hover:bg-purple-100 border border-purple-200 transition-colors disabled:opacity-50 font-medium"
                >
                  {isExportingFailed ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <span className="mr-1.5">🚨</span>}
                  {isExportingFailed ? '추출 중...' : '미답변 질문 리스트 추출 (Excel)'}
                </button>
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
            ) : filteredFacilities.length === 0 ? (
              <div className="text-center py-10 text-gray-500">'{searchQuery}'에 대한 검색 결과가 없습니다.</div>
            ) : (
              <div className="overflow-x-auto border rounded-lg dark:border-neutral-700">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-700">
                  <thead className="bg-gray-50 dark:bg-neutral-800">
                    <tr>
                      <th className="px-6 py-3 text-left w-12">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                          checked={filteredFacilities.length > 0 && selectedIds.length === filteredFacilities.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(filteredFacilities.map(f => f.id as string).filter(Boolean));
                            } else {
                              setSelectedIds([]);
                            }
                          }}
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">시설명</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">카테고리</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">고정 정보 (요약)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">시즌 정보</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">등록일</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">관리</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-neutral-700">
                    {filteredFacilities.map((fac) => (
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          <div className="flex items-center space-x-2">
                            <span>{fac.name}</span>
                            {fac.status === 'expired' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-gray-400 border border-gray-200 dark:border-neutral-700">
                                만료보관(RAG제외)
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800/40">
                                활성(RAG)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{fac.category}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          <div className="max-w-md line-clamp-2" title={fac.description}>
                            {fac.description || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {fac.seasonalDescription ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-200 dark:border-orange-800/50 max-w-xs line-clamp-1" title={fac.seasonalDescription}>
                              {fac.seasonalDescription}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(fac.createdAt as string | undefined)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                          <button
                            onClick={() => {
                              setFormData({
                                name: fac.name,
                                category: fac.category,
                                location: fac.location || '',
                                description: fac.description,
                                seasonalDescription: fac.seasonalDescription || '',
                                tags: Array.isArray(fac.tags) ? fac.tags.join(', ') : (fac.tags || '')
                              });
                              setEditingId(fac.id || null);
                              setSmartEditResult(null);
                              setSmartEditInstruction('');
                              setIsEditModalOpen(true);
                            }}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            {fac.status === 'expired' ? '수정/재활성화' : '수정'}
                          </button>
                          {fac.status !== 'expired' && fac.id && (
                            <button
                              onClick={() => {
                                if (confirm(`'${fac.name}' 항목을 기한 만료(보관) 처리하시겠습니까?\n(기록은 남고 AI 챗봇 검색 대상에서만 제외됩니다)`)) {
                                  handleExpireAction({ facilityIds: [fac.id as string] });
                                }
                              }}
                              className="text-amber-600 hover:text-amber-900"
                            >
                              만료보관
                            </button>
                          )}
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

        {/* 🧹 RAG 데이터 진단 및 자동 정리 시스템 탭 */}
        {activeTab === 'audit' && (
          <div className="space-y-8">
            {/* 🌐 벨포레 공식 홈페이지 일일 크롤링 자동 연동 카드 */}
            <div className="bg-emerald-50/70 dark:bg-emerald-900/20 p-5 rounded-xl border border-emerald-200 dark:border-emerald-800 space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-emerald-900 dark:text-emerald-200 flex items-center">
                      <span className="mr-2">🌐</span> 벨포레 공식 홈페이지 일일 크롤링 자동 연동 (Daily Auto-Sync)
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200">
                      매일 아침 자동 동기화 ON
                    </span>
                  </div>
                  <p className="text-sm text-emerald-800 dark:text-emerald-300">
                    매일 밤 <code>00:00 KST</code> 공식 홈페이지(<code>belleforetresort.com</code>)에서 수집된 <strong>① 특가 패키지(객실/레저)</strong>, <strong>② 식음 매장 12곳 운영시간·휴무일·연락처</strong>, <strong>③ 골프장 그린피/카트비/캐디피</strong>를 매일 아침 우리 DB와 AI 검색엔진에 자동 반영합니다.
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    💡 <strong>예시:</strong> 홈페이지에서 <code>&quot;벨포레 메가 딜&quot;</code> 이벤트가 종료되면 우리 DB에서도 자동으로 만료 보관(검색 제외)되며, <code>&quot;남도예담&quot;</code>의 기존 상세 메뉴 설명은 그대로 유지한 채 최신 운영시간/휴무일만 스마트하게 덧입혀집니다.
                  </p>
                </div>
                <button
                  onClick={handleHomepageSync}
                  disabled={isSyncingHomepage}
                  className="inline-flex items-center px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-50 shrink-0 transition-colors"
                >
                  {isSyncingHomepage ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <span className="mr-1.5">🔄</span>}
                  {isSyncingHomepage ? '홈페이지 최신 정보 반영 중...' : '지금 즉시 홈페이지 동기화'}
                </button>
              </div>

              {homepageSyncInfo && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-emerald-200/70 dark:border-emerald-800/70 text-xs">
                  <div className="bg-white/80 dark:bg-neutral-900/60 p-3 rounded-lg border border-emerald-100 dark:border-emerald-800/50">
                    <span className="text-gray-500 dark:text-gray-400 block">홈페이지 원천 크롤링 시각</span>
                    <strong className="text-gray-900 dark:text-white text-sm">
                      {homepageSyncInfo.catalogPreview?.lastUpdated
                        ? new Date(homepageSyncInfo.catalogPreview.lastUpdated).toLocaleString('ko-KR')
                        : '확인 중'}
                    </strong>
                  </div>
                  <div className="bg-white/80 dark:bg-neutral-900/60 p-3 rounded-lg border border-emerald-100 dark:border-emerald-800/50">
                    <span className="text-gray-500 dark:text-gray-400 block">우리 DB 최근 동기화 일시</span>
                    <strong className="text-emerald-700 dark:text-emerald-400 text-sm">
                      {homepageSyncInfo.syncStatus?.syncedAt
                        ? new Date(homepageSyncInfo.syncStatus.syncedAt).toLocaleString('ko-KR')
                        : '아직 동기화 이력 없음'}
                    </strong>
                  </div>
                  <div className="bg-white/80 dark:bg-neutral-900/60 p-3 rounded-lg border border-emerald-100 dark:border-emerald-800/50">
                    <span className="text-gray-500 dark:text-gray-400 block">식음 매장 / 골프장 요금</span>
                    <strong className="text-gray-900 dark:text-white text-sm">
                      식음 {homepageSyncInfo.catalogPreview?.diningVenuesCount || 0}곳 · 골프장 {homepageSyncInfo.catalogPreview?.golfVerified ? '검증완료' : '대기'}
                    </strong>
                  </div>
                  <div className="bg-white/80 dark:bg-neutral-900/60 p-3 rounded-lg border border-emerald-100 dark:border-emerald-800/50">
                    <span className="text-gray-500 dark:text-gray-400 block">진행중 홈페이지 특가 패키지</span>
                    <strong className="text-gray-900 dark:text-white text-sm">
                      활성 {homepageSyncInfo.catalogPreview?.specialOffersCount || 0}건
                      {homepageSyncInfo.syncStatus?.offersExpired ? ` (만료제외 ${homepageSyncInfo.syncStatus.offersExpired}건)` : ''}
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {/* 상단 직관적 안내 및 예시 배너 */}
            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-5 rounded-xl border border-indigo-100 dark:border-indigo-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-indigo-900 dark:text-indigo-200 flex items-center">
                  <span className="mr-2">🧹</span> RAG 데이터 무결성 진단 &amp; 원클릭 클리너란?
                </h3>
                <p className="text-sm text-indigo-800 dark:text-indigo-300">
                  AI 챗봇이 엉뚱한 옛날 공지를 말하거나 중복 문서 때문에 헷갈리지 않도록, <strong>① DB↔벡터 일치 여부</strong>, <strong>② 쪼개진 중복 시설</strong>, <strong>③ 기한 지난 패키지/공지</strong>를 자동으로 찾아내어 정리하는 시스템입니다.
                </p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400">
                  💡 <strong>예시:</strong> 직원이 <code>&quot;원더풀 수온&quot;</code>, <code>&quot;원더풀 요금&quot;</code>을 따로 등록했더라도 여기서 <strong>[AI 통합 미리보기]</strong> 버튼만 누르면 <code>&quot;원더풀&quot;</code> 마스터 문서 하나로 깔끔하게 합쳐줍니다.
                </p>
              </div>
              <button
                onClick={runRagAudit}
                disabled={loadingAudit}
                className="inline-flex items-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-50 shrink-0 transition-colors"
              >
                {loadingAudit ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <span className="mr-1.5">🔍</span>}
                {loadingAudit ? '전체 DB 스캔 중...' : '전체 정밀 재진단 실행'}
              </button>
            </div>

            {loadingAudit && !auditData ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-3">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                <p className="text-sm text-gray-500">Firestore 원천 DB와 Pinecone 벡터 DB를 1:1 전수 대조하고 있습니다...</p>
              </div>
            ) : auditData ? (
              <>
                {/* 3대 핵심 지표 요약 카드 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 카드 1: 동기화 */}
                  <div className={`p-5 rounded-xl border ${auditData.sync?.isSynced ? 'bg-green-50/60 border-green-200 dark:bg-green-900/10 dark:border-green-800' : 'bg-red-50/60 border-red-200 dark:bg-red-900/10 dark:border-red-800'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">1. DB ↔ Pinecone 벡터 동기화</p>
                        <h4 className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">
                          {auditData.sync?.approvedFirestoreCount}건 : {auditData.sync?.pineconeCount}개
                        </h4>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${auditData.sync?.isSynced ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {auditData.sync?.isSynced ? '🟢 100% 완벽 일치' : '🔴 불일치 감지'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                      유령 벡터 {auditData.sync?.ghostVectorIds?.length || 0}건 / 누락 벡터 {auditData.sync?.missingVectors?.length || 0}건 (만료보관 {auditData.sync?.expiredFirestoreCount || 0}건)
                    </p>
                    {!auditData.sync?.isSynced && (
                      <button
                        onClick={handleSyncVectors}
                        disabled={isSyncingVectors}
                        className="mt-3 w-full py-2 px-3 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isSyncingVectors ? '동기화 복구 중...' : '⚡ 원클릭 1:1 동기화 복구 실행'}
                      </button>
                    )}
                  </div>

                  {/* 카드 2: 중복/파편화 */}
                  <div className={`p-5 rounded-xl border ${auditData.duplicateGroups?.length === 0 ? 'bg-green-50/60 border-green-200 dark:bg-green-900/10 dark:border-green-800' : 'bg-amber-50/60 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">2. 중복 / 파편화 의심 그룹</p>
                        <h4 className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">
                          {auditData.duplicateGroups?.length || 0}개 그룹
                        </h4>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${auditData.duplicateGroups?.length === 0 ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                        {auditData.duplicateGroups?.length === 0 ? '🟢 파편화 없음' : '⚠️ 통합 권장'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                      동일하거나 유사한 이름으로 쪼개져 있는 시설 문서 묶음입니다.
                    </p>
                  </div>

                  {/* 카드 3: 기한 만료 의심 */}
                  <div className={`p-5 rounded-xl border ${(auditData.stale?.facilities?.length || 0) + (auditData.stale?.notices?.length || 0) === 0 ? 'bg-green-50/60 border-green-200 dark:bg-green-900/10 dark:border-green-800' : 'bg-orange-50/60 border-orange-200 dark:bg-orange-900/10 dark:border-orange-800'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">3. 과거 날짜 / 기한 만료 의심</p>
                        <h4 className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">
                          {(auditData.stale?.facilities?.length || 0) + (auditData.stale?.notices?.length || 0)}건
                        </h4>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${(auditData.stale?.facilities?.length || 0) + (auditData.stale?.notices?.length || 0) === 0 ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                        {(auditData.stale?.facilities?.length || 0) + (auditData.stale?.notices?.length || 0) === 0 ? '🟢 최신 상태' : '⏰ 점검 필요'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                      시설/패키지 {auditData.stale?.facilities?.length || 0}건, 긴급 운영 공지 {auditData.stale?.notices?.length || 0}건
                    </p>
                  </div>
                </div>

                {/* 섹션 A: 중복 및 파편화 그룹 상세 */}
                <div className="border dark:border-neutral-700 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 dark:bg-neutral-800 px-5 py-3.5 border-b dark:border-neutral-700 flex justify-between items-center">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                        📌 중복 및 파편화 시설 통합 대상 ({auditData.duplicateGroups?.length || 0}건)
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        여러 개로 쪼개진 문서를 AI가 내용 손실 없이 하나의 마스터 문서로 합치고 나머지 조각을 정리합니다.
                      </p>
                    </div>
                  </div>
                  {(!auditData.duplicateGroups || auditData.duplicateGroups.length === 0) ? (
                    <div className="p-8 text-center text-sm text-gray-500">
                      ✅ 현재 중복되거나 파편화된 시설 문서가 없습니다. 모든 시설이 깔끔한 마스터 문서로 유지되고 있습니다!
                    </div>
                  ) : (
                    <div className="divide-y dark:divide-neutral-700">
                      {auditData.duplicateGroups.map((group: any) => (
                        <div key={group.masterId} className="p-5 bg-white dark:bg-neutral-900 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-0.5 text-xs font-bold rounded bg-amber-100 text-amber-800">
                                {group.count}개 문서 묶음
                              </span>
                              <span className="text-base font-bold text-gray-900 dark:text-white">
                                대표 마스터 후보: &quot;{group.masterName}&quot;
                              </span>
                              <span className="text-xs text-gray-500">({group.category})</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {group.items.map((it: any) => (
                                <span
                                  key={it.id}
                                  className="inline-flex items-center px-2.5 py-1 rounded-md text-xs bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-neutral-700"
                                  title={it.description}
                                >
                                  📄 {it.name} <span className="ml-1 text-gray-400">({(it.description || '').length}자)</span>
                                </span>
                              ))}
                            </div>
                          </div>
                          <button
                            onClick={() => handleOpenMergeModal(group)}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm shrink-0 transition-colors"
                          >
                            ✨ AI 통합 미리보기 및 병합
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 섹션 B: 기한 만료 의심 (과거 날짜 포함) 항목 */}
                <div className="border dark:border-neutral-700 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 dark:bg-neutral-800 px-5 py-3.5 border-b dark:border-neutral-700 flex justify-between items-center">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                        ⏰ 과거 날짜(기한 만료 의심) 패키지 및 공지 ({(auditData.stale?.facilities?.length || 0) + (auditData.stale?.notices?.length || 0)}건)
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        오늘 날짜보다 이전의 종료일이 적혀 있는 항목입니다. 만료 처리하면 기록은 보관되고 AI 챗봇 검색에서만 제외됩니다.
                      </p>
                    </div>
                  </div>

                  {(auditData.stale?.facilities?.length || 0) + (auditData.stale?.notices?.length || 0) === 0 ? (
                    <div className="p-8 text-center text-sm text-gray-500">
                      ✅ 기한이 지난 과거 패키지나 만료된 운영 공지가 없습니다!
                    </div>
                  ) : (
                    <div className="divide-y dark:divide-neutral-700">
                      {(auditData.stale?.notices || []).map((notice: any) => (
                        <div key={notice.id} className="p-4 bg-red-50/30 dark:bg-red-900/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-0.5 text-xs font-bold rounded bg-red-100 text-red-800">긴급 운영공지</span>
                              <span className="font-bold text-sm text-gray-900 dark:text-white">{notice.title}</span>
                              <span className="text-xs text-red-600">종료일: {notice.endDate}</span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{notice.content}</p>
                          </div>
                          <button
                            onClick={() => handleExpireAction({ noticeIds: [notice.id] })}
                            disabled={isExpiringItems}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md shrink-0 disabled:opacity-50"
                          >
                            공지 비활성화
                          </button>
                        </div>
                      ))}

                      {(auditData.stale?.facilities || []).map((fac: any) => (
                        <div key={fac.id} className="p-4 bg-white dark:bg-neutral-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-0.5 text-xs font-bold rounded bg-orange-100 text-orange-800">{fac.category}</span>
                              <span className="font-bold text-sm text-gray-900 dark:text-white">{fac.name}</span>
                              <span className="text-xs text-orange-600 font-medium">감지된 마지막 날짜: {fac.lastDate}</span>
                            </div>
                            <p className="text-xs text-gray-500 line-clamp-2">{fac.descriptionPreview}...</p>
                          </div>
                          <div className="flex space-x-2 shrink-0">
                            {fac.hasSeasonal && (
                              <button
                                onClick={() => handleExpireAction({ clearSeasonalIds: [fac.id] })}
                                disabled={isExpiringItems}
                                className="px-3 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-800 text-xs font-medium rounded-md disabled:opacity-50"
                              >
                                시즌 안내만 비우기
                              </button>
                            )}
                            <button
                              onClick={() => handleExpireAction({ facilityIds: [fac.id] })}
                              disabled={isExpiringItems}
                              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white text-xs font-medium rounded-md disabled:opacity-50"
                            >
                              기한만료 보관 (RAG 제외)
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* AI 중복/파편화 통합 미리보기 모달 (100% HITL) */}
      {mergeModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity" onClick={() => !mergeModal.isExecuting && setMergeModal(null)} />
            <div className="relative inline-block w-full max-w-3xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border dark:border-neutral-800 z-10">
              <div className="flex justify-between items-center border-b dark:border-neutral-800 pb-3 mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    ✨ AI 마스터 문서 통합 미리보기 ({mergeModal.group.count}개 문서 ➔ 1개 마스터)
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    통합 결과를 확인하고 필요 시 수정한 뒤 [승인 및 병합 실행]을 누르면 파편 문서들이 정리됩니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !mergeModal.isExecuting && setMergeModal(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {mergeModal.isGenerating ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    AI가 {mergeModal.group.count}개 문서의 핵심 팩트를 하나로 통합하고 과거 날짜/인사말을 정제하고 있습니다...
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {mergeModal.summary && (
                    <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-800 dark:text-indigo-300">
                      <strong>📋 AI 통합 요약:</strong> {mergeModal.summary}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">통합 마스터 시설명</label>
                      <input
                        type="text"
                        value={mergeModal.name}
                        onChange={e => setMergeModal(prev => (prev ? { ...prev, name: e.target.value } : null))}
                        className="w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">카테고리</label>
                      <select
                        value={mergeModal.category}
                        onChange={e => setMergeModal(prev => (prev ? { ...prev, category: e.target.value } : null))}
                        className="w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                      >
                        {categories.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">통합된 고정 정보 (Description)</label>
                    <textarea
                      rows={10}
                      value={mergeModal.description}
                      onChange={e => setMergeModal(prev => (prev ? { ...prev, description: e.target.value } : null))}
                      className="w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-mono leading-relaxed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">시즌/임시 정보 (Seasonal Description)</label>
                    <textarea
                      rows={2}
                      value={mergeModal.seasonalDescription}
                      onChange={e => setMergeModal(prev => (prev ? { ...prev, seasonalDescription: e.target.value } : null))}
                      placeholder="현재 유효한 시즌/임시 안내가 있을 경우만 표시됩니다."
                      className="w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">검색 태그 (쉼표 구분)</label>
                    <input
                      type="text"
                      value={mergeModal.tags}
                      onChange={e => setMergeModal(prev => (prev ? { ...prev, tags: e.target.value } : null))}
                      className="w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="flex justify-end space-x-3 pt-4 border-t dark:border-neutral-800">
                    <button
                      type="button"
                      onClick={() => setMergeModal(null)}
                      disabled={mergeModal.isExecuting}
                      className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={handleExecuteMerge}
                      disabled={mergeModal.isExecuting}
                      className="inline-flex items-center px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-bold text-white shadow-sm disabled:opacity-50"
                    >
                      {mergeModal.isExecuting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 통합 및 벡터 갱신 중...
                        </>
                      ) : (
                        '✅ 승인 및 마스터 통합 실행'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div className="fixed inset-0 transition-opacity bg-gray-900/50 backdrop-blur-sm" aria-hidden="true" onClick={() => setIsEditModalOpen(false)}></div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="relative inline-block w-full px-4 pt-5 pb-4 overflow-hidden text-left align-bottom transition-all transform bg-white dark:bg-neutral-900 rounded-lg shadow-xl sm:my-8 sm:align-middle sm:max-w-2xl sm:p-6 z-10">
              <div className="flex justify-between items-center mb-5 border-b dark:border-neutral-800 pb-3">
                <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white" id="modal-title">
                  시설 정보 수정 (AI 지식 덮어쓰기)
                </h3>
                <button
                  type="button"
                  className="text-gray-400 bg-white dark:bg-neutral-900 hover:text-gray-500 focus:outline-none"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSmartEditResult(null);
                    setSmartEditInstruction('');
                  }}
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
                  <div className="flex justify-between items-end mb-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">자연어 설명 (고정 정보)</label>
                    <button
                      type="button"
                      onClick={handleSmartSplit}
                      disabled={isSmartEditing || !formData.description}
                      className="inline-flex items-center text-xs px-2 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 rounded transition-colors disabled:opacity-50"
                    >
                      {isSmartEditing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : '✨ AI 자동 분류'}
                    </button>
                  </div>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">시즌/시기별 안내</label>
                  <textarea
                    name="seasonalDescription"
                    rows={3}
                    value={formData.seasonalDescription}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                  {/* AI 스마트 편집 영역 */}
                  <div className="mt-3 bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-800">
                    <label className="block text-sm font-medium text-indigo-800 dark:text-indigo-300 mb-2">
                      ✨ AI 수정 지시 (예: 오전 9시 오픈을 10시로 변경해줘)
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={smartEditInstruction}
                        onChange={(e) => setSmartEditInstruction(e.target.value)}
                        placeholder="여기에 원하는 수정 사항을 편하게 적어주세요."
                        className="flex-1 rounded-md border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleSmartEdit}
                        disabled={isSmartEditing || !smartEditInstruction.trim()}
                        className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 shrink-0 transition-colors"
                      >
                        {isSmartEditing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : 'AI 제안 받기'}
                      </button>
                    </div>

                    {smartEditResult && (
                      <div className="mt-3 p-3 bg-white dark:bg-neutral-900 rounded border border-indigo-200 dark:border-indigo-700 shadow-sm animate-in fade-in slide-in-from-top-2">
                        <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 mb-1">
                          ✅ 요약: {smartEditResult.summary}
                        </p>
                        <div className="text-sm text-gray-700 dark:text-gray-300 mb-3 bg-gray-50 dark:bg-neutral-800 p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap">
                          {smartEditResult.updatedText}
                        </div>
                        <div className="flex justify-end space-x-2">
                          <button
                            type="button"
                            onClick={() => setSmartEditResult(null)}
                            className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={applySmartEdit}
                            className="text-xs px-3 py-1 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded font-medium transition-colors"
                          >
                            이 제안으로 본문 교체하기
                          </button>
                        </div>
                      </div>
                    )}
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
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setSmartEditResult(null);
                      setSmartEditInstruction('');
                    }}
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
