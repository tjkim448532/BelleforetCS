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
      name: '1. 친절한 호텔리어 말투 (권장)',
      badge: '기본 권장',
      description:
        '호텔 프런트 직원처럼 공손하고 정중하게 고객을 응대합니다. 모든 연령대 고객에게 가장 안정적이고 신뢰감을 주는 말투입니다.',
      sampleReply:
        '"안녕하세요 고객님! 벨포레 목장은 오전 10시부터 오후 5시까지 운영하고 있습니다. 가족분들과 함께 즐거운 시간 보내시길 바랍니다."',
      icon: User,
    },
    {
      id: 'professional',
      name: '2. 빠르고 간결한 요약 말투',
      badge: '핵심 요약형',
      description:
        '인사말이나 수식어를 줄이고, 운영시간·요금·위치 등 핵심 수치와 조건만 항목별로 명확하게 전달합니다.',
      sampleReply:
        '"■ 벨포레 목장 안내\n- 운영시간: 10:00 ~ 17:00\n- 입장요금: 대인 8,000원 / 소인 6,000원"',
      icon: Briefcase,
    },
    {
      id: 'guide',
      name: '3. 밝은 테마파크 가이드 말투',
      badge: '가족·시즌용',
      description:
        '테마파크 가이드처럼 친근하고 밝은 톤으로 안내합니다. 연휴나 휴가철 가족 단위 방문객이 많을 때 적합합니다.',
      sampleReply:
        '"반가워요! 귀여운 양들을 만날 수 있는 벨포레 목장은 오전 10시부터 오후 5시까지 운영합니다. 즐거운 나들이 되세요!"',
      icon: Smile,
    },
    {
      id: 'english',
      name: '4. 외국인 전용 영어 모드 (English Only)',
      badge: '국제 행사 전용',
      description:
        '한국어로 질문해도 영어로만 답변합니다. 외국인 단체 행사 기간 외 평상시에는 1번(친절한 호텔리어)으로 유지해 주세요.',
      sampleReply:
        '"Welcome to Belleforet! The Belleforet Ranch is open daily from 10:00 AM to 5:00 PM."',
      icon: Globe,
    },
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-7 h-7 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-white p-7 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
          메뉴 4 · 챗봇 응대 톤앤매너 설정
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          AI 상담원 말투 설정
        </h1>
        <p className="mt-1.5 text-[15px] text-slate-600 leading-relaxed">
          원하는 말투 카드를 선택한 뒤 하단의 <strong className="text-slate-900 font-semibold">[설정 저장 및 적용]</strong> 버튼을 클릭하면 즉시 챗봇 응답에 반영됩니다.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-7">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {personas.map((p) => {
            const Icon = p.icon;
            const isActive = persona === p.id;
            return (
              <div
                key={p.id}
                onClick={() => setPersona(p.id)}
                className={`cursor-pointer rounded-2xl p-6 border transition-all flex flex-col justify-between ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-slate-900 border-slate-200 hover:border-slate-400'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={`w-5 h-5 shrink-0 ${
                          isActive ? 'text-white' : 'text-slate-600'
                        }`}
                      />
                      <h3 className="font-bold text-lg">{p.name}</h3>
                    </div>
                    {isActive ? (
                      <span className="inline-flex items-center text-xs font-semibold bg-white text-slate-900 px-3 py-1 rounded-full shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" /> 현재 적용됨
                      </span>
                    ) : (
                      <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md border border-slate-200 shrink-0">
                        {p.badge}
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-[15px] leading-relaxed ${
                      isActive ? 'text-slate-200' : 'text-slate-600'
                    }`}
                  >
                    {p.description}
                  </p>
                </div>

                <div
                  className={`mt-5 pt-4 border-t ${
                    isActive ? 'border-slate-700' : 'border-slate-100'
                  }`}
                >
                  <span
                    className={`text-xs font-semibold block mb-2 ${
                      isActive ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    실제 답변 예시 (&quot;목장 몇 시까지 운영하나요?&quot;)
                  </span>
                  <div
                    className={`p-4 rounded-xl text-sm whitespace-pre-wrap leading-relaxed border ${
                      isActive
                        ? 'bg-slate-800 text-slate-100 border-slate-700'
                        : 'bg-slate-50 text-slate-800 border-slate-200'
                    }`}
                  >
                    {p.sampleReply}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {savedNotice && (
          <div className="mt-6 p-4 rounded-xl bg-slate-100 border border-slate-300 text-slate-900 text-sm font-semibold flex items-center">
            <CheckCircle2 className="w-5 h-5 mr-2 text-emerald-600" />
            말투 설정이 저장되었습니다. 지금부터 챗봇이 선택한 말투로 고객에게 답변합니다.
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-slate-100 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-3.5 text-[15px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" /> 저장 중...
              </>
            ) : (
              <>
                <Save className="w-5 h-5 mr-2" /> 설정 저장 및 즉시 적용
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
