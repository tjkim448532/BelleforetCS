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

    const result = await answerGuestQuestion({
      question: utterance.trim(),
      channel: 'kakao',
      externalUserId: kakaoUserId,
    });

    const outputs: any[] = [];

    if (result.links.length > 0) {
      outputs.push({
        basicCard: {
          title: '🌲 벨포레 리조트 AI 안내',
          description: result.answer.slice(0, 230),
          buttons: result.links.map((l) => ({
            action: 'webLink',
            label: l.label,
            webLinkUrl: l.url,
          })),
        },
      });
      if (result.answer.length > 230) {
        outputs.unshift({
          simpleText: {
            text: result.answer,
          },
        });
      }
    } else {
      outputs.push({
        simpleText: {
          text: result.answer,
        },
      });
    }

    return NextResponse.json({
      version: '2.0',
      template: {
        outputs,
        quickReplies: result.quickReplies.map((q) => ({
          label: q,
          action: 'message',
          messageText: q,
        })),
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
