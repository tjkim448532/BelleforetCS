import { NextResponse } from 'next/server';
import { answerGuestQuestion } from '@/lib/cs-intelligence';

/**
 * 벨포레 리조트 AI 콜센터 (실시간 전화 음성 응대 보이스봇) 웹훅 게이트웨이
 * - URL: POST https://<도메인>/api/voice/webhook
 * - 지원 규격:
 *   1) Twilio Voice / SIP Trunk 표준 TwiML (application/x-www-form-urlencoded)
 *   2) JSON AI 보이스 게이트웨이 및 관리자 웹 실시간 음성 통화 시뮬레이터 (application/json)
 */
export async function GET() {
  return NextResponse.json({
    status: 'online',
    service: 'Belleforet AI Voice Concierge Gateway (SIP/Twilio/WebSpeech)',
    webhookEndpoint: '/api/voice/webhook',
  });
}

function escapeXml(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';

    // 1. 통신사(Twilio / SIP 게이트웨이) Form-UrlEncoded 요청 처리 (TwiML XML 응답)
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      const speechResult = String(formData.get('SpeechResult') || '').trim();
      const callerPhone = String(formData.get('From') || '익명발신자').trim();
      const callSid = String(formData.get('CallSid') || 'call_session').trim();

      // 첫 통화 연결 시 인사말 송출 및 음성 인식(Gather) 대기
      if (!speechResult) {
        const welcomeTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="ko-KR" speechTimeout="auto" action="/api/voice/webhook" method="POST">
    <Say language="ko-KR" voice="Polly.Seoyeon">안녕하세요 고객님, 벨포레 리조트 AI 보이스 컨시어지입니다. 오늘 운영 시설이나 요금, 식당 등 궁금하신 점을 말씀해 주세요.</Say>
  </Gather>
  <Say language="ko-KR" voice="Polly.Seoyeon">말씀이 없으셔서 프런트 데스크로 연결해 드리겠습니다.</Say>
</Response>`;
        return new Response(welcomeTwiml, {
          headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        });
      }

      const result = await answerGuestQuestion({
        question: speechResult,
        channel: 'voice',
        externalUserId: callSid,
        callerPhone,
      });

      const spoken = escapeXml(
        result.answer.replace(/https?:\/\/[^\s]+/g, '').replace(/[-•■]/g, '')
      );

      // 고객이 상담원 연결/환불 등을 요청한 경우 프런트 내선 연결 안내
      if (result.classification.needsHumanHandoff) {
        const transferTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ko-KR" voice="Polly.Seoyeon">${spoken} 고객님의 문의 사항을 담당 직원에게 바로 전달하여 연결해 드리겠습니다. 잠시만 기다려 주세요.</Say>
</Response>`;
        return new Response(transferTwiml, {
          headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        });
      }

      const replyTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="ko-KR" speechTimeout="auto" action="/api/voice/webhook" method="POST">
    <Say language="ko-KR" voice="Polly.Seoyeon">${spoken} 추가로 궁금하신 점이 있으시면 말씀해 주세요.</Say>
  </Gather>
</Response>`;
      return new Response(replyTwiml, {
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      });
    }

    // 2. JSON 보이스 게이트웨이 및 관리자 페이지 실시간 음성 통화 체험기 처리
    const body = await req.json().catch(() => ({}));
    const speechText: string = (body.speechText || body.question || '').trim();
    const callerPhone: string = body.callerPhone || '010-1234-5678';

    if (!speechText) {
      return NextResponse.json({
        status: 'ready',
        spokenAnswer:
          '안녕하세요 고객님, 벨포레 리조트 AI 전화 상담원입니다. 무엇을 도와드릴까요?',
      });
    }

    const result = await answerGuestQuestion({
      question: speechText,
      channel: 'voice',
      externalUserId: `voice_${Date.now()}`,
      callerPhone,
    });

    // 음성 합성(TTS)에 적합하도록 URL 및 특수기호 제거
    const spokenAnswer = result.answer
      .replace(/https?:\/\/[^\s)]+/g, '')
      .replace(/\[🌐[^\]]*\]/g, '')
      .replace(/[-•■*#]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return NextResponse.json({
      status: 'success',
      logId: result.logId,
      spokenAnswer,
      writtenAnswer: result.answer,
      classification: result.classification,
      transferToStaff: result.classification.needsHumanHandoff,
      smsFollowUp: {
        to: callerPhone,
        message: `[벨포레 리조트 안내]\n문의하신 "${speechText.slice(0, 20)}" 관련 상세 안내입니다.\n\n${result.answer.slice(0, 200)}`,
        links: result.links,
      },
    });
  } catch (error: any) {
    console.error('[Voice Webhook Error]:', error);
    return NextResponse.json(
      { error: error.message || '음성 응대 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
