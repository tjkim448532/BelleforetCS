'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Loader2,
  Plus,
  Save,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  X,
  Edit2,
  Trash2,
  Search,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
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

  // 초보자 친화적 4대 탭 (기본값: 'manage' - 들어오자마자 등록된 지식을 바로 확인/수정)
  const [activeTab, setActiveTab] = useState<'manage' | 'single' | 'audit' | 'tools'>('manage');

  // Bulk Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkProgress, setBulkProgress] = useState({ total: 0, current: 0, failed: 0 });
  const [bulkErrors, setBulkErrors] = useState<{ row: number; error: string }[]>([]);
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
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [isExporting, setIsExporting] = useState(false);

  // Categories State
  const [categories, setCategories] = useState<string[]>(['레저', '숙박', '식음', '편의', '기타']);
  const [newCat, setNewCat] = useState('');
  const [editCat, setEditCat] = useState<{ old: string; new: string } | null>(null);

  // Smart Edit State
  const [smartEditInstruction, setSmartEditInstruction] = useState('');
  const [smartEditResult, setSmartEditResult] = useState<{ summary: string; updatedText: string } | null>(null);
  const [isSmartEditing, setIsSmartEditing] = useState(false);

  // Quick-Slot Builder & AI Fact-Check State (직원용 초간단 정형 입력 & 정답 검증)
  const [showQuickSlotBuilder, setShowQuickSlotBuilder] = useState(true);
  const [quickSlots, setQuickSlots] = useState({
    hours: '',
    closedDays: '',
    price: '',
    requirements: '',
    rainPolicy: '',
    petPolicy: '',
    phone: '',
  });
  const [isFactChecking, setIsFactChecking] = useState(false);
  const [factCheckResult, setFactCheckResult] = useState<{
    verdict: 'MATCH' | 'NEW_KNOWLEDGE' | 'CONFLICT';
    hasConflict: boolean;
    conflictSummary: string;
    matchedFacilities: Array<{ id: string; name: string; category: string; description: string }>;
    extractedSpecs: {
      operatingHours: string;
      closedDays: string;
      priceInfo: string;
      location: string;
      ageHeightLimit: string;
      rainPolicy: string;
      petAllowed: string;
    };
  } | null>(null);

  // RAG Audit & Homepage Sync State
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
        `✅ 공식 홈페이지 최신 정보 동기화 완료!\n` +
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
      alert(e.message || '데이터 진단 중 오류가 발생했습니다.');
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
      alert(
        `✅ 동기화 완료! (불필요 벡터 ${data.deletedGhostCount}건 정리, 누락 벡터 ${data.upsertedMissingCount}건 복구)`
      );
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

      setMergeModal((prev) =>
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
    setMergeModal((prev) => (prev ? { ...prev, isExecuting: true } : null));
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
          tags: mergeModal.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '병합 실행 실패');

      alert(
        `✅ 통합 완료! "${mergeModal.name}" 대표 문서 하나로 깔끔하게 합쳐졌습니다.`
      );
      setMergeModal(null);
      await Promise.all([runRagAudit(), fetchFacilities()]);
    } catch (e: any) {
      alert(e.message);
      setMergeModal((prev) => (prev ? { ...prev, isExecuting: false } : null));
    }
  };

  const handleExpireAction = async (payload: {
    facilityIds?: string[];
    clearSeasonalIds?: string[];
    noticeIds?: string[];
  }) => {
    setIsExpiringItems(true);
    try {
      const res = await fetch('/api/admin/facility/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'expire_items', ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '만료 처리 실패');

      alert('✅ 정리가 완료되었습니다! (기록은 보관되며 AI 챗봇 검색에서만 제외되었습니다)');
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

        setFormData((prev) => {
          if (
            data.categories &&
            data.categories.length > 0 &&
            !data.categories.includes(prev.category)
          ) {
            return { ...prev, category: data.categories[0] };
          }
          return prev;
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCategoryAction = async (
    action: 'add' | 'update' | 'delete',
    payload: any
  ) => {
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setCategories(data.categories);
      if (action === 'update' && data.updatedCount > 0) {
        alert(
          `✅ 분류 이름이 변경되었으며, 기존 데이터 ${data.updatedCount}건도 함께 변경되었습니다.`
        );
        fetchFacilities();
      } else {
        alert('✅ 분류가 성공적으로 반영되었습니다.');
      }
      setNewCat('');
      setEditCat(null);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '-';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // 초보자용 원클릭 작성 예시 채우기
  const fillBeginnerExample = (type: 'leisure' | 'dining' | 'faq') => {
    if (type === 'leisure') {
      setFormData({
        name: '마운틴카트',
        category: categories.includes('레저') ? '레저' : categories[0],
        location: '익스트림존 (웰컴센터 맞은편)',
        description:
          '■ 운영시간: 평일 10:00~17:30 / 주말 09:30~18:00 (점심시간 12:30~13:30 운휴)\n■ 이용요금: 1인승 21,000원, 2인승 28,000원 (투숙객 20% 할인)\n■ 탑승기준: 신장 140cm 이상 단독 탑승 가능 (140cm 미만은 보호자 동반 시 2인승 탑승 가능)',
        seasonalDescription: '동절기(12월~2월)에는 기상 상황에 따라 조기 마감될 수 있습니다.',
        tags: '마운틴카트, 카트, 놀이기구, 요금, 키제한',
      });
    } else if (type === 'dining') {
      setFormData({
        name: '남도예담',
        category: categories.includes('식음') ? '식음' : categories[0],
        location: '투섬플레이스 옆 한식당 (셔틀 2번 정류장)',
        description:
          '■ 대표 메뉴: 정성가득 돌솥밥 한정식(28,000원), 한우불고기전골(30,000원)\n■ 특징: 정갈한 남도 한정식을 맛볼 수 있는 벨포레 대표 한식당입니다. 단체 예약 가능하며 아기의자가 구비되어 있습니다.',
        seasonalDescription: '',
        tags: '남도예담, 식당, 한식, 한정식, 점심, 저녁',
      });
    } else if (type === 'faq') {
      setFormData({
        name: '반려견 동반 입장 및 이용 규정',
        category: categories.includes('기타') ? '기타' : categories[0],
        location: '리조트 전 구역',
        description:
          '■ 반려견 동반 안내: 벨포레 리조트는 펫프렌들리 리조트로, 야외 산책로 및 펫포레(반려견 전용 운동장), 얼룩말카페 야외석에 반려견 동반이 가능합니다.\n■ 주의사항: 이동 시 반드시 목줄(리드줄) 또는 케이지/유모차를 이용해 주셔야 하며, 맹견은 입장이 제한됩니다.',
        seasonalDescription: '',
        tags: '반려견, 강아지, 애견동반, 펫포레, 규정',
      });
    }
  };

  const handleSmartEdit = async () => {
    if (!smartEditInstruction.trim()) {
      alert('어떻게 고칠지 한 줄로 적어주세요! (예: 요금을 15,000원으로 바꿔줘)');
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
          instruction: smartEditInstruction,
        }),
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
      setFormData((prev) => ({ ...prev, description: smartEditResult.updatedText }));
      setSmartEditResult(null);
      setSmartEditInstruction('');
    }
  };

  const handleSmartSplit = async () => {
    if (!formData.description) {
      alert('먼저 기본 설명 칸에 내용을 적어주세요.');
      return;
    }

    setIsSmartEditing(true);
    try {
      const res = await fetch('/api/admin/facility/smart-split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text:
            formData.description +
            (formData.seasonalDescription ? '\n' + formData.seasonalDescription : ''),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setFormData((prev) => ({
        ...prev,
        description: data.description,
        seasonalDescription: data.seasonalDescription,
      }));
      alert('✅ AI가 상시 기본 정보와 시즌/임시 안내를 자동으로 나누어 정리했습니다!');
    } catch (e: any) {
      alert(e.message || 'AI 자동 분류 중 오류가 발생했습니다.');
    } finally {
      setIsSmartEditing(false);
    }
  };

  // 빈칸만 채우면 AI 표준 양식(■ 운영시간 / ■ 휴무일 / ■ 이용요금 등)으로 자동 조립
  const applyQuickSlotsToDescription = () => {
    const lines: string[] = [];
    if (quickSlots.hours.trim()) lines.push(`■ 운영시간: ${quickSlots.hours.trim()}`);
    if (quickSlots.closedDays.trim()) lines.push(`■ 휴무일: ${quickSlots.closedDays.trim()}`);
    if (quickSlots.price.trim()) lines.push(`■ 이용요금: ${quickSlots.price.trim()}`);
    if (quickSlots.requirements.trim()) lines.push(`■ 이용조건/키제한: ${quickSlots.requirements.trim()}`);
    if (quickSlots.rainPolicy.trim()) lines.push(`■ 우천/날씨 기준: ${quickSlots.rainPolicy.trim()}`);
    if (quickSlots.petPolicy.trim()) lines.push(`■ 반려견 동반: ${quickSlots.petPolicy.trim()}`);
    if (quickSlots.phone.trim()) lines.push(`■ 문의 전화: ${quickSlots.phone.trim()}`);

    if (lines.length === 0) {
      alert('먼저 위 빈칸 중 알고 계신 항목을 하나 이상 적어주세요!');
      return;
    }

    const structuredBlock = lines.join('\n');
    setFormData((prev) => ({
      ...prev,
      description: prev.description.trim()
        ? `${structuredBlock}\n\n${prev.description.trim()}`
        : structuredBlock,
    }));
    setFactCheckResult(null);
  };

  // 등록/수정 전 기존 DB 충돌 및 정형 슬롯 추출 AI 팩트체크
  const handleRunFactCheck = async () => {
    if (!formData.name.trim() || !formData.description.trim()) {
      alert('먼저 [1. 시설 이름]과 [4. 상세 설명]을 적어주세요!');
      return;
    }

    setIsFactChecking(true);
    setFactCheckResult(null);
    try {
      const res = await fetch('/api/admin/robot-dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_staff_answer',
          name: formData.name.trim(),
          category: formData.category,
          location: formData.location.trim(),
          description:
            formData.description.trim() +
            (formData.seasonalDescription.trim()
              ? `\n[시즌/기간 안내] ${formData.seasonalDescription.trim()}`
              : ''),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '팩트체크 중 오류가 발생했습니다.');
      setFactCheckResult(data);
    } catch (e: any) {
      alert(e.message || 'AI 팩트체크 중 오류가 발생했습니다.');
    } finally {
      setIsFactChecking(false);
    }
  };

  const handleSaveWithStatus = async (targetStatus: 'approved' | 'pending') => {
    if (!formData.name.trim() || !formData.description.trim()) {
      alert('시설 이름과 상세 설명은 필수입니다.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const payload = {
        ...formData,
        tags: formData.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        status: targetStatus,
        duplicateAction,
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

      setMessage(
        targetStatus === 'approved'
          ? '✅ 성공적으로 저장되었으며, 지금부터 AI 챗봇이 이 내용을 바탕으로 대답합니다!'
          : '⏳ [검수 대기열]에 안전하게 등록되었습니다! 매니저가 승인 버튼을 누르면 AI가 학습을 시작합니다.'
      );
      setFormData({
        name: '',
        category: categories[0] || '레저',
        location: '',
        description: '',
        seasonalDescription: '',
        tags: '',
      });
      setQuickSlots({
        hours: '',
        closedDays: '',
        price: '',
        requirements: '',
        rainPolicy: '',
        petPolicy: '',
        phone: '',
      });
      setFactCheckResult(null);
      fetchFacilities();
    } catch (error: unknown) {
      setMessage((error as Error).message || '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSaveWithStatus('approved');
  };

  const handleApprovePending = async (fac: any) => {
    setLoadingManage(true);
    try {
      const response = await fetch('/api/admin/facility', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: fac.id,
          name: fac.name,
          category: fac.category || '기타',
          location: fac.location || '',
          description: fac.description || '',
          seasonalDescription: fac.seasonalDescription || '',
          tags: Array.isArray(fac.tags) ? fac.tags : [],
          status: 'approved',
        }),
      });
      if (!response.ok) throw new Error('승인 처리에 실패했습니다.');
      alert(`✅ '${fac.name}' 지식이 승인되어 지금부터 AI가 즉시 안내합니다!`);
      fetchFacilities();
    } catch (e: any) {
      alert(e.message || '승인 처리 중 오류가 발생했습니다.');
      setLoadingManage(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...formData,
        id: editingId,
        tags:
          typeof formData.tags === 'string'
            ? formData.tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
            : formData.tags,
        status: 'approved',
      };

      const response = await fetch('/api/admin/facility', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('업데이트 실패');

      alert('✅ 수정 내용이 저장되었으며 AI 챗봇이 즉시 새로 학습했습니다!');
      setEditingId(null);
      setIsEditModalOpen(false);
      setSmartEditResult(null);
      setSmartEditInstruction('');
      setFactCheckResult(null);
      setFormData({
        name: '',
        category: categories[0] || '레저',
        location: '',
        description: '',
        seasonalDescription: '',
        tags: '',
      });
      fetchFacilities();
    } catch (error: unknown) {
      alert((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name?: string) => {
    if (
      !confirm(
        `'${name || '선택한 항목'}' 지식을 완전히 삭제하시겠습니까?\n(잠시 감추고 싶으실 때는 [만료보관] 버튼을 쓰시면 기록이 보존됩니다)`
      )
    )
      return;

    try {
      const response = await fetch(`/api/admin/facility?id=${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('삭제 실패');

      fetchFacilities();
      setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== id));
    } catch (error: unknown) {
      alert((error as Error).message);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (
      !confirm(
        `선택한 ${selectedIds.length}개의 항목을 정말 삭제하시겠습니까? (AI 학습 데이터도 함께 삭제됩니다)`
      )
    )
      return;

    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/admin/facility?ids=${selectedIds.join(',')}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) throw new Error('일괄 삭제 실패');

      alert('✅ 선택한 항목들이 삭제되었습니다.');
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

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `belleforet_bible_${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: unknown) {
      alert(`엑셀 추출 중 오류가 발생했습니다: ${(error as Error).message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const processBulkData = async (data: Record<string, string>[]) => {
    setBulkProgress({ total: data.length, current: 0, failed: 0 });
    setBulkErrors([]);
    setIsUploading(true);

    let current = 0;
    let failed = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      const payload = {
        name: row['시설명'] || row['질문 (Question)'] || '',
        category: row['카테고리'] || '기타',
        location: row['위치'] || row['관련 장소 (옵션)'] || '',
        description: row['설명'] || '',
        seasonalDescription: row['시즌설명'] || '',
        tags: (row['태그'] || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        status: 'approved',
        duplicateAction,
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
        errors.push({
          row: i + 1,
          error: (err as Error).message || '업로드 중 오류 발생',
        });
        setBulkErrors([...errors]);
      }

      current++;
      setBulkProgress({ total: data.length, current, failed });
    }

    setIsUploading(false);
    setBulkErrors(errors);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setCsvText('');
    fetchFacilities();
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
        alert('CSV 파일 읽기 중 오류가 발생했습니다: ' + error.message);
      },
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
        alert('CSV 텍스트 읽기 중 오류가 발생했습니다: ' + error.message);
      },
    });
  };

  const filteredFacilities = facilities.filter((fac) => {
    if (categoryFilter === 'EXPIRED') {
      if (fac.status !== 'expired') return false;
    } else if (categoryFilter === 'PENDING') {
      if (fac.status !== 'pending') return false;
    } else if (categoryFilter !== 'ALL') {
      if (fac.category !== categoryFilter) return false;
    }

    if (!searchQuery.trim()) return true;
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

    return (
      facilities.find((f) => {
        if (f.status === 'expired' || !f.name) return false;
        const normExist = f.name
          .replace(/\([^)]*\)/g, '')
          .replace(/\s+/g, '')
          .toLowerCase()
          .trim();
        if (!normExist || genericWords.has(normExist)) return false;
        if (normTyped === normExist) return true;
        if (
          normExist.length >= 2 &&
          (normTyped.startsWith(normExist) || normTyped.includes(normExist))
        ) {
          return true;
        }
        return false;
      }) || null
    );
  })();

  const activeCount = facilities.filter((f) => f.status === 'approved').length;
  const pendingCount = facilities.filter((f) => f.status === 'pending').length;
  const expiredCount = facilities.filter((f) => f.status === 'expired').length;

  return (
    <div className="space-y-8">
      {/* 상단 초보자 친절 안내 배너 */}
      <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl shadow-xs border border-slate-200 dark:border-green-900/50">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-slate-100 text-slate-900 mb-2">
              메뉴 1 · AI 지식창고 (시설 · 요금 · 이용규정 통합)
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              📚 AI 지식창고 관리
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-gray-300">
              AI 상담원이 손님에게 대답할 때 참고하는 <strong>백과사전(총 {activeCount}개 학습 중{pendingCount > 0 ? ` · 검수 대기 ${pendingCount}개` : ''})</strong>입니다. 아래 4개 버튼 중 원하시는 작업을 눌러보세요!
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleExportBible}
              disabled={isExporting || facilities.length === 0}
              className="inline-flex items-center text-xs sm:text-sm px-3.5 py-2 bg-slate-50 text-slate-900 rounded-xl hover:bg-slate-100 border border-slate-200 transition-colors disabled:opacity-50 font-bold"
              title="현재 AI가 알고 있는 모든 지식을 엑셀 파일로 내려받습니다"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <span className="mr-1.5">📥</span>
              )}
              {isExporting ? '엑셀 파일 만드는 중...' : '전체 지식 엑셀로 내려받기'}
            </button>
          </div>
        </div>

        {/* 초보자용 큰 버튼형 4대 탭 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6 pt-5 border-t border-gray-100 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => {
              setActiveTab('manage');
              fetchFacilities();
              setSelectedIds([]);
            }}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              activeTab === 'manage'
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-200'
            }`}
          >
            <div className="text-sm font-extrabold flex items-center justify-between">
              <span>📋 1. 등록된 지식 찾아보기/고치기</span>
              {pendingCount > 0 && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-amber-400 text-slate-900 font-extrabold">
                  대기 {pendingCount}
                </span>
              )}
            </div>
            <div className={`text-xs mt-1 ${activeTab === 'manage' ? 'text-slate-200' : 'text-slate-500'}`}>
              현재 AI가 아는 {activeCount}개 지식을 검색하고 수정합니다
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('single');
              setFactCheckResult(null);
            }}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              activeTab === 'single'
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-200'
            }`}
          >
            <div className="text-sm font-extrabold">✏️ 2. 새 지식 하나씩 등록하기</div>
            <div className={`text-xs mt-1 ${activeTab === 'single' ? 'text-slate-200' : 'text-slate-500'}`}>
              빈칸만 채우면 AI 표준 양식으로 자동 조립 &amp; 팩트체크
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('audit');
              runRagAudit();
            }}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              activeTab === 'audit'
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-200 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-slate-200'
            }`}
          >
            <div className="text-sm font-extrabold">🌐 3. 홈페이지 자동연동 &amp; AI 청소기</div>
            <div className={`text-xs mt-1 ${activeTab === 'audit' ? 'text-slate-200' : 'text-slate-700 dark:text-indigo-300'}`}>
              홈페이지 최신 정보 동기화 및 중복/과거 문서 정리
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tools')}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              activeTab === 'tools'
                ? 'bg-gray-900 text-white border-gray-900 shadow-sm dark:bg-white dark:text-slate-900'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-200'
            }`}
          >
            <div className="text-sm font-extrabold">🗂️ 4. 분류(카테고리) &amp; 엑셀 업로드</div>
            <div className={`text-xs mt-1 ${activeTab === 'tools' ? 'opacity-80' : 'text-slate-500'}`}>
              분류 이름을 바꾸거나 엑셀로 한 번에 올릴 때 씁니다
            </div>
          </button>
        </div>
      </div>

      {/* 메인 콘텐츠 박스 */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xs border border-neutral-200 dark:border-neutral-800 p-6">
        {/* ===================================================================== */}
        {/* 📋 탭 1: 등록된 지식 찾아보기 / 고치기 (기본 화면) */}
        {/* ===================================================================== */}
        {activeTab === 'manage' && (
          <div className="space-y-5">
            {/* 검수 대기 알림 배너 */}
            {pendingCount > 0 && (
              <div className="bg-slate-50 dark:bg-amber-900/20 p-4 rounded-xl border border-slate-200 dark:border-amber-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="text-xs sm:text-sm text-slate-900 dark:text-amber-200">
                  ⏳ <strong>승인 대기 중인 지식이 {pendingCount}건 있습니다!</strong> 직원이 등록한 내용을 확인하시고 오른쪽 <strong>[✅ 즉시 승인]</strong> 버튼을 누르면 그 즉시 AI가 손님에게 안내를 시작합니다.
                </div>
                <button
                  type="button"
                  onClick={() => setCategoryFilter(categoryFilter === 'PENDING' ? 'ALL' : 'PENDING')}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold rounded-lg shrink-0"
                >
                  {categoryFilter === 'PENDING' ? '전체 목록 보기' : `⏳ 검수 대기 ${pendingCount}건만 모아보기`}
                </button>
              </div>
            )}

            {/* 초보자 도움말 박스 */}
            <div className="bg-slate-50 dark:bg-neutral-800/60 p-4 rounded-xl border border-slate-200 dark:border-neutral-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="text-xs sm:text-sm text-slate-700 dark:text-gray-300">
                💡 <strong>사용 팁:</strong> 찾고 싶은 시설 이름(예: <code>마운틴카트</code>, <code>남도예담</code>)을 검색창에 입력하시고, 오른쪽 <strong>[✏️ 고치기]</strong> 버튼을 누르면 내용을 쉽게 수정할 수 있습니다.
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('single');
                  setFactCheckResult(null);
                }}
                className="inline-flex items-center px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold rounded-lg shrink-0"
              >
                <Plus className="w-4 h-4 mr-1" /> 새 지식 추가하러 가기
              </button>
            </div>

            {/* 분류 필터 버튼 & 검색창 */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCategoryFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                    categoryFilter === 'ALL'
                      ? 'bg-gray-900 text-white dark:bg-white dark:text-slate-900'
                      : 'bg-slate-100 text-slate-700 hover:bg-gray-200 dark:bg-neutral-800 dark:text-gray-300'
                  }`}
                >
                  전체 ({facilities.length})
                </button>
                {pendingCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('PENDING')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                      categoryFilter === 'PENDING'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-900 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    ⏳ 검수 대기 ({pendingCount})
                  </button>
                )}
                {categories.map((cat) => {
                  const count = facilities.filter((f) => f.category === cat).length;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        categoryFilter === cat
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-gray-200 dark:bg-neutral-800 dark:text-gray-300'
                      }`}
                    >
                      {cat} ({count})
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setCategoryFilter('EXPIRED')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    categoryFilter === 'EXPIRED'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-50 text-slate-900 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  📦 만료 보관함 ({expiredCount})
                </button>
              </div>

              <div className="flex items-center space-x-2 w-full lg:w-auto">
                <div className="relative flex-1 lg:w-72">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="시설 이름이나 내용 검색 (예: 썰매, 조식)"
                    className="block w-full rounded-xl border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 pl-9 pr-8 py-2 text-sm focus:border-slate-900 focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-gray-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {selectedIds.length > 0 && (
                  <button
                    onClick={handleBulkDelete}
                    disabled={isDeleting}
                    className="inline-flex items-center text-xs font-bold px-3 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 border border-red-200 shrink-0"
                  >
                    선택 삭제 ({selectedIds.length})
                  </button>
                )}
                <button
                  onClick={fetchFacilities}
                  className="inline-flex items-center text-xs font-bold px-3 py-2 text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> 새로고침
                </button>
              </div>
            </div>

            {loadingManage ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 text-slate-700 animate-spin" />
              </div>
            ) : filteredFacilities.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                검색 조건에 맞는 지식 데이터가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-xl dark:border-neutral-700">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-700">
                  <thead className="bg-slate-50 dark:bg-neutral-800">
                    <tr>
                      <th className="px-4 py-3 text-left w-10">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-slate-700"
                          checked={
                            filteredFacilities.length > 0 &&
                            selectedIds.length === filteredFacilities.length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(
                                filteredFacilities.map((f) => f.id as string).filter(Boolean)
                              );
                            } else {
                              setSelectedIds([]);
                            }
                          }}
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">
                        시설 / 규정 이름
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 w-24">
                        분류
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">
                        AI가 알고 있는 상세 내용 &amp; 핵심 요약
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 w-56">
                        관리 버튼
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-neutral-700">
                    {filteredFacilities.map((fac: any) => (
                      <tr
                        key={fac.id}
                        className={`hover:bg-slate-50 dark:hover:bg-neutral-800/50 transition-colors ${
                          fac.status === 'pending' ? 'bg-slate-50 dark:bg-amber-900/10' : ''
                        }`}
                      >
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-slate-700"
                            checked={fac.id ? selectedIds.includes(fac.id) : false}
                            onChange={(e) => {
                              if (e.target.checked) {
                                if (fac.id)
                                  setSelectedIds((prev) => [...prev, fac.id as string]);
                              } else {
                                setSelectedIds((prev) =>
                                  prev.filter((id) => id !== fac.id)
                                );
                              }
                            }}
                          />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                              {fac.name}
                            </span>
                            {fac.status === 'expired' ? (
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                📦 만료보관 (검색 제외)
                              </span>
                            ) : fac.status === 'pending' ? (
                              <span className="px-2 py-0.5 rounded text-xs font-extrabold bg-slate-100 text-slate-900 border border-slate-200">
                                ⏳ 검수 대기 (승인 전)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200">
                                🟢 AI 안내 중
                              </span>
                            )}
                            {fac.homepageSourceType && (
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200">
                                🌐 홈페이지 연동
                              </span>
                            )}
                          </div>
                          {fac.location && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              📍 위치: {fac.location}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-gray-300">
                            {fac.category}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs sm:text-sm text-slate-600 dark:text-gray-300">
                          <div
                            className="max-w-3xl line-clamp-2 text-[15px] text-slate-800 leading-relaxed"
                            title={fac.description}
                          >
                            {fac.description || '-'}
                          </div>
                          {fac.seasonalDescription && (
                            <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-50 text-slate-900 border border-slate-200">
                              ⏰ 시즌/기간: {fac.seasonalDescription}
                            </div>
                          )}
                          {/* AI가 자동으로 인식한 정형 슬롯 미니 요약 칩 */}
                          {fac.robotSpecs && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {fac.robotSpecs.operatingHours && fac.robotSpecs.operatingHours !== '미기재' && (
                                <span className="px-1.5 py-0.5 rounded text-xs bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-gray-300">
                                  ⏰ {fac.robotSpecs.operatingHours.slice(0, 28)}
                                </span>
                              )}
                              {fac.robotSpecs.closedDays && fac.robotSpecs.closedDays !== '미기재' && (
                                <span className="px-1.5 py-0.5 rounded text-xs bg-red-50 text-red-700">
                                  🛑 {fac.robotSpecs.closedDays.slice(0, 20)}
                                </span>
                              )}
                              {fac.robotSpecs.priceInfo && fac.robotSpecs.priceInfo !== '미기재' && (
                                <span className="px-1.5 py-0.5 rounded text-xs bg-slate-50 text-slate-700">
                                  💰 {fac.robotSpecs.priceInfo.slice(0, 28)}
                                </span>
                              )}
                              {fac.robotSpecs.petAllowed && fac.robotSpecs.petAllowed !== '미기재' && (
                                <span className="px-1.5 py-0.5 rounded text-xs bg-slate-50 text-slate-700">
                                  🐶 반려견 {fac.robotSpecs.petAllowed}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-right text-xs font-bold space-x-1.5">
                          {fac.status === 'pending' && (
                            <button
                              onClick={() => handleApprovePending(fac)}
                              className="inline-flex items-center px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-2xs transition-colors"
                              title="검수를 완료하고 즉시 AI 챗봇이 안내하도록 승인합니다"
                            >
                              ✅ 즉시 승인
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setFormData({
                                name: fac.name,
                                category: fac.category,
                                location: fac.location || '',
                                description: fac.description,
                                seasonalDescription: fac.seasonalDescription || '',
                                tags: Array.isArray(fac.tags)
                                  ? fac.tags.join(', ')
                                  : fac.tags || '',
                              });
                              setEditingId(fac.id || null);
                              setSmartEditResult(null);
                              setSmartEditInstruction('');
                              setFactCheckResult(null);
                              setIsEditModalOpen(true);
                            }}
                            className="inline-flex items-center px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5 mr-1" />
                            {fac.status === 'expired' ? '다시 켜기/수정' : '고치기'}
                          </button>
                          {fac.status !== 'expired' && fac.id && (
                            <button
                              onClick={() => {
                                if (
                                  confirm(
                                    `'${fac.name}' 항목을 잠시 꺼두시겠습니까 (만료보관)?\n(내용은 지워지지 않고 보관되며, AI 챗봇 검색에서만 제외됩니다)`
                                  )
                                ) {
                                  handleExpireAction({ facilityIds: [fac.id as string] });
                                }
                              }}
                              className="inline-flex items-center px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-900 border border-slate-200 rounded-lg transition-colors"
                              title="삭제하지 않고 AI 검색에서만 잠시 제외합니다"
                            >
                              잠시 끄기
                            </button>
                          )}
                          <button
                            onClick={() => fac.id && handleDelete(fac.id, fac.name)}
                            className="inline-flex items-center px-2 py-1.5 text-gray-400 hover:text-red-600 rounded-lg transition-colors"
                            title="영구 삭제"
                          >
                            <Trash2 className="w-4 h-4" />
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

        {/* ===================================================================== */}
        {/* ✏️ 탭 2: 새 지식 하나씩 등록하기 */}
        {/* ===================================================================== */}
        {activeTab === 'single' && (
          <div className="space-y-6">
            {/* 초보자용 원클릭 작성 예시 채우기 배너 */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-amber-900/20 border border-slate-200 dark:border-amber-800/60">
              <p className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-amber-300 mb-2 flex items-center">
                <Sparkles className="w-4 h-4 mr-1.5 text-slate-700" />
                어떻게 적어야 할지 고민되시나요? 아래 예시 버튼을 누르면 모범 답안이 자동으로 채워집니다!
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fillBeginnerExample('leisure')}
                  className="px-3 py-1.5 bg-white dark:bg-neutral-800 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 dark:text-gray-200 transition-colors"
                >
                  🎢 놀이기구/레저 작성 예시 채우기
                </button>
                <button
                  type="button"
                  onClick={() => fillBeginnerExample('dining')}
                  className="px-3 py-1.5 bg-white dark:bg-neutral-800 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 dark:text-gray-200 transition-colors"
                >
                  🍽️ 식당/카페 작성 예시 채우기
                </button>
                <button
                  type="button"
                  onClick={() => fillBeginnerExample('faq')}
                  className="px-3 py-1.5 bg-white dark:bg-neutral-800 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 dark:text-gray-200 transition-colors"
                >
                  🐶 자주 묻는 규정(FAQ) 작성 예시 채우기
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-extrabold text-slate-800 dark:text-gray-200">
                    1. 시설 이름 또는 질문 주제 <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5 mb-1.5">
                    쪼개지 말고 대표 이름 하나로 적어주세요 (예: &apos;원더풀 수온&apos; ❌ ➔ &apos;원더풀&apos; ⭕)
                  </p>
                  <input
                    type="text"
                    name="name"
                    required
                    value={formData.name}
                    onChange={(e) => {
                      handleChange(e);
                      setFactCheckResult(null);
                    }}
                    className="block w-full rounded-xl border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3.5 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                    placeholder="예: 마운틴카트, 남도예담, 반려견 동반 규정"
                  />
                  {matchedMasterFacility && (
                    <div className="mt-2 p-3.5 rounded-xl bg-slate-50 dark:bg-amber-900/20 border border-slate-200 dark:border-amber-800 text-xs text-slate-900 dark:text-amber-300 space-y-2">
                      <p className="font-extrabold flex items-center">
                        💡 잠깐! 이미 [{matchedMasterFacility.name}] 항목이 등록되어 있습니다!
                      </p>
                      <p className="text-slate-900 dark:text-amber-400 leading-relaxed">
                        비슷한 이름으로 여러 개를 만들면 AI가 헷갈립니다. 아래 버튼을 누르면 기존 <strong>[{matchedMasterFacility.name}]</strong>에 내용을 안전하게 합쳐줍니다!
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {formData.name.trim() !== matchedMasterFacility.name && (
                          <button
                            type="button"
                            onClick={() => {
                              setFormData((prev) => ({
                                ...prev,
                                name: matchedMasterFacility.name,
                                category: matchedMasterFacility.category || prev.category,
                                location: prev.location || matchedMasterFacility.location || '',
                              }));
                              setDuplicateAction('merge');
                            }}
                            className="px-3 py-1.5 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 transition-colors"
                          >
                            기존 &apos;{matchedMasterFacility.name}&apos;에 내용 합치기 (추천)
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
                              seasonalDescription:
                                matchedMasterFacility.seasonalDescription || '',
                              tags: Array.isArray(matchedMasterFacility.tags)
                                ? matchedMasterFacility.tags.join(', ')
                                : matchedMasterFacility.tags || '',
                            });
                          }}
                          className="px-3 py-1.5 bg-white dark:bg-neutral-800 border border-slate-200 text-slate-900 rounded-lg font-bold hover:bg-slate-100 transition-colors"
                        >
                          기존 &apos;{matchedMasterFacility.name}&apos; 내용 불러와서 보기
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-extrabold text-slate-800 dark:text-gray-200">
                    2. 분류 선택 <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5 mb-1.5">
                    어느 분야에 속하는지 골라주세요. (일반 규정이나 질문은 &apos;기타&apos; 선택)
                  </p>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    className="block w-full rounded-xl border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3.5 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-extrabold text-slate-800 dark:text-gray-200">
                  3. 위치 안내 (선택 사항)
                </label>
                <p className="text-xs text-slate-500 mt-0.5 mb-1.5">
                  손님이 &quot;어디로 가야 해요?&quot;라고 물어볼 때 안내할 위치입니다. 모르시면 비워두셔도 됩니다.
                </p>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  className="block w-full rounded-xl border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3.5 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                  placeholder="예: 웰컴센터 맞은편 / 셔틀버스 2번 정류장 근처"
                />
              </div>

              {/* 🧩 직원용 초간단 빈칸 채우기 도우미 (7대 핵심 정보 자동 조립) */}
              <div className="bg-slate-50 dark:bg-emerald-950/30 p-4 rounded-xl border border-slate-200 dark:border-emerald-800/70 space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-200 flex items-center">
                      🧩 빈칸만 채우면 끝! AI 표준 설명문 자동 조립기 (선택 사항)
                    </h4>
                    <p className="text-xs text-slate-700 dark:text-emerald-400 mt-0.5">
                      긴 문장으로 쓰기 힘드실 때, 아래 빈칸 중 아는 것만 적고 <strong>[✨ 아래 설명 칸에 채우기]</strong>를 누르면 AI가 100% 이해하는 표준 양식으로 만들어 줍니다!
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowQuickSlotBuilder(!showQuickSlotBuilder)}
                    className="text-xs font-bold text-slate-900 dark:text-emerald-300 underline shrink-0"
                  >
                    {showQuickSlotBuilder ? '빈칸 도우미 접기' : '빈칸 도우미 펼치기'}
                  </button>
                </div>

                {showQuickSlotBuilder && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-900 dark:text-emerald-300 mb-1">
                          ⏰ 운영시간
                        </label>
                        <input
                          type="text"
                          value={quickSlots.hours}
                          onChange={(e) => setQuickSlots({ ...quickSlots, hours: e.target.value })}
                          placeholder="예: 10:00~17:30 (점심 12:30~13:30)"
                          className="w-full rounded-lg border border-slate-200 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-900 dark:text-emerald-300 mb-1">
                          🛑 휴무일
                        </label>
                        <input
                          type="text"
                          value={quickSlots.closedDays}
                          onChange={(e) => setQuickSlots({ ...quickSlots, closedDays: e.target.value })}
                          placeholder="예: 매주 월요일 휴장 / 연중무휴"
                          className="w-full rounded-lg border border-slate-200 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-900 dark:text-emerald-300 mb-1">
                          💰 이용요금 및 할인
                        </label>
                        <input
                          type="text"
                          value={quickSlots.price}
                          onChange={(e) => setQuickSlots({ ...quickSlots, price: e.target.value })}
                          placeholder="예: 성인 21,000원 (투숙객 20% 할인)"
                          className="w-full rounded-lg border border-slate-200 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-900 dark:text-emerald-300 mb-1">
                          📏 이용조건 / 키·나이 제한
                        </label>
                        <input
                          type="text"
                          value={quickSlots.requirements}
                          onChange={(e) => setQuickSlots({ ...quickSlots, requirements: e.target.value })}
                          placeholder="예: 140cm 이상 단독 탑승 가능"
                          className="w-full rounded-lg border border-slate-200 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-900 dark:text-emerald-300 mb-1">
                          ☔ 우천 / 날씨 기준
                        </label>
                        <input
                          type="text"
                          value={quickSlots.rainPolicy}
                          onChange={(e) => setQuickSlots({ ...quickSlots, rainPolicy: e.target.value })}
                          placeholder="예: 우천 시 안전을 위해 운휴"
                          className="w-full rounded-lg border border-slate-200 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-900 dark:text-emerald-300 mb-1">
                          🐶 반려견 동반 여부
                        </label>
                        <input
                          type="text"
                          value={quickSlots.petPolicy}
                          onChange={(e) => setQuickSlots({ ...quickSlots, petPolicy: e.target.value })}
                          placeholder="예: 동반 가능(목줄 필수) / 출입 불가"
                          className="w-full rounded-lg border border-slate-200 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={applyQuickSlotsToDescription}
                        className="inline-flex items-center px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold rounded-lg shadow-2xs transition-colors"
                      >
                        ✨ 위 빈칸 내용을 아래 [4. 상세 설명]에 AI 표준 양식으로 채우기
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-1.5 gap-2">
                  <div>
                    <label className="block text-sm font-extrabold text-slate-800 dark:text-gray-200">
                      4. 상세 설명 (AI가 손님에게 대답할 내용) <span className="text-red-500">*</span>
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      운영시간, 요금, 키 제한, 특징 등을 자유롭게 적어주세요.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleRunFactCheck}
                      disabled={isFactChecking || !formData.name.trim() || !formData.description.trim()}
                      className="inline-flex items-center text-xs font-extrabold px-3 py-1.5 bg-slate-100 text-slate-900 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors disabled:opacity-50 shrink-0"
                    >
                      {isFactChecking ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : (
                        '🔍 등록 전 AI 팩트체크 (기존 DB 충돌 검사)'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleSmartSplit}
                      disabled={isSmartEditing || !formData.description}
                      className="inline-flex items-center text-xs font-bold px-3 py-1.5 bg-slate-50 text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors disabled:opacity-50 shrink-0"
                    >
                      {isSmartEditing ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : (
                        '✨ AI로 기본정보/시즌정보 자동 나누기'
                      )}
                    </button>
                  </div>
                </div>
                <textarea
                  name="description"
                  required
                  rows={5}
                  value={formData.description}
                  onChange={(e) => {
                    handleChange(e);
                    setFactCheckResult(null);
                  }}
                  className="block w-full rounded-xl border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3.5 py-2.5 text-sm focus:border-slate-900 focus:outline-none leading-relaxed"
                  placeholder="예: 오전 10시부터 오후 5시까지 운영합니다. 성인 15,000원, 소인 12,000원이며 투숙객은 20% 할인됩니다."
                />
              </div>

              {/* 🔍 AI 팩트체크 및 정형 슬롯 추출 미리보기 결과 카드 */}
              {factCheckResult && (
                <div
                  className={`p-4 rounded-xl border space-y-3 ${
                    factCheckResult.verdict === 'CONFLICT'
                      ? 'bg-red-50/90 border-red-300 text-red-900 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200'
                      : 'bg-slate-50 border-slate-200 text-slate-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold">
                      {factCheckResult.verdict === 'CONFLICT'
                        ? '🔴 주의! 기존 DB 지식과 숫자/내용 차이가 발견되었습니다'
                        : factCheckResult.verdict === 'MATCH'
                        ? '🟢 AI 팩트체크 통과 (기존 지식과 충돌 없음)'
                        : '🟢 AI 팩트체크 통과 (우리 DB에 처음 등록되는 신규 지식)'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFactCheckResult(null)}
                      className="text-xs underline opacity-75 hover:opacity-100"
                    >
                      닫기
                    </button>
                  </div>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">
                    {factCheckResult.conflictSummary}
                  </p>
                  <div className="bg-white/90 dark:bg-neutral-900/80 p-3 rounded-lg border border-black/10 text-xs">
                    <div className="font-extrabold text-slate-800 dark:text-gray-200 mb-1.5">
                      🤖 AI &amp; 로봇/콜봇이 이 글에서 자동으로 인식한 7대 핵심 데이터:
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-700 dark:text-gray-300">
                      <div>• <strong>운영시간:</strong> {factCheckResult.extractedSpecs.operatingHours}</div>
                      <div>• <strong>휴무일:</strong> {factCheckResult.extractedSpecs.closedDays}</div>
                      <div>• <strong>요금:</strong> {factCheckResult.extractedSpecs.priceInfo}</div>
                      <div>• <strong>위치:</strong> {factCheckResult.extractedSpecs.location}</div>
                      <div>• <strong>이용기준:</strong> {factCheckResult.extractedSpecs.ageHeightLimit}</div>
                      <div>• <strong>우천시:</strong> {factCheckResult.extractedSpecs.rainPolicy}</div>
                      <div>• <strong>반려견:</strong> {factCheckResult.extractedSpecs.petAllowed}</div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-extrabold text-slate-800 dark:text-gray-200">
                  5. 특정 계절이나 기간에만 적용되는 안내 (선택 사항)
                </label>
                <p className="text-xs text-slate-500 mt-0.5 mb-1.5">
                  여름 성수기나 이벤트 기간처럼 특정 시기에만 해당되는 내용이 있으면 여기에 적어주세요.
                </p>
                <textarea
                  name="seasonalDescription"
                  rows={2}
                  value={formData.seasonalDescription}
                  onChange={handleChange}
                  className="block w-full rounded-xl border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3.5 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                  placeholder="예: 7~8월 여름 성수기에는 오후 8시까지 연장 운영합니다."
                />
              </div>

              <div>
                <label className="block text-sm font-extrabold text-slate-800 dark:text-gray-200">
                  6. 관련 검색어 태그 (선택 사항 · 쉼표로 구분)
                </label>
                <p className="text-xs text-slate-500 mt-0.5 mb-1.5">
                  손님들이 다르게 부르는 말(별명)을 적어두면 AI가 더 잘 찾아냅니다.
                </p>
                <input
                  type="text"
                  name="tags"
                  value={formData.tags}
                  onChange={handleChange}
                  className="block w-full rounded-xl border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3.5 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                  placeholder="예: 수영장, 물놀이, 아쿠아풀, 수온"
                />
              </div>

              {/* 고급 옵션 */}
              <div className="border-t border-slate-200 dark:border-neutral-800 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdvancedSingle(!showAdvancedSingle)}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700 flex items-center"
                >
                  {showAdvancedSingle
                    ? '[-] 고급 설정 닫기'
                    : '[+] 이미 같은 이름이 있을 때 처리 방법 설정 (기본값: 똑똑하게 내용 합치기)'}
                </button>
                {showAdvancedSingle && (
                  <div className="mt-3 p-4 bg-slate-50 dark:bg-neutral-800/50 rounded-xl border border-slate-200 dark:border-neutral-700 flex flex-wrap gap-6">
                    <label className="flex items-center cursor-pointer text-sm">
                      <input
                        type="radio"
                        name="singleDuplicateAction"
                        value="merge"
                        checked={duplicateAction === 'merge'}
                        onChange={(e) =>
                          setDuplicateAction(e.target.value as 'merge' | 'overwrite')
                        }
                        className="w-4 h-4 text-slate-700"
                      />
                      <span className="ml-2 font-bold text-slate-800 dark:text-gray-200">
                        기존 내용에 똑똑하게 합치기 (가장 안전 · 추천)
                      </span>
                    </label>
                    <label className="flex items-center cursor-pointer text-sm">
                      <input
                        type="radio"
                        name="singleDuplicateAction"
                        value="overwrite"
                        checked={duplicateAction === 'overwrite'}
                        onChange={(e) =>
                          setDuplicateAction(e.target.value as 'merge' | 'overwrite')
                        }
                        className="w-4 h-4 text-slate-700"
                      />
                      <span className="ml-2 font-bold text-red-600">
                        기존 내용 지우고 새로 덮어쓰기
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {message && (
                <div
                  className={`p-4 rounded-xl text-sm font-bold ${
                    message.includes('✅') || message.includes('성공') || message.includes('⏳')
                      ? 'bg-slate-50 text-slate-900 border border-slate-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {message}
                </div>
              )}

              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2 border-t dark:border-neutral-800">
                <button
                  type="button"
                  onClick={handleRunFactCheck}
                  disabled={isFactChecking || loading || !formData.name.trim() || !formData.description.trim()}
                  className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-200 px-4 py-3 text-xs sm:text-sm font-extrabold disabled:opacity-50 transition-colors"
                >
                  {isFactChecking ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <span className="mr-1.5">🔍</span>
                  )}
                  1단계: 기존 DB 충돌 / AI 정답 팩트체크
                </button>

                <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleSaveWithStatus('pending')}
                    className="inline-flex items-center justify-center rounded-xl bg-slate-100 hover:bg-gray-200 text-slate-800 border border-slate-300 px-4 py-3 text-xs sm:text-sm font-extrabold disabled:opacity-50 transition-colors"
                    title="아직 확신이 없을 때 검수 대기함에 먼저 올려두고 매니저가 승인하게 합니다"
                  >
                    ⏳ 검수 대기열로 등록 (매니저 확인 후 반영)
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-3 text-sm sm:text-base font-extrabold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        AI에게 가르치는 중...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-5 w-5" />
                        ✅ 검증 완료 — AI에게 바로 가르치기
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* ===================================================================== */}
        {/* 🌐 탭 3: 홈페이지 자동연동 & AI 청소기 */}
        {/* ===================================================================== */}
        {activeTab === 'audit' && (
          <div className="space-y-8">
            {/* 🌐 벨포레 공식 홈페이지 일일 크롤링 자동 연동 카드 */}
            <div className="bg-slate-50 dark:bg-emerald-900/20 p-5 rounded-xl border border-slate-200 dark:border-emerald-800 space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-200 flex items-center">
                      <span className="mr-2">🌐</span> 1. 벨포레 공식 홈페이지 매일 아침 자동 연동
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-900">
                      매일 아침 자동 켜짐
                    </span>
                  </div>
                  <p className="text-sm text-slate-900 dark:text-emerald-300">
                    벨포레 홈페이지(<code>belleforetresort.com</code>)에 올라온 <strong>① 특가 패키지</strong>, <strong>② 식음 매장 12곳 운영시간·휴무일·전화번호</strong>, <strong>③ 골프장 요금</strong>을 매일 아침 자동으로 읽어와 우리 DB에 최신 상태로 반영합니다.
                  </p>
                  <p className="text-xs text-slate-700 dark:text-emerald-400">
                    💡 <strong>안심하세요:</strong> 직원이 적어둔 기존 상세 메뉴 설명은 지워지지 않고 그대로 유지되며, 홈페이지에서 끝난 패키지는 자동으로 만료 보관함으로 이동합니다.
                  </p>
                </div>
                <button
                  onClick={handleHomepageSync}
                  disabled={isSyncingHomepage}
                  className="inline-flex items-center px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-extrabold rounded-xl shadow-xs disabled:opacity-50 shrink-0 transition-colors"
                >
                  {isSyncingHomepage ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <span className="mr-1.5">🔄</span>
                  )}
                  {isSyncingHomepage ? '홈페이지 정보 가져오는 중...' : '지금 즉시 홈페이지 정보 가져오기'}
                </button>
              </div>

              {homepageSyncInfo && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-200 text-xs">
                  <div className="bg-white/80 dark:bg-neutral-900/60 p-3 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block">홈페이지 정보 수집 시각</span>
                    <strong className="text-slate-900 dark:text-white text-sm">
                      {homepageSyncInfo.catalogPreview?.lastUpdated
                        ? new Date(homepageSyncInfo.catalogPreview.lastUpdated).toLocaleString('ko-KR')
                        : '확인 중'}
                    </strong>
                  </div>
                  <div className="bg-white/80 dark:bg-neutral-900/60 p-3 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block">우리 DB 최근 반영 시각</span>
                    <strong className="text-slate-700 text-sm">
                      {homepageSyncInfo.syncStatus?.syncedAt
                        ? new Date(homepageSyncInfo.syncStatus.syncedAt).toLocaleString('ko-KR')
                        : '아직 이력 없음'}
                    </strong>
                  </div>
                  <div className="bg-white/80 dark:bg-neutral-900/60 p-3 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block">식음 매장 / 골프장 요금</span>
                    <strong className="text-slate-900 dark:text-white text-sm">
                      식음 {homepageSyncInfo.catalogPreview?.diningVenuesCount || 0}곳 · 골프장{' '}
                      {homepageSyncInfo.catalogPreview?.golfVerified ? '반영됨' : '대기'}
                    </strong>
                  </div>
                  <div className="bg-white/80 dark:bg-neutral-900/60 p-3 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block">진행중 홈페이지 특가 패키지</span>
                    <strong className="text-slate-900 dark:text-white text-sm">
                      활성 {homepageSyncInfo.catalogPreview?.specialOffersCount || 0}건
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {/* 🧹 AI 지식창고 자동 진단 배너 */}
            <div className="bg-slate-50 dark:bg-indigo-900/20 p-5 rounded-xl border border-slate-200 dark:border-indigo-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-1.5">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-200 flex items-center">
                  <span className="mr-2">🧹</span> 2. AI 지식창고 건강 검진 &amp; 중복 정리기
                </h3>
                <p className="text-sm text-slate-900 dark:text-indigo-300">
                  여러 개로 쪼개진 중복 시설이나 날짜가 지난 옛날 패키지가 있는지 AI가 자동으로 검사해 줍니다.
                </p>
              </div>
              <button
                onClick={runRagAudit}
                disabled={loadingAudit}
                className="inline-flex items-center px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-extrabold rounded-xl shadow-xs disabled:opacity-50 shrink-0 transition-colors"
              >
                {loadingAudit ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <span className="mr-1.5">🔍</span>
                )}
                {loadingAudit ? '전체 검사 중...' : '다시 검사하기'}
              </button>
            </div>

            {loadingAudit && !auditData ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-3">
                <Loader2 className="w-10 h-10 text-slate-700 animate-spin" />
                <p className="text-sm text-slate-500">
                  지식창고 데이터를 꼼꼼히 점검하고 있습니다...
                </p>
              </div>
            ) : auditData ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div
                    className={`p-5 rounded-xl border ${
                      auditData.sync?.isSynced
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-red-50/60 border-red-200'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-bold text-slate-500">
                          ① 지식창고 ↔ AI 두뇌 일치 상태
                        </p>
                        <h4 className="text-2xl font-extrabold mt-1 text-slate-900 dark:text-white">
                          {auditData.sync?.approvedFirestoreCount}건 : {auditData.sync?.pineconeCount}개
                        </h4>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          auditData.sync?.isSynced
                            ? 'bg-slate-100 text-slate-900'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {auditData.sync?.isSynced ? '🟢 정상 일치' : '🔴 복구 필요'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      현재 AI가 학습 중인 지식 {auditData.sync?.approvedFirestoreCount}건 (보관함{' '}
                      {auditData.sync?.expiredFirestoreCount || 0}건)
                    </p>
                    {!auditData.sync?.isSynced && (
                      <button
                        onClick={handleSyncVectors}
                        disabled={isSyncingVectors}
                        className="mt-3 w-full py-2 px-3 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg disabled:opacity-50"
                      >
                        {isSyncingVectors ? '복구 중...' : '⚡ 원클릭 자동 맞추기'}
                      </button>
                    )}
                  </div>

                  <div
                    className={`p-5 rounded-xl border ${
                      auditData.duplicateGroups?.length === 0
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-bold text-slate-500">
                          ② 여러 개로 쪼개진 중복 시설
                        </p>
                        <h4 className="text-2xl font-extrabold mt-1 text-slate-900 dark:text-white">
                          {auditData.duplicateGroups?.length || 0}개 묶음
                        </h4>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          auditData.duplicateGroups?.length === 0
                            ? 'bg-slate-100 text-slate-900'
                            : 'bg-slate-100 text-slate-900'
                        }`}
                      >
                        {auditData.duplicateGroups?.length === 0 ? '🟢 깔끔함' : '⚠️ 합치기 권장'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      비슷한 이름으로 나뉘어 있는 문서를 하나로 합쳐줍니다.
                    </p>
                  </div>

                  <div
                    className={`p-5 rounded-xl border ${
                      (auditData.stale?.facilities?.length || 0) +
                        (auditData.stale?.notices?.length || 0) ===
                      0
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-bold text-slate-500">
                          ③ 날짜가 지난 옛날 패키지/공지
                        </p>
                        <h4 className="text-2xl font-extrabold mt-1 text-slate-900 dark:text-white">
                          {(auditData.stale?.facilities?.length || 0) +
                            (auditData.stale?.notices?.length || 0)}
                          건
                        </h4>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          (auditData.stale?.facilities?.length || 0) +
                            (auditData.stale?.notices?.length || 0) ===
                          0
                            ? 'bg-slate-100 text-slate-900'
                            : 'bg-slate-100 text-slate-900'
                        }`}
                      >
                        {(auditData.stale?.facilities?.length || 0) +
                          (auditData.stale?.notices?.length || 0) ===
                        0
                          ? '🟢 모두 최신'
                          : '⏰ 확인 필요'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      이미 지나간 날짜가 적힌 문서를 찾아 알려줍니다.
                    </p>
                  </div>
                </div>

                {/* 중복 그룹 */}
                {auditData.duplicateGroups?.length > 0 && (
                  <div className="border dark:border-neutral-700 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 dark:bg-neutral-800 px-5 py-3.5 border-b dark:border-neutral-700">
                      <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                        📌 하나로 합치면 좋은 중복 문서 ({auditData.duplicateGroups.length}건)
                      </h4>
                    </div>
                    <div className="divide-y dark:divide-neutral-700">
                      {auditData.duplicateGroups.map((group: any) => (
                        <div
                          key={group.masterId}
                          className="p-5 bg-white dark:bg-neutral-900 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4"
                        >
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-0.5 text-xs font-bold rounded bg-slate-100 text-slate-900">
                                {group.count}개 문서 묶음
                              </span>
                              <span className="text-base font-bold text-slate-900 dark:text-white">
                                대표 이름: &quot;{group.masterName}&quot;
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {group.items.map((it: any) => (
                                <span
                                  key={it.id}
                                  className="px-2.5 py-1 rounded-md text-xs bg-slate-100 dark:bg-neutral-800 text-slate-700 border border-slate-200"
                                >
                                  📄 {it.name}
                                </span>
                              ))}
                            </div>
                          </div>
                          <button
                            onClick={() => handleOpenMergeModal(group)}
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shrink-0"
                          >
                            ✨ AI로 내용 합치기 미리보기
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 기한 만료 의심 항목 */}
                {(auditData.stale?.facilities?.length || 0) +
                  (auditData.stale?.notices?.length || 0) >
                  0 && (
                  <div className="border dark:border-neutral-700 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 dark:bg-neutral-800 px-5 py-3.5 border-b dark:border-neutral-700">
                      <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                        ⏰ 날짜가 지난 옛날 패키지 및 공지
                      </h4>
                    </div>
                    <div className="divide-y dark:divide-neutral-700">
                      {(auditData.stale?.notices || []).map((notice: any) => (
                        <div
                          key={notice.id}
                          className="p-4 bg-red-50/30 flex justify-between items-center gap-3"
                        >
                          <div>
                            <span className="font-bold text-sm">{notice.title}</span>
                            <span className="ml-2 text-xs text-red-600">
                              종료일: {notice.endDate}
                            </span>
                            <p className="text-xs text-slate-600 mt-1">{notice.content}</p>
                          </div>
                          <button
                            onClick={() => handleExpireAction({ noticeIds: [notice.id] })}
                            disabled={isExpiringItems}
                            className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-md shrink-0"
                          >
                            공지 끄기
                          </button>
                        </div>
                      ))}
                      {(auditData.stale?.facilities || []).map((fac: any) => (
                        <div
                          key={fac.id}
                          className="p-4 bg-white dark:bg-neutral-900 flex justify-between items-center gap-3"
                        >
                          <div>
                            <span className="font-bold text-sm">{fac.name}</span>
                            <span className="ml-2 text-xs text-slate-700">
                              마지막 날짜: {fac.lastDate}
                            </span>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                              {fac.descriptionPreview}
                            </p>
                          </div>
                          <button
                            onClick={() => handleExpireAction({ facilityIds: [fac.id] })}
                            disabled={isExpiringItems}
                            className="px-3 py-1.5 bg-gray-800 text-white text-xs font-bold rounded-md shrink-0"
                          >
                            보관함으로 이동 (검색 제외)
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* ===================================================================== */}
        {/* 🗂️ 탭 4: 분류(카테고리) & 엑셀 일괄 도구 */}
        {/* ===================================================================== */}
        {activeTab === 'tools' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* 좌측: 분류(카테고리) 관리 */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  🏷️ 1. 분류(카테고리) 이름 관리
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  지식을 나누는 분류표를 추가하거나 이름을 바꿀 수 있습니다. 이름을 바꾸면 기존 시설들도 자동으로 함께 바뀝니다.
                </p>
              </div>

              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  placeholder="새 분류 이름 입력 (예: 패키지)"
                  className="flex-1 rounded-xl border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3.5 py-2 text-sm"
                />
                <button
                  onClick={() => handleCategoryAction('add', { category: newCat })}
                  disabled={!newCat.trim()}
                  className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4 mr-1" /> 추가
                </button>
              </div>

              <div className="border rounded-xl dark:border-neutral-700 overflow-hidden">
                <ul className="divide-y divide-gray-200 dark:divide-neutral-700">
                  {categories.map((cat) => (
                    <li
                      key={cat}
                      className="flex items-center justify-between p-3.5 bg-white dark:bg-neutral-900"
                    >
                      {editCat?.old === cat ? (
                        <div className="flex w-full items-center space-x-2">
                          <input
                            type="text"
                            value={editCat.new}
                            onChange={(e) => setEditCat({ ...editCat, new: e.target.value })}
                            className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                          />
                          <button
                            onClick={() =>
                              handleCategoryAction('update', {
                                oldCategory: cat,
                                newCategory: editCat.new,
                              })
                            }
                            className="px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => setEditCat(null)}
                            className="px-3 py-1.5 bg-gray-200 text-slate-700 text-xs font-bold rounded-lg"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {cat}
                          </span>
                          <div className="flex space-x-1.5">
                            <button
                              onClick={() => setEditCat({ old: cat, new: cat })}
                              className="px-2.5 py-1 text-xs font-bold text-slate-700 bg-slate-50 rounded-md hover:bg-slate-100"
                            >
                              이름 변경
                            </button>
                            <button
                              onClick={() => handleCategoryAction('delete', { category: cat })}
                              className="px-2.5 py-1 text-xs font-bold text-red-600 bg-red-50 rounded-md hover:bg-red-100"
                            >
                              삭제
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* 우측: 엑셀(CSV) 일괄 업로드 */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  📊 2. 엑셀(CSV) 파일로 한 번에 여러 개 올리기
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  많은 양의 데이터를 한꺼번에 등록할 때 사용합니다. 첫 줄 제목은{' '}
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded font-bold">
                    시설명, 카테고리, 위치, 설명, 시즌설명, 태그
                  </code>{' '}
                  순서여야 합니다.
                </p>
              </div>

              <div className="border-2 border-dashed border-slate-300 dark:border-neutral-700 rounded-xl p-6 text-center relative hover:bg-slate-50 transition-colors">
                <input
                  type="file"
                  accept=".csv"
                  ref={fileInputRef}
                  onChange={handleBulkUpload}
                  disabled={isUploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  여기를 클릭하여 .csv 파일을 선택하세요
                </p>
              </div>

              <div className="space-y-2">
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="또는 CSV 내용을 여기에 직접 붙여넣으세요..."
                  rows={4}
                  disabled={isUploading}
                  className="block w-full rounded-xl border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-xs font-mono"
                />
                <button
                  onClick={handleBulkTextUpload}
                  disabled={isUploading || !csvText.trim()}
                  className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-50"
                >
                  {isUploading ? '업로드 진행 중...' : '붙여넣은 내용 일괄 등록하기'}
                </button>
              </div>

              {(isUploading || bulkProgress.total > 0) && (
                <div className="p-4 rounded-xl bg-slate-50 border text-xs space-y-2">
                  <div className="font-bold">
                    진행 현황: {bulkProgress.current} / {bulkProgress.total}건 (성공:{' '}
                    {bulkProgress.current - bulkProgress.failed}건, 실패: {bulkProgress.failed}건)
                  </div>
                  {bulkErrors.length > 0 && (
                    <ul className="text-red-600 list-disc list-inside">
                      {bulkErrors.map((err, idx) => (
                        <li key={idx}>
                          {err.row}번째 줄: {err.error}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* AI 중복/파편화 통합 미리보기 모달 */}
      {mergeModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div
              className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs"
              onClick={() => !mergeModal.isExecuting && setMergeModal(null)}
            />
            <div className="relative w-full max-w-3xl p-6 bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border dark:border-neutral-800 z-10">
              <div className="flex justify-between items-center border-b dark:border-neutral-800 pb-3 mb-4">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                    ✨ AI 문서 통합 미리보기 ({mergeModal.group.count}개 ➔ 1개)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    내용을 확인하고 [승인 및 합치기 실행]을 누르면 깔끔하게 하나로 합쳐집니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !mergeModal.isExecuting && setMergeModal(null)}
                  className="text-gray-400 hover:text-slate-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {mergeModal.isGenerating ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-8 h-8 text-slate-700 animate-spin" />
                  <p className="text-sm text-slate-600">
                    AI가 여러 문서의 내용을 빠짐없이 하나로 합치고 있습니다...
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {mergeModal.summary && (
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900">
                      <strong>📋 AI 요약:</strong> {mergeModal.summary}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold mb-1">통합 대표 이름</label>
                      <input
                        type="text"
                        value={mergeModal.name}
                        onChange={(e) =>
                          setMergeModal((prev) =>
                            prev ? { ...prev, name: e.target.value } : null
                          )
                        }
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">분류</label>
                      <select
                        value={mergeModal.category}
                        onChange={(e) =>
                          setMergeModal((prev) =>
                            prev ? { ...prev, category: e.target.value } : null
                          )
                        }
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">통합된 상세 설명</label>
                    <textarea
                      rows={8}
                      value={mergeModal.description}
                      onChange={(e) =>
                        setMergeModal((prev) =>
                          prev ? { ...prev, description: e.target.value } : null
                        )
                      }
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex justify-end space-x-3 pt-4 border-t">
                    <button
                      type="button"
                      onClick={() => setMergeModal(null)}
                      disabled={mergeModal.isExecuting}
                      className="px-4 py-2 rounded-lg border text-sm font-bold"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={handleExecuteMerge}
                      disabled={mergeModal.isExecuting}
                      className="inline-flex items-center px-5 py-2 rounded-lg bg-slate-900 text-white text-sm font-extrabold"
                    >
                      {mergeModal.isExecuting ? '합치는 중...' : '✅ 승인 및 합치기 실행'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ✏️ 초보자 친화형 지식 수정 모달 */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen px-4 py-8">
            <div
              className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs"
              onClick={() => setIsEditModalOpen(false)}
            />

            <div className="relative w-full max-w-2xl p-6 bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border dark:border-neutral-800 z-10">
              <div className="flex justify-between items-center mb-4 border-b dark:border-neutral-800 pb-3">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                    ✏️ 지식 내용 고치기
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    직접 글자를 고치시거나, 아래 <strong>[🤖 AI에게 말로 시켜서 고치기]</strong>를 쓰시면 편합니다!
                  </p>
                </div>
                <button
                  type="button"
                  className="text-gray-400 hover:text-slate-600"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSmartEditResult(null);
                    setSmartEditInstruction('');
                  }}
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* 🤖 초보자용 AI 스마트 수정 도우미 (가장 눈에 잘 띄는 상단에 배치!) */}
              <div className="mb-5 bg-slate-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-slate-200 dark:border-indigo-800">
                <label className="block text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-200 mb-1">
                  🤖 AI에게 말로 시켜서 고치기 (긴 글을 직접 고치기 힘들 때 써보세요!)
                </label>
                <p className="text-xs text-slate-700 dark:text-indigo-300 mb-2">
                  예: <code>&quot;오전 9시 오픈을 10시로 바꿔줘&quot;</code> 또는 <code>&quot;성인 요금 2만원으로 올리고 화요일 휴무라고 추가해줘&quot;</code>
                </p>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={smartEditInstruction}
                    onChange={(e) => setSmartEditInstruction(e.target.value)}
                    placeholder="어떻게 고칠지 말하듯 적어주세요..."
                    className="flex-1 rounded-lg border border-slate-200 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleSmartEdit}
                    disabled={isSmartEditing || !smartEditInstruction.trim()}
                    className="inline-flex items-center px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs sm:text-sm font-extrabold text-white disabled:opacity-50 shrink-0"
                  >
                    {isSmartEditing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'AI 자동 수정'
                    )}
                  </button>
                </div>

                {smartEditResult && (
                  <div className="mt-3 p-3 bg-white dark:bg-neutral-900 rounded-xl border border-slate-200 space-y-2">
                    <p className="text-xs font-extrabold text-slate-700">
                      ✨ AI가 고친 내용 ({smartEditResult.summary}):
                    </p>
                    <div className="text-xs sm:text-sm text-slate-800 dark:text-gray-200 bg-slate-50 dark:bg-neutral-800 p-2.5 rounded-lg max-h-36 overflow-y-auto whitespace-pre-wrap">
                      {smartEditResult.updatedText}
                    </div>
                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => setSmartEditResult(null)}
                        className="px-3 py-1 text-xs font-bold text-slate-600 bg-slate-100 rounded-md"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={applySmartEdit}
                        className="px-3 py-1 text-xs font-extrabold text-white bg-slate-900 hover:bg-slate-800 rounded-md"
                      >
                        👍 마음에 들어요! 아래 본문에 반영하기
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-gray-300">
                      1. 시설 / 규정 이름
                    </label>
                    <input
                      type="text"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-gray-300">
                      2. 분류
                    </label>
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-gray-300">
                    3. 위치 안내
                  </label>
                  <input
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-bold text-slate-700 dark:text-gray-300">
                      4. 상세 설명 (AI가 손님에게 대답할 내용)
                    </label>
                    <button
                      type="button"
                      onClick={handleRunFactCheck}
                      disabled={isFactChecking || !formData.name.trim() || !formData.description.trim()}
                      className="inline-flex items-center text-xs font-extrabold px-2.5 py-1 bg-slate-100 text-slate-900 hover:bg-slate-200 rounded-md border border-slate-200 disabled:opacity-50"
                    >
                      {isFactChecking ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        '🔍 AI 인식 내용 미리보기 / 팩트체크'
                      )}
                    </button>
                  </div>
                  <textarea
                    name="description"
                    required
                    rows={6}
                    value={formData.description}
                    onChange={(e) => {
                      handleChange(e);
                      setFactCheckResult(null);
                    }}
                    className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm leading-relaxed"
                  />
                </div>

                {factCheckResult && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                    <div className="font-extrabold text-slate-900">
                      🤖 수정된 본문에서 AI가 자동으로 인식한 7대 핵심 슬롯:
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-slate-800">
                      <div>• <strong>운영시간:</strong> {factCheckResult.extractedSpecs.operatingHours}</div>
                      <div>• <strong>휴무일:</strong> {factCheckResult.extractedSpecs.closedDays}</div>
                      <div>• <strong>요금:</strong> {factCheckResult.extractedSpecs.priceInfo}</div>
                      <div>• <strong>위치:</strong> {factCheckResult.extractedSpecs.location}</div>
                      <div>• <strong>이용기준:</strong> {factCheckResult.extractedSpecs.ageHeightLimit}</div>
                      <div>• <strong>우천시:</strong> {factCheckResult.extractedSpecs.rainPolicy}</div>
                      <div>• <strong>반려견:</strong> {factCheckResult.extractedSpecs.petAllowed}</div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-gray-300">
                    5. 시즌/기간 안내 (선택 사항)
                  </label>
                  <textarea
                    name="seasonalDescription"
                    rows={2}
                    value={formData.seasonalDescription}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-gray-300">
                    6. 검색어 태그 (쉼표로 구분)
                  </label>
                  <input
                    type="text"
                    name="tags"
                    value={formData.tags}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                  />
                </div>

                <div className="mt-6 flex justify-end space-x-3 pt-4 border-t dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setSmartEditResult(null);
                      setSmartEditInstruction('');
                      setFactCheckResult(null);
                    }}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-extrabold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        저장 중...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        고친 내용 저장하기
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
