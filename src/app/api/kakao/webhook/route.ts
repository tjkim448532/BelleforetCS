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

    // 고객이 직접 "상담직원 연결"을 요청한 경우 카카오 공식 operator 액션 버튼(실시간 1:1 채팅 전환) 및 전화연결 버튼 카드 즉시 반환
    if (/^(상담직원\s*연결|상담원\s*연결|직원\s*연결|사람\s*연결|상담\s*연결|채팅\s*상담|상담원)$/.test(utterance.trim())) {
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
              textCard: {
                title: '👩‍💼 벨포레 상담직원 연결',
                description:
                  '아래 [상담직원 실시간 채팅 연결] 버튼을 누르시면 담당 직원과 1:1 대화로 즉시 전환됩니다.\n(채팅 상담시간: 매일 10:00 ~ 17:00)',
                buttons: [
                  {
                    action: 'operator',
                    label: '👩‍💼 상담직원 실시간 채팅 연결',
                  },
                  {
                    action: 'phone',
                    label: '📞 고객센터 전화연결 (1566-0162)',
                    phoneNumber: '1566-0162',
                  },
                ],
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

    const outputs: any[] = [
      {
        simpleText: {
          text: result.answer,
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

    // AI가 답변하기 어려운 질문이거나 불만/환불 문의인 경우 실제 작동하는 카카오 공식 operator/phone 버튼 카드 자동 부착
    if (result.classification.needsHumanHandoff) {
      outputs.push({
        textCard: {
          title: '👩‍💼 담당 상담원 직접 연결',
          description: '직원의 직접 확인이 필요하신 경우 아래 버튼을 눌러 1:1 채팅 또는 전화로 연결하실 수 있습니다.',
          buttons: [
            {
              action: 'operator',
              label: '👩‍💼 상담직원 실시간 채팅 연결',
            },
            {
              action: 'phone',
              label: '📞 고객센터 전화연결 (1566-0162)',
              phoneNumber: '1566-0162',
            },
          ],
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
