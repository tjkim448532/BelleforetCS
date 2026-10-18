import { NextResponse } from 'next/server';
import { answerGuestQuestion } from '@/lib/cs-intelligence';

/**
 * 벨포레 리조트 공식 카카오톡 채널 (Kakao i OpenBuilder Skill v2.0) 실시간 웹훅 엔드포인트
 * - URL: POST https://<도메인>/api/kakao/webhook
 * - 카카오톡 채널에서 고객이 메시지를 보내면 즉시 우리 RAG 두뇌로 답변하고,
 *   통합 인박스(chat_logs)에 channel: 'kakao'로 실시간 기록합니다.
 */
export async function GET() {
  return NextResponse.json({
    status: 'online',
    service: 'Belleforet KakaoTalk Channel Skill Server v2.0',
    webhookEndpoint: '/api/kakao/webhook',
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // Kakao i OpenBuilder 표준 포맷 및 시뮬레이터 간편 포맷 동시 지원
    const utterance: string =
      body?.userRequest?.utterance ||
      body?.utterance ||
      body?.question ||
      '';

    const kakaoUserId: string =
      body?.userRequest?.user?.id ||
      body?.userId ||
      'kakao_guest';

    if (!utterance.trim()) {
      return NextResponse.json({
        version: '2.0',
        template: {
          outputs: [
            {
              simpleText: {
                text: '안녕하세요 고객님! 벨포레 리조트 AI 컨시어지입니다. 궁금하신 시설이나 요금, 운영시간을 편하게 물어보세요 😊',
              },
            },
          ],
        },
      });
    }

    // 고객이 직접 "상담직원 연결"을 요청한 경우 즉시 1:1 채팅 전환 안내 및 인박스 긴급 알림 등록
    if (/^(상담직원\s*연결|상담원\s*연결|직원\s*연결|사람\s*연결)$/.test(utterance.trim())) {
      await answerGuestQuestion({
        question: `[상담직원 연결 요청] ${utterance.trim()}`,
        channel: 'kakao',
        externalUserId: kakaoUserId,
      });
      return NextResponse.json({
        version: '2.0',
        template: {
          outputs: [
            {
              simpleText: {
                text: '👩‍💼 담당 상담원 연결 안내\n\n1. 현재 카카오톡 채팅방 입력창 왼쪽의 [상담직원 전환(또는 채팅상담)] 버튼을 눌러주시면 직원이 1:1 채팅으로 직접 응대해 드립니다.\n2. 급하신 용무는 벨포레 대표번호(📞 1566-0162)로 전화 주시면 즉시 도와드리겠습니다!',
              },
            },
          ],
          quickReplies: [
            {
              label: '오늘 운영 안 하는 시설 있나요?',
              action: 'message',
              messageText: '오늘 운영 안 하는 시설 있나요?',
            },
            {
              label: '마운틴카트 요금 알려줘',
              action: 'message',
              messageText: '마운틴카트 요금 알려줘',
            },
          ],
        },
      });
    }

    const result = await answerGuestQuestion({
      question: utterance.trim(),
      channel: 'kakao',
      externalUserId: kakaoUserId,
    });

    // AI가 답변하기 어려운 질문이거나 불만/환불 문의인 경우 자동으로 상담원 연결 안내 문구 추가
    const finalAnswerText = result.classification.needsHumanHandoff
      ? `${result.answer}\n\n💡 직원의 직접 확인이 필요하신 경우 아래 [👩‍💼 상담직원 연결] 버튼 또는 채팅창 좌측 [상담직원 전환]을 눌러주세요.`
      : result.answer;

    const outputs: any[] = [
      {
        simpleText: {
          text: finalAnswerText,
        },
      },
    ];

    if (result.links.length > 0) {
      outputs.push({
        textCard: {
          title: '🌲 공식 홈페이지 상세 안내',
          description: '아래 버튼을 누르시면 공식 홈페이지 상세 페이지로 이동합니다.',
          buttons: result.links.map((l) => ({
            action: 'webLink',
            label: l.label,
            webLinkUrl: l.url,
          })),
        },
      });
    }

    const quickReplies = [
      ...result.quickReplies.slice(0, 3).map((q) => ({
        label: q,
        action: 'message',
        messageText: q,
      })),
      {
        label: '👩‍💼 상담직원 연결',
        action: 'message',
        messageText: '상담직원 연결',
      },
    ];

    return NextResponse.json({
      version: '2.0',
      template: {
        outputs,
        quickReplies,
      },
      _belleforetMeta: {
        logId: result.logId,
        classification: result.classification,
        links: result.links,
      },
    });
  } catch (error: any) {
    console.error('[Kakao Webhook Error]:', error);
    return NextResponse.json({
      version: '2.0',
      template: {
        outputs: [
          {
            simpleText: {
              text: '죄송합니다 고객님. 일시적인 통신 지연이 발생했습니다. 잠시 후 다시 말씀해 주시거나 벨포레 고객센터(1566-0162)로 문의 부탁드립니다.',
            },
          },
        ],
      },
    });
  }
}
