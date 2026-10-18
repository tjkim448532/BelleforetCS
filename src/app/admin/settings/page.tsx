'use client';

import { useState, useEffect } from 'react';
import { Loader2, Save, User, Briefcase, Smile, Globe, CheckCircle2 } from 'lucide-react';

export default function SettingsAdmin() {
  const [persona, setPersona] = useState<string>('friendly');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      if (res.ok) {
        const data = await res.json();
        setPersona(data.persona || 'friendly');
      }
    } catch (e) {
      console.error('Failed to fetch settings', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSavedNotice(false);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona }),
      });

      if (!res.ok) throw new Error('저장에 실패했습니다.');

      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 4000);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const personas = [
    {
      id: 'friendly',
      name: '1. 친절한 호텔리어 말투 (가장 추천 👍)',
      badge: '기본 추천',
      description:
        '호텔 프런트 직원처럼 공손하고 다정하게 손님을 응대합니다. 남녀노소 모든 고객에게 가장 무난하고 신뢰감을 주는 말투입니다.',
      sampleReply:
        '"안녕하세요 고객님! 벨포레 목장은 오전 10시부터 오후 5시까지 운영하고 있습니다. 가족분들과 함께 즐거운 시간 보내시길 바랍니다 😊"',
      icon: User,
      color: 'bg-blue-50/70 text-blue-900 border-blue-200 hover:bg-blue-100/70',
      activeColor: 'ring-2 ring-blue-600 bg-blue-50 border-blue-500 shadow-md',
    },
    {
      id: 'professional',
      name: '2. 빠르고 간결한 요약 말투',
      badge: '핵심만 전달',
      description:
        '인사말이나 감정 표현을 줄이고, 요금·시간·위치 등 핵심 숫자만 딱딱 짚어서 빠르게 전달합니다.',
      sampleReply:
        '"■ 벨포레 목장 안내\n- 운영시간: 10:00 ~ 17:00\n- 입장요금: 대인 8,000원 / 소인 6,000원"',
      icon: Briefcase,
      color: 'bg-gray-50 text-gray-900 border-gray-200 hover:bg-gray-100',
      activeColor: 'ring-2 ring-gray-700 bg-gray-100 border-gray-600 shadow-md',
    },
    {
      id: 'guide',
      name: '3. 신나는 테마파크 가이드 말투',
      badge: '가족/어린이 시즌용',
      description:
        '놀이공원 가이드처럼 밝고 에너지 넘치게 대답합니다. 어린이날이나 여름 휴가철 가족 고객이 많을 때 좋습니다.',
      sampleReply:
        '"반가워요! 🐑 귀여운 양 친구들을 만날 수 있는 벨포레 목장은 아침 10시부터 오후 5시까지 활짝 열려 있답니다! 🎉"',
      icon: Smile,
      color: 'bg-orange-50/70 text-orange-900 border-orange-200 hover:bg-orange-100/70',
      activeColor: 'ring-2 ring-orange-500 bg-orange-50 border-orange-500 shadow-md',
    },
    {
      id: 'english',
      name: '4. 외국인 전용 영어 모드 (English Only)',
      badge: '외국인 행사 시 주의',
      description:
        '한국어로 물어봐도 무조건 영어로만 대답합니다. 외국인 국제 행사 기간이 아니면 평상시에는 1번(친절한 호텔리어)으로 두세요!',
      sampleReply:
        '"Welcome to Belleforet! The Belleforet Ranch is open daily from 10:00 AM to 5:00 PM."',
      icon: Globe,
      color: 'bg-purple-50/70 text-purple-900 border-purple-200 hover:bg-purple-100/70',
      activeColor: 'ring-2 ring-purple-600 bg-purple-50 border-purple-500 shadow-md',
    },
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-6">
      <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl shadow-xs border border-amber-200 dark:border-amber-900/50">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 mb-2">
          메뉴 4 · 챗봇 말투 선택
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
          😊 AI 상담원 말투 설정
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          원하는 말투 카드를 마우스로 클릭한 뒤, 아래쪽 <strong>[이 말투로 저장하기]</strong> 버튼을 누르면 즉시 바뀝니다. 잘 모르실 때는 <strong>1번(친절한 호텔리어)</strong>을 선택해 두시면 가장 좋습니다!
        </p>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xs border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {personas.map((p) => {
            const Icon = p.icon;
            const isActive = persona === p.id;
            return (
              <div
                key={p.id}
                onClick={() => setPersona(p.id)}
                className={`cursor-pointer rounded-2xl p-5 border transition-all flex flex-col justify-between ${p.color} ${
                  isActive ? p.activeColor : 'opacity-80 hover:opacity-100'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      <Icon className="w-5 h-5 mr-2 shrink-0" />
                      <h3 className="font-extrabold text-base">{p.name}</h3>
                    </div>
                    {isActive ? (
                      <span className="inline-flex items-center text-xs font-extrabold bg-green-600 text-white px-2.5 py-1 rounded-full shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 현재 선택됨
                      </span>
                    ) : (
                      <span className="text-xs font-semibold bg-white/70 px-2 py-0.5 rounded border border-black/10 shrink-0">
                        {p.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm mt-2 leading-relaxed opacity-90">
                    {p.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-black/10">
                  <span className="text-[11px] font-bold uppercase tracking-wider opacity-75 block mb-1">
                    💬 실제 답변 예시 (&quot;목장 몇 시까지 해요?&quot; 질문 시)
                  </span>
                  <div className="bg-white/90 dark:bg-neutral-900/90 p-3 rounded-xl text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed border border-black/5">
                    {p.sampleReply}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {savedNotice && (
          <div className="mt-6 p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm font-bold flex items-center">
            <CheckCircle2 className="w-5 h-5 mr-2 text-green-600" />
            말투 설정이 저장되었습니다! 지금부터 챗봇이 선택한 말투로 손님에게 대답합니다.
          </div>
        )}

        <div className="mt-6 pt-5 border-t border-gray-100 dark:border-neutral-800 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-xl bg-green-600 px-6 py-3 text-base font-extrabold text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" /> 저장 중...
              </>
            ) : (
              <>
                <Save className="w-5 h-5 mr-2" /> 이 말투로 저장 및 즉시 적용하기
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
