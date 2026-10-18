'use client';

import { useState, useEffect } from 'react';
import {
  MessageSquare,
  Search,
  AlertTriangle,
  CheckCircle2,
  PlusCircle,
  X,
  HelpCircle,
  Sparkles,
  PhoneCall,
  Bot,
  Download,
  Copy,
  Check,
  Upload,
  Volume2,
  Mic,
  MicOff,
  Send,
  RefreshCw,
  Cpu,
  ShieldCheck,
  FileText,
} from 'lucide-react';

interface ChatLog {
  id: string;
  question: string;
  answer: string;
  timestamp: string;
  channel?: 'web' | 'kakao' | 'voice' | 'naver';
  externalUserId?: string;
  callerPhone?: string;
  category?: string;
  intentCode?: string;
  intentLabel?: string;
  sentiment?: 'positive' | 'neutral' | 'negative' | 'urgent';
  sentimentLabel?: string;
  needsHumanHandoff?: boolean;
  isResolved?: boolean;
  staffNote?: string;
  askCount?: number;
}

interface RobotSummaryData {
  summary: {
    totalLogs: number;
    goldenLogsCount: number;
    totalFacilities: number;
    robotReadyFacilitiesCount: number;
    channelCounts: Record<string, number>;
    categoryCounts: Record<string, number>;
    sentimentCounts: Record<string, number>;
    needsHandoffCount: number;
  };
  sampleFacilities: Array<{
    id: string;
    title: string;
    category: string;
    robotSpecs?: {
      navigationZone?: string;
      priceAdult?: number | null;
      priceChild?: number | null;
      minHeightCm?: number | null;
      rainOperation?: string;
      petAllowed?: boolean | string | null;
      operatingHours?: string;
      closedDay?: string;
      contactPhone?: string;
    };
  }>;
}

// AI가 답변하지 못했거나 죄송하다고 한 오답/미숙지 답변 자동 판별기
function isUnansweredOrSorry(log: ChatLog): boolean {
  if (log.needsHumanHandoff) return true;
  if (log.sentiment === 'urgent' || log.sentiment === 'negative') return true;
  const answer = log.answer || '';
  const sorryKeywords = [
    '확인이 어렵습니다',
    '정보가 없습니다',
    '찾을 수 없습니다',
    '문의해 주시기 바랍니다',
    '안내해 드리기 어렵습니다',
    '정확한 안내가 어렵',
    '데이터에 없',
    '제공된 정보에',
    '등록되어 있지 않',
  ];
  return sorryKeywords.some((kw) => answer.includes(kw));
}

export default function OmnichannelAndRobotCenterPage() {
  const [activeMainTab, setActiveMainTab] = useState<'inbox' | 'kakao' | 'voice' | 'robot'>('inbox');
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | 'alert' | 'kakao' | 'voice' | 'web'>('all');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // [정답 가르치기] 모달 상태
  const [teachingLog, setTeachingLog] = useState<ChatLog | null>(null);
  const [teachCategory, setTeachCategory] = useState('자주묻는질문(FAQ)');
  const [teachTitle, setTeachTitle] = useState('');
  const [teachAnswer, setTeachAnswer] = useState('');
  const [teachSubmitting, setTeachSubmitting] = useState(false);

  // [상담원 메모] 모달 상태
  const [noteLog, setNoteLog] = useState<ChatLog | null>(null);
  const [staffNoteText, setStaffNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  // [탭 2: 카카오톡 시뮬레이터 & 대화 흡수기] 상태
  const [kakaoSimInput, setKakaoSimInput] = useState('');
  const [kakaoSimMessages, setKakaoSimMessages] = useState<
    Array<{
      sender: 'user' | 'bot';
      text: string;
      quickReplies?: Array<{ label: string; messageText: string }>;
      timestamp: string;
    }>
  >([
    {
      sender: 'bot',
      text: '안녕하세요! 🌲 벨포레 리조트 공식 카카오톡 AI 컨시어지입니다.\n궁금하신 시설 요금, 운영시간, 우천 운행 여부를 카톡으로 편하게 물어보세요!',
      quickReplies: [
        { label: '🏎️ 루지 요금·키제한', messageText: '루지 성인 요금이랑 탑승 키 제한 알려줘' },
        { label: '🌧️ 우천 시 운행여부', messageText: '오늘 비 오는데 마운틴카트랑 루지 운행하나요?' },
        { label: '🍖 남도예담 운영시간', messageText: '남도예담 운영시간이랑 휴무일 알려줘' },
        { label: '⛳ 골프장 그린피·캐디피', messageText: '블랙스톤 벨포레 골프장 주중 주말 그린피랑 캐디피 얼마야?' },
      ],
      timestamp: '방금 전',
    },
  ]);
  const [kakaoSimSending, setKakaoSimSending] = useState(false);

  // 카카오톡 대화 파일 흡수기 상태
  const [rawKakaoText, setRawKakaoText] = useState('');
  const [saveExtractedToRag, setSaveExtractedToRag] = useState(true);
  const [ingestingKakao, setIngestingKakao] = useState(false);
  const [ingestResult, setIngestResult] = useState<{
    message: string;
    extractedPairs: Array<{
      question: string;
      answer: string;
      category: string;
      intentLabel: string;
    }>;
  } | null>(null);

  // [탭 3: AI 전화 콜센터 체험기] 상태
  const [isCallActive, setIsCallActive] = useState(false);
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [callerPhoneSim, setCallerPhoneSim] = useState('010-1234-5678');
  const [voiceInputText, setVoiceInputText] = useState('');
  const [voiceSending, setVoiceSending] = useState(false);
  const [voiceTranscripts, setVoiceTranscripts] = useState<
    Array<{
      speaker: 'guest' | 'ai';
      text: string;
      smsPreview?: string;
      intentLabel?: string;
      time: string;
    }>
  >([]);

  // [탭 4: CS 로봇 데이터셋 센터] 상태
  const [robotData, setRobotData] = useState<RobotSummaryData | null>(null);
  const [loadingRobot, setLoadingRobot] = useState(false);
  const [upgradingDb, setUpgradingDb] = useState(false);

  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://belleforet-cs.vercel.app';

  useEffect(() => {
    fetchLogs();
    fetchRobotSummary();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/logs');
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRobotSummary = async () => {
    setLoadingRobot(true);
    try {
      const res = await fetch('/api/admin/robot-dataset?format=summary');
      const data = await res.json();
      if (data.summary) {
        setRobotData(data);
      }
    } catch (error) {
      console.error('Failed to fetch robot summary:', error);
    } finally {
      setLoadingRobot(false);
    }
  };

  const handleCopyUrl = (url: string, label: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(label);
    setTimeout(() => setCopiedUrl(null), 2500);
  };

  const [teachVerifying, setTeachVerifying] = useState(false);
  const [teachVerifyResult, setTeachVerifyResult] = useState<{
    verdict: 'PASS' | 'WARN' | 'NEW';
    conflictSummary: string;
    polishedAnswer: string;
    matchedFacilities: string[];
  } | null>(null);

  // [정답 가르치기] 모달 열기
  const openTeachModal = (log: ChatLog) => {
    setTeachingLog(log);
    setTeachCategory(log.category || '자주묻는질문(FAQ)');
    setTeachTitle(log.question);
    setTeachVerifyResult(null);
    setTeachAnswer(
      isUnansweredOrSorry(log)
        ? `네, 고객님! 문의하신 "${log.question}"에 대해 안내해 드립니다.\n\n- 상세 내용: `
        : log.answer
    );
  };

  // [정답 가르치기] 사전 AI 팩트체크 (기존 승인 DB와 충돌 여부 검증)
  const handleVerifyTeachAnswer = async () => {
    if (!teachTitle.trim() || !teachAnswer.trim() || teachVerifying) return;
    setTeachVerifying(true);
    setTeachVerifyResult(null);
    try {
      const res = await fetch('/api/admin/robot-dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_staff_answer',
          question: teachTitle.trim(),
          draftAnswer: teachAnswer.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTeachVerifyResult({
          verdict: data.verdict || 'NEW',
          conflictSummary: data.conflictSummary || '',
          polishedAnswer: data.polishedAnswer || teachAnswer,
          matchedFacilities: data.matchedFacilities || [],
        });
      } else {
        alert(`검증 오류: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to verify answer:', error);
      alert('팩트체크 검증 중 오류가 발생했습니다.');
    } finally {
      setTeachVerifying(false);
    }
  };

  // [정답 가르치기] 저장 -> AI 지식창고(Facility + Pinecone) 등록 + 로그 해결 처리
  const submitTeachKnowledge = async (approvalStatus: 'approved' | 'pending') => {
    if (!teachTitle.trim() || !teachAnswer.trim()) return;

    setTeachSubmitting(true);
    try {
      const res = await fetch('/api/admin/facility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `[상담학습] ${teachTitle.trim()}`,
          category: teachCategory,
          type: 'faq',
          status: approvalStatus,
          duplicateAction: 'overwrite',
          description: `[고객 자주 묻는 질문]\n질문: ${teachTitle.trim()}\n\n[공식 답변 및 안내]\n${teachAnswer.trim()}`,
        }),
      });

      if (res.ok && teachingLog) {
        await fetch('/api/admin/robot-dataset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save_staff_reply',
            logId: teachingLog.id,
            updatedAnswer: teachAnswer.trim(),
            staffNote:
              approvalStatus === 'approved'
                ? `[AI 지식창고 즉시반영 완료] ${teachAnswer.trim()}`
                : `[관리자 승인대기(pending) 등록] ${teachAnswer.trim()}`,
            isResolved: approvalStatus === 'approved',
          }),
        });
        alert(
          approvalStatus === 'approved'
            ? '🎉 검증 완료! AI 지식창고(RAG)와 로봇 학습 DB에 즉시 반영되었습니다.\n이제부터 웹·카카오톡·AI전화 어디서든 이 질문이 들어오면 방금 등록하신 정답으로 대답합니다.'
            : '⏳ [시설/지식 관리(/admin/facilities)]의 검수 대기열(pending)에 등록되었습니다.\n책임자가 내용을 최종 확인 후 [승인]을 누르면 AI가 답변을 시작합니다.'
        );
        setTeachingLog(null);
        fetchLogs();
        fetchRobotSummary();
      } else {
        const data = await res.json();
        alert(`오류: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to teach AI:', error);
      alert('지식 등록 중 오류가 발생했습니다.');
    } finally {
      setTeachSubmitting(false);
    }
  };

  const handleTeachSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitTeachKnowledge('approved');
  };

  // [상담원 메모] 저장
  const handleSaveStaffNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteLog) return;
    setNoteSaving(true);
    try {
      const res = await fetch('/api/admin/robot-dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_staff_reply',
          logId: noteLog.id,
          staffNote: staffNoteText.trim(),
          isResolved: true,
        }),
      });
      if (res.ok) {
        alert('✅ 상담원 조치 메모가 저장되고 [해결 완료] 처리되었습니다.');
        setNoteLog(null);
        fetchLogs();
      }
    } catch (error) {
      console.error('Failed to save note:', error);
    } finally {
      setNoteSaving(false);
    }
  };

  // [탭 2] 실시간 카카오톡 웹훅 시뮬레이터 전송
  const sendKakaoSimMessage = async (textToSend?: string) => {
    const utterance = (textToSend ?? kakaoSimInput).trim();
    if (!utterance || kakaoSimSending) return;

    setKakaoSimInput('');
    setKakaoSimSending(true);
    setKakaoSimMessages((prev) => [
      ...prev,
      {
        sender: 'user',
        text: utterance,
        timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    try {
      const res = await fetch('/api/kakao/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userRequest: {
            utterance,
            user: { id: 'kakao_live_tester_01' },
          },
        }),
      });
      const data = await res.json();
      const botText =
        data?.template?.outputs?.[0]?.simpleText?.text ||
        '응답을 불러오지 못했습니다.';
      const quickReplies = data?.template?.quickReplies || [];

      setKakaoSimMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: botText,
          quickReplies,
          timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      // 통합 인박스 로그 새로고침
      fetchLogs();
      fetchRobotSummary();
    } catch (error) {
      console.error('Kakao simulation error:', error);
    } finally {
      setKakaoSimSending(false);
    }
  };

  // [탭 2] 샘플 카카오톡 내보내기 텍스트 채우기
  const loadSampleKakaoExport = () => {
    setRawKakaoText(
      `벨포레 리조트 고객상담 님과 카카오톡 대화\n저장한 날짜 : 2026-10-18 13:30\n\n--------------- 2026년 10월 18일 일요일 ---------------\n[고객 김민수] [오전 10:12] 안녕하세요 제 번호는 010-9876-5432 인데요, 강아지 데리고 벨포레 갈 건데 루지나 마운틴카트에 강아지 같이 탈 수 있나요?\n[벨포레 상담원] [오전 10:14] 안녕하세요 고객님! 루지와 마운틴카트 등 탑승형 레저시설은 안전상의 이유로 반려동물 동반 탑승이 불가합니다. 대신 벨포레 목장(일부 구역)과 산책로, 펫 포레스트에서는 반려견과 즐거운 시간을 보내실 수 있습니다.\n[고객 박지영] [오후 2:05] 오늘 비가 조금 내리는데 사계절썰매장이랑 회전목마 운영하나요?\n[벨포레 상담원] [오후 2:06] 고객님, 회전목마는 실내/지붕 구조 및 기상 상황에 따라 비교적 정상 운영되나, 사계절썰매장과 익스트림 루지는 노면 안전을 위해 우천 시 일시 운휴될 수 있습니다. 방문 전 1566-0162로 확인 부탁드립니다.`
    );
  };

  // [탭 2] 카카오톡 대화 텍스트 자동 흡수 실행
  const handleIngestKakaoExport = async () => {
    if (!rawKakaoText.trim() || ingestingKakao) return;
    setIngestingKakao(true);
    setIngestResult(null);
    try {
      const res = await fetch('/api/admin/kakao/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: rawKakaoText,
          saveToKnowledgeBase: saveExtractedToRag,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setIngestResult({
          message: data.message,
          extractedPairs: data.extractedPairs || [],
        });
        fetchLogs();
        fetchRobotSummary();
      } else {
        alert(`오류: ${data.error}`);
      }
    } catch (error) {
      console.error('Kakao ingest error:', error);
      alert('카카오톡 대화 분석 중 오류가 발생했습니다.');
    } finally {
      setIngestingKakao(false);
    }
  };

  // [탭 3] AI 전화 콜센터 음성 읽기(TTS)
  const speakKoreanText = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.03;
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
  };

  // [탭 3] 전화 통화 시작 / 종료
  const togglePhoneCall = () => {
    if (isCallActive) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsCallActive(false);
      setIsListeningMic(false);
    } else {
      setIsCallActive(true);
      const greeting =
        '안녕하세요, 벨포레 리조트 AI 보이스 컨시어지입니다. 객실, 레저 요금, 식당 운영시간 등 무엇을 도와드릴까요?';
      setVoiceTranscripts([
        {
          speaker: 'ai',
          text: greeting,
          time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      speakKoreanText(greeting);
    }
  };

  // [탭 3] 전화 질문 전송 -> /api/voice/webhook 호출 -> 음성 출력
  const sendVoiceQuestion = async (speechText?: string) => {
    const query = (speechText ?? voiceInputText).trim();
    if (!query || voiceSending) return;

    if (!isCallActive) {
      setIsCallActive(true);
    }
    setVoiceInputText('');
    setVoiceSending(true);
    setVoiceTranscripts((prev) => [
      ...prev,
      {
        speaker: 'guest',
        text: query,
        time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    try {
      const res = await fetch('/api/voice/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speechText: query,
          callerPhone: callerPhoneSim,
        }),
      });
      const data = await res.json();
      const spokenAnswer =
        data.spokenAnswer || '죄송합니다. 다시 한 번 말씀해 주세요.';

      setVoiceTranscripts((prev) => [
        ...prev,
        {
          speaker: 'ai',
          text: spokenAnswer,
          smsPreview: data.followUpSmsText,
          intentLabel: data.classification?.intentLabel,
          time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);

      speakKoreanText(spokenAnswer);
      fetchLogs();
      fetchRobotSummary();
    } catch (error) {
      console.error('Voice webhook error:', error);
    } finally {
      setVoiceSending(false);
    }
  };

  // [탭 3] 브라우저 마이크 음성인식(STT) 시작
  const startMicrophoneRecognition = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        '현재 브라우저에서 마이크 음성 인식을 지원하지 않습니다. 아래의 [원클릭 음성 질문 버튼]이나 텍스트 입력창을 이용해 주세요!'
      );
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SpeechRecognition as any)();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setIsListeningMic(true);
    recognition.start();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setIsListeningMic(false);
      sendVoiceQuestion(transcript);
    };

    recognition.onerror = () => {
      setIsListeningMic(false);
    };

    recognition.onend = () => {
      setIsListeningMic(false);
    };
  };

  // [탭 4] 전체 DB 로봇 규격으로 원클릭 현대화 실행
  const handleUpgradeAllDbForRobot = async () => {
    setUpgradingDb(true);
    try {
      const res = await fetch('/api/admin/robot-dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upgrade_all_db' }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`🎉 ${data.message}`);
        fetchLogs();
        fetchRobotSummary();
      } else {
        alert(`오류: ${data.error}`);
      }
    } catch (error) {
      console.error('Upgrade DB error:', error);
      alert('DB 현대화 중 오류가 발생했습니다.');
    } finally {
      setUpgradingDb(false);
    }
  };

  // 통계 계산
  const alertCount = logs.filter(isUnansweredOrSorry).length;
  const kakaoCount = logs.filter((l) => l.channel === 'kakao').length;
  const voiceCount = logs.filter((l) => l.channel === 'voice').length;
  const webCount = logs.filter((l) => !l.channel || l.channel === 'web').length;

  const filteredLogs = logs.filter((log) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      (log.question || '').toLowerCase().includes(q) ||
      (log.answer || '').toLowerCase().includes(q) ||
      (log.intentLabel || '').toLowerCase().includes(q) ||
      (log.category || '').toLowerCase().includes(q);
    if (!matchesSearch) return false;

    if (channelFilter === 'alert') return isUnansweredOrSorry(log);
    if (channelFilter === 'kakao') return log.channel === 'kakao';
    if (channelFilter === 'voice') return log.channel === 'voice';
    if (channelFilter === 'web') return !log.channel || log.channel === 'web';
    return true;
  });

  const getChannelBadge = (channel?: string) => {
    if (channel === 'kakao') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-extrabold bg-amber-300 text-neutral-900 shadow-2xs">
          💬 카카오톡 채널
        </span>
      );
    }
    if (channel === 'voice') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-extrabold bg-purple-600 text-white shadow-2xs">
          📞 AI 전화 콜센터
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-extrabold bg-green-600 text-white shadow-2xs">
        💻 홈페이지 웹 챗봇
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. 상단 헤더 & 4대 핵심 기능 탭 */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 shadow-xs border border-indigo-100 dark:border-neutral-800">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 mb-2">
              차세대 옴니채널 CS & 로봇 데이터베이스 센터
            </span>
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white flex items-center">
              <MessageSquare className="w-7 h-7 mr-2.5 text-indigo-600 shrink-0" />
              통합 상담 인박스 (웹 · 카톡 · AI전화) & CS 로봇 DB
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              고객이 <strong>홈페이지 챗봇, 카카오톡 채널, 전화 콜센터</strong>로 물어본 모든 질문을 한곳에서 모아서 분류하고, 향후 <strong>CS 안내 로봇 개발 기업</strong>에 즉시 납품할 수 있는 표준 데이터셋으로 자동 변환합니다.
            </p>
          </div>
          <button
            onClick={() => {
              fetchLogs();
              fetchRobotSummary();
            }}
            className="inline-flex items-center px-4 py-2.5 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 transition-colors self-start lg:self-center shrink-0"
          >
            <RefreshCw className="w-4 h-4 mr-1.5" />
            최신 기록 새로고침
          </button>
        </div>

        {/* 4대 메인 탭 네비게이션 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-6 pt-5 border-t border-gray-100 dark:border-neutral-800">
          <button
            onClick={() => setActiveMainTab('inbox')}
            className={`flex items-center p-3.5 rounded-xl border text-left transition-all ${
              activeMainTab === 'inbox'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-gray-50 dark:bg-neutral-800/70 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-neutral-700 hover:bg-gray-100'
            }`}
          >
            <MessageSquare className="w-5 h-5 mr-3 shrink-0" />
            <div>
              <div className="text-sm font-extrabold">1. 통합 상담 인박스</div>
              <div className={`text-xs ${activeMainTab === 'inbox' ? 'text-indigo-100' : 'text-gray-500'}`}>
                웹·카톡·전화 질문분류 & 오답노트
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveMainTab('kakao')}
            className={`flex items-center p-3.5 rounded-xl border text-left transition-all ${
              activeMainTab === 'kakao'
                ? 'bg-amber-400 text-neutral-950 border-amber-500 shadow-sm'
                : 'bg-amber-50/60 dark:bg-neutral-800/70 text-gray-800 dark:text-gray-200 border-amber-200 dark:border-neutral-700 hover:bg-amber-100/60'
            }`}
          >
            <Sparkles className="w-5 h-5 mr-3 shrink-0" />
            <div>
              <div className="text-sm font-extrabold">2. 카카오톡 채널 연동</div>
              <div className={`text-xs ${activeMainTab === 'kakao' ? 'text-neutral-800' : 'text-gray-500'}`}>
                실시간 카톡 챗봇 & 대화파일 흡수
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveMainTab('voice')}
            className={`flex items-center p-3.5 rounded-xl border text-left transition-all ${
              activeMainTab === 'voice'
                ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                : 'bg-purple-50/50 dark:bg-neutral-800/70 text-gray-800 dark:text-gray-200 border-purple-200 dark:border-neutral-700 hover:bg-purple-100/50'
            }`}
          >
            <PhoneCall className="w-5 h-5 mr-3 shrink-0" />
            <div>
              <div className="text-sm font-extrabold">3. AI 전화 콜센터</div>
              <div className={`text-xs ${activeMainTab === 'voice' ? 'text-purple-100' : 'text-gray-500'}`}>
                음성으로 직접 통화 체험 & 연동
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveMainTab('robot')}
            className={`flex items-center p-3.5 rounded-xl border text-left transition-all ${
              activeMainTab === 'robot'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                : 'bg-emerald-50/50 dark:bg-neutral-800/70 text-gray-800 dark:text-gray-200 border-emerald-200 dark:border-neutral-700 hover:bg-emerald-100/50'
            }`}
          >
            <Bot className="w-5 h-5 mr-3 shrink-0" />
            <div>
              <div className="text-sm font-extrabold">4. CS 로봇 데이터센터</div>
              <div className={`text-xs ${activeMainTab === 'robot' ? 'text-emerald-100' : 'text-gray-500'}`}>
                로봇 기업 납품용 DB 현대화·추출
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* [탭 1] 통합 상담 인박스 (웹 · 카카오톡 · AI 전화) */}
      {/* ===================================================================== */}
      {activeMainTab === 'inbox' && (
        <div className="space-y-5">
          {/* 채널별 요약 카드 5개 */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <button
              onClick={() => setChannelFilter('all')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                channelFilter === 'all'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 hover:border-indigo-300'
              }`}
            >
              <div className={`text-xs font-bold ${channelFilter === 'all' ? 'text-indigo-100' : 'text-gray-500'}`}>
                📬 전체 누적 상담
              </div>
              <div className="text-2xl font-extrabold mt-1">{logs.length}건</div>
            </button>

            <button
              onClick={() => setChannelFilter('alert')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                channelFilter === 'alert'
                  ? 'bg-red-600 text-white border-red-600 shadow-sm'
                  : 'bg-white dark:bg-neutral-900 border-red-200 dark:border-red-900/40 hover:border-red-400'
              }`}
            >
              <div className={`text-xs font-bold ${channelFilter === 'alert' ? 'text-red-100' : 'text-red-600'}`}>
                🚨 오답·불만 (확인필요)
              </div>
              <div className="text-2xl font-extrabold mt-1">{alertCount}건</div>
            </button>

            <button
              onClick={() => setChannelFilter('kakao')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                channelFilter === 'kakao'
                  ? 'bg-amber-400 text-neutral-950 border-amber-500 shadow-sm'
                  : 'bg-white dark:bg-neutral-900 border-amber-200 dark:border-amber-900/40 hover:border-amber-400'
              }`}
            >
              <div className={`text-xs font-bold ${channelFilter === 'kakao' ? 'text-neutral-800' : 'text-amber-700'}`}>
                💬 카카오톡 채널
              </div>
              <div className="text-2xl font-extrabold mt-1">{kakaoCount}건</div>
            </button>

            <button
              onClick={() => setChannelFilter('voice')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                channelFilter === 'voice'
                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                  : 'bg-white dark:bg-neutral-900 border-purple-200 dark:border-purple-900/40 hover:border-purple-400'
              }`}
            >
              <div className={`text-xs font-bold ${channelFilter === 'voice' ? 'text-purple-100' : 'text-purple-600'}`}>
                📞 AI 전화 콜센터
              </div>
              <div className="text-2xl font-extrabold mt-1">{voiceCount}건</div>
            </button>

            <button
              onClick={() => setChannelFilter('web')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                channelFilter === 'web'
                  ? 'bg-green-600 text-white border-green-600 shadow-sm'
                  : 'bg-white dark:bg-neutral-900 border-green-200 dark:border-green-900/40 hover:border-green-400'
              }`}
            >
              <div className={`text-xs font-bold ${channelFilter === 'web' ? 'text-green-100' : 'text-green-600'}`}>
                💻 홈페이지 챗봇
              </div>
              <div className="text-2xl font-extrabold mt-1">{webCount}건</div>
            </button>
          </div>

          {/* 검색창 */}
          <div className="bg-white dark:bg-neutral-900 p-4 rounded-2xl shadow-xs border border-gray-200 dark:border-neutral-800 flex items-center">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="질문 내용, AI 답변, 질문 분류(예: 루지, 우천, 골프, 반려견)로 검색해 보세요..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-11 pr-4 py-2.5 border border-gray-300 dark:border-neutral-700 rounded-xl bg-gray-50 dark:bg-neutral-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* 대화 목록 */}
          {loading ? (
            <div className="p-12 text-center text-gray-500 bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800">
              상담 기록을 불러오는 중입니다...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-base font-bold text-gray-900 dark:text-white">
                해당 조건의 상담 기록이 없습니다!
              </p>
              <p className="text-xs text-gray-500 mt-1">
                상단 [2. 카카오톡 채널 연동] 또는 [3. AI 전화 콜센터] 탭에서 바로 카톡/전화를 테스트해 보세요.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredLogs.map((log) => {
                const isSorry = isUnansweredOrSorry(log);
                return (
                  <div
                    key={log.id}
                    className={`bg-white dark:bg-neutral-900 rounded-2xl p-5 shadow-xs border transition-all ${
                      log.isResolved
                        ? 'border-emerald-300 dark:border-emerald-800/60'
                        : isSorry
                        ? 'border-red-300 dark:border-red-800/70 ring-1 ring-red-100 dark:ring-red-900/20'
                        : 'border-gray-200 dark:border-neutral-800'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-gray-100 dark:border-neutral-800">
                      <div className="flex items-center flex-wrap gap-2">
                        {/* 1. 유입 채널 배지 */}
                        {getChannelBadge(log.channel)}

                        {/* 2. 자동 분류된 의도(Intent) 배지 */}
                        {log.intentLabel && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            🏷️ [{log.category || '일반'}] {log.intentLabel}
                          </span>
                        )}

                        {/* 2-1. 중복 질문 누적 횟수 배지 */}
                        {log.askCount && log.askCount > 1 && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-extrabold bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                            🔥 {log.askCount}회 질문됨 (중복 자동병합)
                          </span>
                        )}

                        {/* 3. 감정/상태 배지 */}
                        {log.isResolved ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                            ✅ 상담원 확인·학습 완료
                          </span>
                        ) : isSorry ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-extrabold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                            <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                            {log.sentimentLabel || 'AI 답변 미흡 / 상담원 확인 필요'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-gray-300">
                            {log.sentimentLabel || '🙂 정상 자동 응대'}
                          </span>
                        )}

                        {log.callerPhone && (
                          <span className="text-xs font-mono text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded-md">
                            발신: {log.callerPhone}
                          </span>
                        )}

                        <span className="text-xs text-gray-400">
                          {new Date(log.timestamp).toLocaleString('ko-KR')}
                        </span>
                      </div>

                      {/* 우측 액션 버튼 2종 */}
                      <div className="flex items-center gap-2 self-start sm:self-center">
                        <button
                          onClick={() => openTeachModal(log)}
                          className={`inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-extrabold transition-colors shadow-2xs ${
                            isSorry && !log.isResolved
                              ? 'bg-red-600 hover:bg-red-700 text-white'
                              : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                          }`}
                        >
                          <PlusCircle className="w-3.5 h-3.5 mr-1" />
                          AI에게 정답 가르치기
                        </button>
                        <button
                          onClick={() => {
                            setNoteLog(log);
                            setStaffNoteText(log.staffNote || '');
                          }}
                          className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-neutral-800 dark:text-gray-300"
                        >
                          📝 메모/해결체크
                        </button>
                      </div>
                    </div>

                    {/* 질문 & 답변 본문 */}
                    <div className="space-y-2.5">
                      <div className="flex items-start space-x-2.5">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 shrink-0 mt-0.5">
                          고객 질문
                        </span>
                        <p className="text-base font-bold text-gray-900 dark:text-white">
                          {log.question}
                        </p>
                      </div>

                      <div className="flex items-start space-x-2.5 bg-gray-50 dark:bg-neutral-800/60 p-3.5 rounded-xl border border-gray-100 dark:border-neutral-800">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-extrabold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 shrink-0 mt-0.5">
                          AI 답변
                        </span>
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                          {log.answer}
                        </p>
                      </div>

                      {log.staffNote && (
                        <div className="flex items-start space-x-2.5 bg-emerald-50/70 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-extrabold bg-emerald-600 text-white shrink-0">
                            상담원 조치
                          </span>
                          <p className="text-xs font-medium text-emerald-900 dark:text-emerald-200 whitespace-pre-wrap">
                            {log.staffNote}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* [탭 2] 카카오톡 채널 실시간 연동 (Webhook) & 카톡 대화파일 흡수기 */}
      {/* ===================================================================== */}
      {activeMainTab === 'kakao' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 좌측 (7칸): 실시간 카카오톡 챗봇 시뮬레이터 & 웹훅 연결 주소 */}
          <div className="lg:col-span-7 space-y-6">
            {/* 1. 공식 웹훅 주소 안내 카드 */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-amber-200 dark:border-neutral-800 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold bg-amber-300 text-neutral-900">
                  방법 2 · 실시간 카카오톡 채널 공식 연동 (Webhook)
                </span>
                <span className="text-xs font-bold text-green-600 flex items-center">
                  <span className="w-2 h-2 rounded-full bg-green-500 mr-1.5 animate-pulse" />
                  웹훅 서버 가동 중
                </span>
              </div>
              <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">
                카카오톡 채널과 우리 앱을 연결하는 전용 주소 (Skill URL)
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                카카오 비즈니스(카카오 i 오픈빌더) 관리자 화면의 <strong>[스킬(Skill) URL]</strong> 칸에 아래 주소를 복사해서 붙여넣기만 하면, 고객이 카카오톡으로 질문할 때 우리 AI가 1초 만에 대답하고 모든 대화가 <strong>[1. 통합 상담 인박스]</strong>에 실시간 저장됩니다.
              </p>

              <div className="mt-4 flex items-center gap-2 bg-gray-50 dark:bg-neutral-800 p-3 rounded-xl border border-gray-200 dark:border-neutral-700">
                <code className="text-xs sm:text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400 flex-1 truncate">
                  {originUrl}/api/kakao/webhook
                </code>
                <button
                  onClick={() => handleCopyUrl(`${originUrl}/api/kakao/webhook`, 'kakao')}
                  className="inline-flex items-center px-3.5 py-2 rounded-lg text-xs font-extrabold bg-amber-400 hover:bg-amber-500 text-neutral-950 shrink-0 transition-colors"
                >
                  {copiedUrl === 'kakao' ? (
                    <>
                      <Check className="w-4 h-4 mr-1" /> 복사 완료!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1" /> 주소 복사하기
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 2. 실시간 카카오톡 챗봇 라이브 체험기 */}
            <div className="bg-[#B2C7DA] dark:bg-neutral-900 rounded-2xl p-5 border border-amber-300 dark:border-neutral-800 shadow-sm">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-black/10 dark:border-neutral-800">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-300 flex items-center justify-center font-extrabold text-neutral-900 shadow-2xs">
                    카톡
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-neutral-900 dark:text-white">
                      벨포레 카카오톡 AI 도우미 (외부 카톡 질문 복붙 ➔ 1초 답장 생성)
                    </h3>
                    <p className="text-xs text-neutral-700 dark:text-gray-400">
                      직원이 외부 카카오톡으로 받은 고객 질문을 그대로 복사해 붙여넣으면, 정확한 답장을 만들어 드리고 [통합 인박스]에 자동 저장합니다!
                    </p>
                  </div>
                </div>
              </div>

              {/* 카톡 대화창 영역 */}
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1 mb-4">
                {kakaoSimMessages.map((msg, idx) => (
                  <div key={idx} className="space-y-2">
                    <div
                      className={`flex ${
                        msg.sender === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-2xs whitespace-pre-wrap leading-relaxed ${
                          msg.sender === 'user'
                            ? 'bg-[#FEE500] text-neutral-900 font-semibold rounded-tr-xs'
                            : 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white rounded-tl-xs'
                        }`}
                      >
                        {msg.text}
                        <div className="flex items-center justify-between gap-3 mt-2 pt-1.5 border-t border-black/5 dark:border-white/10">
                          <span className="text-[10px] opacity-60">
                            {msg.timestamp}
                          </span>
                          {msg.sender === 'bot' && idx > 0 && (
                            <button
                              type="button"
                              onClick={() => handleCopyUrl(msg.text, `kakao_msg_${idx}`)}
                              className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-[#FEE500] hover:bg-amber-400 text-neutral-950 shadow-2xs transition-colors"
                            >
                              {copiedUrl === `kakao_msg_${idx}` ? (
                                <>
                                  <Check className="w-3 h-3 mr-1" /> 복사 완료! (카톡에 붙여넣기)
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 mr-1" /> 이 답변 복사해서 카톡에 붙여넣기
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 퀵리플라이 버튼들 */}
                    {msg.sender === 'bot' && msg.quickReplies && msg.quickReplies.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pl-1">
                        {msg.quickReplies.map((qr, qIdx) => (
                          <button
                            key={qIdx}
                            onClick={() => sendKakaoSimMessage(qr.messageText)}
                            disabled={kakaoSimSending}
                            className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/90 hover:bg-amber-300 text-neutral-800 shadow-2xs border border-black/10 transition-colors"
                          >
                            {qr.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {kakaoSimSending && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-neutral-800 rounded-2xl px-4 py-2.5 text-xs font-bold text-gray-500">
                      💬 벨포레 AI가 카카오톡 답변을 작성하고 있습니다...
                    </div>
                  </div>
                )}
              </div>

              {/* 카톡 입력창 */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendKakaoSimMessage();
                }}
                className="flex gap-2 bg-white dark:bg-neutral-800 p-2 rounded-xl shadow-xs"
              >
                <input
                  type="text"
                  value={kakaoSimInput}
                  onChange={(e) => setKakaoSimInput(e.target.value)}
                  placeholder="외부 카톡으로 온 고객 질문을 그대로 복사해 붙여넣으세요 (예: [홍길동] [오후 2:10] 루지 요금 얼마예요?)"
                  className="flex-1 px-3 py-2 text-sm bg-transparent text-gray-900 dark:text-white focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={kakaoSimSending || !kakaoSimInput.trim()}
                  className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-extrabold bg-[#FEE500] hover:bg-amber-400 text-neutral-950 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  카톡 전송
                </button>
              </form>
            </div>
          </div>

          {/* 우측 (5칸): 방법 1 — 카카오톡 대화 내보내기 파일(.txt) 자동 흡수기 */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-gray-200 dark:border-neutral-800 shadow-xs">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 mb-2">
                방법 1 · 과거 카카오톡 상담 내역 자동 흡수기
              </span>
              <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">
                카카오톡 [대화 내보내기] 텍스트 붙여넣기
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                기존에 직원들이 카카오톡으로 상담했던 대화방에서 <strong>[대화 내용 내보내기]</strong> 한 텍스트를 아래에 붙여넣으면, AI가 <strong>고객 전화번호(010-****-****)를 자동 마스킹</strong>하고 핵심 질문·답변만 발라내어 우리 DB에 자동으로 쌓아줍니다!
              </p>

              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={loadSampleKakaoExport}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  샘플 카카오톡 대화 불러오기 (1초 테스트)
                </button>

                <label className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 text-gray-700 dark:text-gray-300 cursor-pointer">
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  .txt 파일 선택
                  <input
                    type="file"
                    accept=".txt,.csv"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const text = await file.text();
                        setRawKakaoText(text);
                      }
                    }}
                  />
                </label>
              </div>

              <textarea
                rows={8}
                value={rawKakaoText}
                onChange={(e) => setRawKakaoText(e.target.value)}
                placeholder="여기에 카카오톡 대화 내용을 붙여넣으세요..."
                className="mt-3 block w-full rounded-xl border border-gray-300 dark:border-neutral-700 p-3 text-xs font-mono bg-gray-50 dark:bg-neutral-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
              />

              <label className="flex items-center space-x-2 mt-3 text-xs font-bold text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveExtractedToRag}
                  onChange={(e) => setSaveExtractedToRag(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>추출된 상담 Q&A를 AI 지식창고(RAG)에도 즉시 학습시키기</span>
              </label>

              <button
                type="button"
                onClick={handleIngestKakaoExport}
                disabled={ingestingKakao || !rawKakaoText.trim()}
                className="mt-4 w-full py-3 px-4 rounded-xl text-sm font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-colors flex items-center justify-center"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {ingestingKakao
                  ? '개인정보 비식별화 및 Q&A 추출 중...'
                  : '카카오톡 대화 분석해서 우리 DB에 넣기'}
              </button>

              {ingestResult && (
                <div className="mt-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2">
                  <div className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
                    ✅ {ingestResult.message}
                  </div>
                  {ingestResult.extractedPairs.map((pair, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-white dark:bg-neutral-900 border border-emerald-100 dark:border-neutral-800 text-xs space-y-1"
                    >
                      <div className="font-bold text-indigo-600">
                        [{pair.category}] {pair.intentLabel}
                      </div>
                      <div className="font-bold text-gray-900 dark:text-white">
                        Q. {pair.question}
                      </div>
                      <div className="text-gray-600 dark:text-gray-400">
                        A. {pair.answer}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* [탭 3] AI 전화 콜센터 체험 & 보이스 게이트웨이 연동 */}
      {/* ===================================================================== */}
      {activeMainTab === 'voice' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 좌측 (7칸): 브라우저 실시간 AI 전화 통화 체험기 */}
          <div className="lg:col-span-7 bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-purple-200 dark:border-neutral-800 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100 dark:border-neutral-800">
              <div>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 mb-1.5">
                  AI 보이스 컨시어지 (STT ➔ 초고속 RAG ➔ TTS 음성 응답)
                </span>
                <h2 className="text-xl font-extrabold text-gray-900 dark:text-white flex items-center">
                  📞 벨포레 AI 전화 콜센터 실시간 체험기
                </h2>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  스피커 볼륨을 켜고 <strong>[전화 걸기]</strong>나 아래 <strong>[원클릭 음성 질문]</strong>을 눌러보세요! AI 상담원이 실제 목소리로 대답하고 알림톡 문자까지 준비합니다.
                </p>
              </div>

              <button
                onClick={togglePhoneCall}
                className={`inline-flex items-center px-5 py-3 rounded-2xl text-sm font-extrabold shadow-sm transition-all shrink-0 ${
                  isCallActive
                    ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
              >
                <PhoneCall className="w-4 h-4 mr-2" />
                {isCallActive ? '통화 종료하기' : '벨포레 AI 콜센터 전화 걸기'}
              </button>
            </div>

            {/* 원클릭 음성 질문 테스트 버튼 */}
            <div>
              <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">
                👇 마이크가 없어도 아래 버튼을 누르면 고객이 전화로 말한 것처럼 즉시 AI 목소리로 대답합니다:
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  '오늘 비가 오는데 루지랑 마운틴카트 타나요?',
                  '남도예담 식당 운영시간이랑 전화번호 알려주세요',
                  '강아지 데리고 갈 건데 목장 입장 가능한가요?',
                  '블랙스톤 골프장 주말 그린피랑 캐디피 얼마예요?',
                ].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendVoiceQuestion(q)}
                    disabled={voiceSending}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-purple-50 hover:bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200 border border-purple-200 dark:border-purple-800 transition-colors"
                  >
                    🎙️ &ldquo;{q}&rdquo;
                  </button>
                ))}
              </div>
            </div>

            {/* 통화 대화창 */}
            <div className="bg-gray-50 dark:bg-neutral-800/70 rounded-2xl p-4 min-h-64 max-h-96 overflow-y-auto space-y-3 border border-gray-200 dark:border-neutral-800">
              {voiceTranscripts.length === 0 ? (
                <div className="text-center py-14 text-gray-400 text-sm">
                  <PhoneCall className="w-10 h-10 mx-auto mb-2 text-purple-400 opacity-70" />
                  위쪽의 <strong>[벨포레 AI 콜센터 전화 걸기]</strong> 또는 <strong>[🎙️ 원클릭 질문 버튼]</strong>을 눌러 통화를 시작해 보세요!
                </div>
              ) : (
                voiceTranscripts.map((item, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${
                      item.speaker === 'guest' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-3.5 text-sm shadow-2xs ${
                        item.speaker === 'guest'
                          ? 'bg-purple-600 text-white font-semibold'
                          : 'bg-white dark:bg-neutral-900 text-gray-900 dark:text-white border border-purple-100 dark:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className="text-[11px] font-extrabold opacity-75">
                          {item.speaker === 'guest' ? '👤 전화 건 고객님' : '👩‍💼 벨포레 AI 보이스 컨시어지'}
                        </span>
                        {item.speaker === 'ai' && (
                          <button
                            type="button"
                            onClick={() => speakKoreanText(item.text)}
                            className="inline-flex items-center text-[11px] font-bold text-purple-600 hover:underline"
                          >
                            <Volume2 className="w-3.5 h-3.5 mr-0.5" /> 다시 듣기
                          </button>
                        )}
                      </div>
                      <p className="leading-relaxed">{item.text}</p>

                      {item.smsPreview && (
                        <div className="mt-2.5 pt-2.5 border-t border-gray-100 dark:border-neutral-800 text-xs text-gray-600 dark:text-gray-400 bg-amber-50/70 dark:bg-neutral-800 p-2.5 rounded-xl">
                          <div className="font-extrabold text-amber-800 dark:text-amber-300 mb-1">
                            📲 통화 종료 후 고객 휴대폰({callerPhoneSim})으로 자동 발송할 요약 문자:
                          </div>
                          <div className="whitespace-pre-wrap text-[11px]">{item.smsPreview}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {voiceSending && (
                <div className="text-xs font-bold text-purple-600 animate-pulse">
                  📞 AI 콜센터가 지식을 검색하여 음성 답변을 생성하고 있습니다...
                </div>
              )}
            </div>

            {/* 마이크 버튼 + 직접 입력창 */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendVoiceQuestion();
              }}
              className="flex gap-2"
            >
              <button
                type="button"
                onClick={startMicrophoneRecognition}
                className={`inline-flex items-center px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all shrink-0 ${
                  isListeningMic
                    ? 'bg-red-600 text-white animate-pulse'
                    : 'bg-purple-100 hover:bg-purple-200 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200'
                }`}
              >
                {isListeningMic ? (
                  <>
                    <MicOff className="w-4 h-4 mr-1.5" /> 듣고 있습니다...
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 mr-1.5" /> 마이크로 말하기
                  </>
                )}
              </button>
              <input
                type="text"
                value={voiceInputText}
                onChange={(e) => setVoiceInputText(e.target.value)}
                placeholder="전화로 물어볼 내용을 입력하거나 [마이크로 말하기]를 누르세요..."
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 text-sm text-gray-900 dark:text-white"
              />
              <button
                type="submit"
                disabled={voiceSending || !voiceInputText.trim()}
                className="inline-flex items-center px-4 py-2.5 rounded-xl text-xs font-extrabold bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 shrink-0"
              >
                음성 응답 듣기
              </button>
            </form>
          </div>

          {/* 우측 (5칸): 실제 전화망(SIP / Twilio / AI 보이스봇) 연동 규격 */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-gray-200 dark:border-neutral-800 shadow-xs space-y-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold bg-purple-100 text-purple-800">
                실제 리조트 대표전화 연동 규격 (Twilio / SIP / KT AI콜센터 호환)
              </span>
              <h3 className="text-lg font-extrabold text-gray-900 dark:text-white">
                오는 전화를 AI가 직접 받는 공식 Voice Webhook
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                우리 앱에는 이미 통신사 보이스 게이트웨이(Twilio Voice, SIP Trunking, 클라우드 콜센터)와 직결할 수 있는 <strong>양방향 음성 웹훅(TwiML XML 및 JSON 동시 지원)</strong>이 탑재되어 있습니다.
              </p>

              <div className="flex items-center gap-2 bg-gray-50 dark:bg-neutral-800 p-3 rounded-xl border border-gray-200 dark:border-neutral-700">
                <code className="text-xs font-mono font-bold text-purple-600 dark:text-purple-400 flex-1 truncate">
                  {originUrl}/api/voice/webhook
                </code>
                <button
                  onClick={() => handleCopyUrl(`${originUrl}/api/voice/webhook`, 'voice')}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-extrabold bg-purple-600 hover:bg-purple-700 text-white shrink-0"
                >
                  {copiedUrl === 'voice' ? '복사됨!' : '주소 복사'}
                </button>
              </div>

              <div className="space-y-2.5 pt-2 text-xs text-gray-600 dark:text-gray-400">
                <div className="p-3 rounded-xl bg-purple-50/60 dark:bg-neutral-800 border border-purple-100 dark:border-neutral-700">
                  <div className="font-extrabold text-purple-900 dark:text-purple-300">
                    1단계: 고객 전화 수신 & 음성 인식 (STT)
                  </div>
                  <p className="mt-0.5">
                    고객이 리조트로 전화를 걸어 말하면 통신사 게이트웨이가 음성을 텍스트로 변환해 위 주소로 전달합니다.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-purple-50/60 dark:bg-neutral-800 border border-purple-100 dark:border-neutral-700">
                  <div className="font-extrabold text-purple-900 dark:text-purple-300">
                    2단계: 0.8초 초고속 RAG 검색 & 구어체 변환
                  </div>
                  <p className="mt-0.5">
                    특수기호나 표를 제거하고 귀로 듣기 가장 편한 2~3문장 호텔리어 구어체로 답변을 만들어 읽어줍니다.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-purple-50/60 dark:bg-neutral-800 border border-purple-100 dark:border-neutral-700">
                  <div className="font-extrabold text-purple-900 dark:text-purple-300">
                    3단계: 불만/예약변경 감지 시 즉시 인간 상담원 연결
                  </div>
                  <p className="mt-0.5">
                    환불·컴플레인 등 민감한 전화는 AI가 자동 감지하여 내선 상담원에게 즉시 호전환(Call Transfer)하고 통합 인박스에 🚨긴급 표시를 남깁니다.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* [탭 4] CS 로봇 개발용 DB 현대화 & 표준 데이터셋 추출 센터 */}
      {/* ===================================================================== */}
      {activeMainTab === 'robot' && (
        <div className="space-y-6">
          {/* 상단: 로봇 DB 현대화 & 2대 표준 파일 다운로드 */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-emerald-200 dark:border-neutral-800 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-gray-100 dark:border-neutral-800">
              <div>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 mb-2">
                  Robotics & Embodied AI Standard Schema v2.0
                </span>
                <h2 className="text-xl font-extrabold text-gray-900 dark:text-white flex items-center">
                  <Bot className="w-6 h-6 mr-2 text-emerald-600" />
                  CS 안내 로봇 개발 기업 납품용 데이터베이스 센터
                </h2>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 max-w-3xl leading-relaxed">
                  로봇 전문 기업(LG 클로이, 베어로보틱스 등)이 벨포레 전용 CS 로봇을 제작할 때는 줄글 텍스트가 아닌 <strong>① 정형 시설 스펙(숫자형 요금, 키 제한 cm, 우천 운행 코드, 자율주행 구역 Zone)</strong>과 <strong>② 의도(Intent)가 분류된 Golden Q&A 학습셋(.jsonl)</strong>이 필요합니다. 아래 버튼으로 언제든 최신 로봇 데이터셋을 추출하세요.
                </p>
              </div>

              <div className="flex flex-wrap gap-2.5 shrink-0">
                <button
                  onClick={handleUpgradeAllDbForRobot}
                  disabled={upgradingDb}
                  className="inline-flex items-center px-4 py-3 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50 transition-colors"
                >
                  <Cpu className="w-4 h-4 mr-1.5" />
                  {upgradingDb
                    ? '전체 DB 로봇 규격 변환 중...'
                    : '⚡ 전체 DB 로봇 규격으로 원클릭 동기화'}
                </button>

                <a
                  href="/api/admin/robot-dataset?format=jsonl"
                  download
                  className="inline-flex items-center px-4 py-3 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  1. 로봇 학습용 Q&A 데이터셋 (.jsonl) 다운로드
                </a>

                <a
                  href="/api/admin/robot-dataset?format=specs"
                  download
                  className="inline-flex items-center px-4 py-3 rounded-xl text-xs font-extrabold bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-neutral-900 shadow-sm transition-colors"
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  2. 로봇 자율주행·요금 정형 스펙 (.json) 다운로드
                </a>
              </div>
            </div>

            {/* 로봇 데이터 준비 현황 KPI */}
            {loadingRobot || !robotData ? (
              <div className="py-8 text-center text-sm text-gray-500">
                로봇 데이터베이스 현황을 분석하고 있습니다...
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
                <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-neutral-800 border border-emerald-200 dark:border-neutral-700">
                  <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    🤖 로봇 정형스펙 완비 시설
                  </div>
                  <div className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
                    {robotData.summary.robotReadyFacilitiesCount} / {robotData.summary.totalFacilities}개
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    자율주행 Zone · 숫자요금 · 키제한 자동 구조화
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-indigo-50/70 dark:bg-neutral-800 border border-indigo-200 dark:border-neutral-700">
                  <div className="text-xs font-bold text-indigo-800 dark:text-indigo-300">
                    🧠 로봇 파인튜닝 Golden 대화셋
                  </div>
                  <div className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
                    {robotData.summary.goldenLogsCount}건
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    검증 완료된 고품질 고객 질문·답변 쌍
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-neutral-800 border border-amber-200 dark:border-neutral-700">
                  <div className="text-xs font-bold text-amber-800 dark:text-amber-300">
                    🏷️ 자동 분류된 고객 질문 카테고리
                  </div>
                  <div className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
                    {Object.keys(robotData.summary.categoryCounts || {}).length}개 분야
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1 truncate">
                    {Object.entries(robotData.summary.categoryCounts || {})
                      .map(([k, v]) => `${k}(${v})`)
                      .join(', ') || '집계 중'}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-neutral-800 border border-blue-200 dark:border-neutral-700">
                  <div className="text-xs font-bold text-blue-800 dark:text-blue-300 flex items-center">
                    <ShieldCheck className="w-4 h-4 mr-1" /> 개인정보 비식별화 보호
                  </div>
                  <div className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
                    100% 적용
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    전화번호·계좌·이메일 자동 마스킹 완료
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 하단: 시설별 로봇 정형 스펙(Robot Specs) 실시간 미리보기 테이블 */}
          {robotData && robotData.sampleFacilities && (
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-gray-200 dark:border-neutral-800 shadow-xs">
              <h3 className="text-base font-extrabold text-gray-900 dark:text-white mb-1">
                🔍 시설별 로봇 정형 데이터(Robot-Ready Structured Specs) 미리보기
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                시설 설명글을 수정하거나 홈페이지 동기화가 돌 때마다 AI가 아래의 로봇 전용 정형 필드를 자동으로 추출·갱신합니다.
              </p>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-neutral-800 text-gray-500 font-extrabold bg-gray-50 dark:bg-neutral-800/60">
                      <th className="py-3 px-3 rounded-tl-xl">시설명</th>
                      <th className="py-3 px-3">로봇 주행구역 (Zone)</th>
                      <th className="py-3 px-3">성인 요금(숫자)</th>
                      <th className="py-3 px-3">소인 요금(숫자)</th>
                      <th className="py-3 px-3">신장 제한</th>
                      <th className="py-3 px-3">우천 시 운행</th>
                      <th className="py-3 px-3">반려견 동반</th>
                      <th className="py-3 px-3 rounded-tr-xl">운영시간 / 연락처</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                    {robotData.sampleFacilities.map((fac) => {
                      const s = fac.robotSpecs || {};
                      return (
                        <tr key={fac.id} className="hover:bg-gray-50/80 dark:hover:bg-neutral-800/40">
                          <td className="py-3 px-3 font-extrabold text-gray-900 dark:text-white">
                            [{fac.category}] {fac.title}
                          </td>
                          <td className="py-3 px-3 font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                            {s.navigationZone || '-'}
                          </td>
                          <td className="py-3 px-3 font-bold">
                            {s.priceAdult != null ? `${s.priceAdult.toLocaleString()}원` : '-'}
                          </td>
                          <td className="py-3 px-3">
                            {s.priceChild != null ? `${s.priceChild.toLocaleString()}원` : '-'}
                          </td>
                          <td className="py-3 px-3">
                            {s.minHeightCm != null ? `${s.minHeightCm}cm 이상` : '제한없음'}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-bold">
                              {s.rainOperation || 'WEATHER_DEPENDENT'}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {s.petAllowed === true || s.petAllowed === '동반가능'
                              ? '🐶 동반가능'
                              : s.petAllowed === '케이지/유모차필수'
                              ? '🐶 케이지/유모차필수'
                              : s.petAllowed === false || s.petAllowed === '동반불가'
                              ? '🚫 동반불가'
                              : s.petAllowed || '-'}
                          </td>
                          <td className="py-3 px-3 text-gray-500">
                            {s.operatingHours || '-'} {s.contactPhone ? `(${s.contactPhone})` : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* [모달 1] 원클릭 [AI에게 정답 가르치기] */}
      {/* ===================================================================== */}
      {teachingLog && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div
              className="fixed inset-0 bg-black/60 transition-opacity"
              onClick={() => setTeachingLog(null)}
            />
            <div className="relative inline-block bg-white dark:bg-neutral-900 rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:max-w-lg sm:w-full border border-gray-200 dark:border-neutral-800">
              <form onSubmit={handleTeachSubmit}>
                <div className="px-6 pt-6 pb-4">
                  <div className="flex justify-between items-center pb-3 border-b border-gray-200 dark:border-neutral-800">
                    <div>
                      <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                        원클릭 AI 정답 학습 & 로봇 데이터셋 등록
                      </span>
                      <h3 className="text-lg font-extrabold text-gray-900 dark:text-white mt-0.5">
                        ✏️ 이 질문의 정확한 정답을 AI에게 알려주세요
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTeachingLog(null)}
                      className="text-gray-400 hover:text-gray-500"
                    >
                      <X className="h-6 w-6" />
                    </button>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                        어느 분야의 지식인가요?
                      </label>
                      <select
                        value={teachCategory}
                        onChange={(e) => setTeachCategory(e.target.value)}
                        className="block w-full rounded-xl border border-gray-300 dark:border-neutral-700 p-2.5 text-sm bg-white dark:bg-neutral-800 text-gray-900 dark:text-white"
                      >
                        <option value="자주묻는질문(FAQ)">자주묻는질문(FAQ)</option>
                        <option value="액티비티/레저">액티비티/레저</option>
                        <option value="식음료/다이닝">식음료/다이닝</option>
                        <option value="숙박/객실">숙박/객실</option>
                        <option value="골프">골프</option>
                        <option value="펫/반려동물">펫/반려동물</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                        고객 질문 제목
                      </label>
                      <input
                        type="text"
                        required
                        value={teachTitle}
                        onChange={(e) => setTeachTitle(e.target.value)}
                        className="block w-full rounded-xl border border-gray-300 dark:border-neutral-700 p-2.5 text-sm bg-gray-50 dark:bg-neutral-800 text-gray-900 dark:text-white font-bold"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                          앞으로 AI가 대답할 정확한 안내 내용
                        </label>
                        <button
                          type="button"
                          onClick={handleVerifyTeachAnswer}
                          disabled={teachVerifying || !teachAnswer.trim()}
                          className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-amber-100 hover:bg-amber-200 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300 transition-colors disabled:opacity-50"
                        >
                          <Sparkles className="w-3.5 h-3.5 mr-1" />
                          {teachVerifying ? '기존 DB와 대조 검증 중...' : '🔍 기존 DB 충돌/정답 AI 팩트체크'}
                        </button>
                      </div>
                      <textarea
                        rows={5}
                        required
                        value={teachAnswer}
                        onChange={(e) => setTeachAnswer(e.target.value)}
                        className="block w-full rounded-xl border border-gray-300 dark:border-neutral-700 p-3 text-sm bg-white dark:bg-neutral-800 text-gray-900 dark:text-white leading-relaxed"
                      />

                      {teachVerifyResult && (
                        <div
                          className={`mt-3 p-3.5 rounded-xl border text-xs space-y-2 ${
                            teachVerifyResult.verdict === 'WARN'
                              ? 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/30 dark:border-red-800 dark:text-red-200'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-200'
                          }`}
                        >
                          <div className="font-extrabold flex items-center justify-between">
                            <span>{teachVerifyResult.conflictSummary}</span>
                          </div>
                          {teachVerifyResult.matchedFacilities.length > 0 && (
                            <div className="text-[11px] opacity-80">
                              대조한 공식 문서: {teachVerifyResult.matchedFacilities.join(', ')}
                            </div>
                          )}
                          {teachVerifyResult.polishedAnswer &&
                            teachVerifyResult.polishedAnswer !== teachAnswer && (
                              <div className="pt-2 border-t border-black/10 dark:border-white/10">
                                <div className="font-bold mb-1">✨ AI 교정 표준 문장 제안:</div>
                                <div className="p-2 rounded-lg bg-white/80 dark:bg-neutral-900/80 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                  {teachVerifyResult.polishedAnswer}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setTeachAnswer(teachVerifyResult.polishedAnswer)}
                                  className="mt-2 inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-indigo-600 text-white hover:bg-indigo-700"
                                >
                                  이 다듬어진 문장으로 바꾸기
                                </button>
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-neutral-800/60 px-6 py-4 flex flex-wrap justify-between items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTeachingLog(null)}
                    className="px-3.5 py-2 rounded-xl border border-gray-300 dark:border-neutral-700 text-xs font-bold text-gray-700 dark:text-gray-300 bg-white dark:bg-neutral-800"
                  >
                    취소
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={teachSubmitting}
                      onClick={() => submitTeachKnowledge('pending')}
                      className="px-3.5 py-2 rounded-xl text-xs font-extrabold text-amber-900 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 disabled:opacity-50"
                    >
                      ⏳ 관리자 검수 대기열로 등록
                    </button>
                    <button
                      type="submit"
                      disabled={teachSubmitting}
                      className="px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
                    >
                      {teachSubmitting ? '저장 중...' : '✅ 검증 완료 — AI 즉시 반영'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* [모달 2] 상담원 조치 메모 & 해결 완료 체크 */}
      {/* ===================================================================== */}
      {noteLog && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-black/60 transition-opacity" onClick={() => setNoteLog(null)} />
            <div className="relative inline-block bg-white dark:bg-neutral-900 rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:max-w-md sm:w-full border border-gray-200 dark:border-neutral-800">
              <form onSubmit={handleSaveStaffNote}>
                <div className="px-6 pt-6 pb-4">
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
                    📝 상담원 조치 메모 및 [해결 완료] 체크
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    전화 콜백 완료 여부나 특이사항을 적어두면 다른 직원들과 공유되며 [해결 완료] 상태로 변경됩니다.
                  </p>
                  <textarea
                    rows={4}
                    value={staffNoteText}
                    onChange={(e) => setStaffNoteText(e.target.value)}
                    placeholder="예: 고객님께 전화드려 루지 탑승 규정 상세 안내 완료함 (담당: 김벨포레)"
                    className="mt-3 block w-full rounded-xl border border-gray-300 dark:border-neutral-700 p-3 text-sm bg-gray-50 dark:bg-neutral-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="bg-gray-50 dark:bg-neutral-800/60 px-6 py-3.5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setNoteLog(null)}
                    className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 bg-white"
                  >
                    닫기
                  </button>
                  <button
                    type="submit"
                    disabled={noteSaving}
                    className="px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700"
                  >
                    {noteSaving ? '저장 중...' : '✅ 메모 저장 및 해결 완료'}
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
