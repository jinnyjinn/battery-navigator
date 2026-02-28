// ─────────────────────────────────────────────
//  Vercel Edge Function — 보고서 생성 (SSE 스트리밍)
//  Edge Runtime: 스트리밍 무제한, 전 세계 엣지 서버 실행
// ─────────────────────────────────────────────
export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `당신은 LG화학, 삼성바이오로직스 등 글로벌 화학/배터리/바이오 대기업에서 15년간 R&D 및 생산기술(QC) 수석 연구원으로 근무하다 인사팀장으로 발탁된 '최고급 전문 면접 컨설턴트'입니다.
비전문가 임원부터 날카로운 실무진까지 모든 면접관이 활용할 수 있도록, 면접 형식별로 구분된 완전한 컨설팅 보고서를 작성합니다.

## 보고서 구성 (지원 회사가 2곳 이상이면 회사별로 반복)
### Page 1: 📊 핵심 요약 및 직무 적합성 분석
### Page 2: 🎯 면접 형식별 심층 질문 리스트 (임원/실무진/PT/토론)
### Page 3: 📋 종합 평가표 및 합격 가이드

표, 목록, 요약 활용한 구조화된 마크다운으로 작성하세요.`;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: '요청 파싱 실패' }), { status: 400 });
  }

  const { model = 'claude-3-5-sonnet-20240620', apiKey, candidateName, education, major, resumeText, companies } = body;

  if (!resumeText || !companies?.length) {
    return new Response(JSON.stringify({ error: '데이터 부족' }), { status: 400 });
  }

  const isGemini = model.startsWith('gemini');
  const rawKey = apiKey || (isGemini ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY);
  const activeKey = rawKey ? rawKey.trim() : null;

  if (!activeKey) {
    return new Response(JSON.stringify({ error: 'API 키가 필요합니다.' }), { status: 400 });
  }

  const companiesText = companies
    .map((c, i) => `${i + 1}. 회사: ${c.name} / 직무: ${c.position}`)
    .join('\n');

  const userPrompt = `지원자: ${candidateName}, 전공: ${major}\n지원회사:\n${companiesText}\n\n이력서:\n${resumeText}`;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (isGemini) {
          // Gemini API v1 (정식 버전) 사용
          const combinedPrompt = `[시스템 지침]\n${SYSTEM_PROMPT}\n\n[사용자 요청]\n${userPrompt}`;
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:streamGenerateContent?alt=sse&key=${activeKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }],
              generationConfig: { maxOutputTokens: 8000, temperature: 0.7 }
            })
          });

          if (!geminiRes.ok) {
            const errJson = await geminiRes.json().catch(() => ({}));
            throw new Error(errJson?.error?.message || `Gemini API 오류: ${geminiRes.status}`);
          }

          const reader = geminiRes.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              try {
                const ev = JSON.parse(line.slice(6));
                const text = ev.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`));
              } catch (_) { }
            }
          }
        } else {
          // Anthropic
          const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': activeKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model,
              max_tokens: 8000,
              stream: true,
              system: SYSTEM_PROMPT,
              messages: [{ role: 'user', content: userPrompt }]
            })
          });

          if (!anthropicRes.ok) {
            const errJson = await anthropicRes.json().catch(() => ({}));
            throw new Error(errJson?.error?.message || `Anthropic 오류: ${anthropicRes.status}`);
          }

          const reader = anthropicRes.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const raw = line.slice(6).trim();
              if (raw === '[DONE]') continue;
              try {
                const ev = JSON.parse(raw);
                if (ev.type === 'content_block_delta') {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: ev.delta.text })}\n\n`));
                }
              } catch (_) { }
            }
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        controller.close();
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
  });
}
