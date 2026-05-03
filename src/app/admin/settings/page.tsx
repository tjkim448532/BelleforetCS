'use client';

import { useState, useEffect } from 'react';
import { Loader2, Save, User, Briefcase, Smile, Globe } from 'lucide-react';

export default function SettingsAdmin() {
  const [persona, setPersona] = useState<string>('friendly');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

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
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona }),
      });
      
      if (!res.ok) throw new Error('저장에 실패했습니다.');
      
      alert('설정이 성공적으로 저장되었습니다. 이제 챗봇이 새로운 성격으로 대답합니다.');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const personas = [
    {
      id: 'friendly',
      name: '친절한 호텔리어 (기본)',
      description: '공손하고 친절하며 다정하게 고객을 응대합니다. 가장 무난하고 권장되는 기본 모드입니다.',
      icon: User,
      color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
      activeColor: 'ring-2 ring-blue-500 bg-blue-100 border-blue-300'
    },
    {
      id: 'professional',
      name: '명확/간결한 비서',
      description: '불필요한 감정 표현 없이 핵심 내용만 빠르고 정확하게 전달합니다. 비즈니스 고객이 많을 때 유리합니다.',
      icon: Briefcase,
      color: 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100',
      activeColor: 'ring-2 ring-gray-500 bg-gray-200 border-gray-400'
    },
    {
      id: 'guide',
      name: '유쾌한 가이드',
      description: '놀이공원 가이드처럼 에너지가 넘치고 밝게 대답합니다. 이모지도 적극적으로 사용하여 가족 단위 고객에게 친근함을 줍니다.',
      icon: Smile,
      color: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
      activeColor: 'ring-2 ring-orange-500 bg-orange-100 border-orange-300'
    },
    {
      id: 'english',
      name: '외국인 전용 (English Mode)',
      description: '모든 응답을 유창한 영어로만 진행합니다. 외국인 단체 관광객 방문 시즌 등 특별한 경우에 챗봇을 영문 전용으로 강제 전환합니다.',
      icon: Globe,
      color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
      activeColor: 'ring-2 ring-purple-500 bg-purple-100 border-purple-300'
    }
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8 border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">시스템 설정</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          AI 챗봇의 시스템 전반적인 성격과 모드를 제어합니다.
        </p>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-800 p-6">
        <h2 className="text-xl font-semibold mb-2">🤖 AI 페르소나 (말투/성격) 제어</h2>
        <p className="text-sm text-gray-500 mb-6">
          시즌이나 고객 성향에 맞춰 클릭 한 번으로 챗봇의 성격을 변경할 수 있습니다. 변경된 성격은 즉시 적용됩니다.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {personas.map((p) => {
            const Icon = p.icon;
            const isActive = persona === p.id;
            return (
              <div
                key={p.id}
                onClick={() => setPersona(p.id)}
                className={`cursor-pointer rounded-lg p-4 border transition-all ${p.color} ${isActive ? p.activeColor : 'opacity-70 hover:opacity-100'}`}
              >
                <div className="flex items-center mb-2">
                  <Icon className="w-5 h-5 mr-2" />
                  <h3 className="font-bold text-lg">{p.name}</h3>
                  {isActive && <span className="ml-auto text-xs font-bold bg-white/50 px-2 py-1 rounded">현재 선택됨</span>}
                </div>
                <p className="text-sm mt-2 opacity-90">{p.description}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-neutral-800 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md bg-green-600 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 저장 중...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" /> 설정 저장 및 즉시 적용</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
