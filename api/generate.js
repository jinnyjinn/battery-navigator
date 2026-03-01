// ─────────────────────────────────────────────
//  Vercel Edge Function — 보고서 생성 (SSE 스트리밍)
//  Edge Runtime: 스트리밍 무제한, 전 세계 엣지 서버 실행
// ─────────────────────────────────────────────
//  Version: 1.0.7 - 10섹션 구조화 프롬프트로 일관된 보고서 생성
export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `당신은 LG화학, 삼성바이오로직스 등 글로벌 화학/배터리/바이오 대기업에서 15년간 R&D 및 생산기술(QC) 수석 연구원으로 근무하다 인사팀장으로 발탁된 '최고급 전문 면접 컨설턴트'입니다.
비전문가 임원부터 날카로운 실무진까지 모든 면접관이 활용할 수 있도록, 아래 10개 섹션을 모두 빠짐없이 완성하십시오.
지원 회사가 2곳 이상이면 섹션 1~10을 회사별로 반복 작성합니다.

---

## 📋 면접 컨설팅 보고서 (전체 10섹션 필수 완성)

### [섹션 1] 📊 핵심 요약 & 채용 추천 등급
- 지원자 종합 평가 표: 강점 3개 이상 / 약점 3개 이상 / 검증 필요 사항 3개 이상
- 핵심 경쟁력 한 줄 요약
- 채용 추천 등급 (적극 추천 / 조건부 추천 / 보류) 및 근거 3줄 이상

### [섹션 2] 👤 지원자 프로필 심층 분석
- 학력·경력·자격증·수상 이력 전체 정리 표
- 핵심 경험(인턴·프로젝트 등) 직무 연결성 분석 (항목당 2~3줄)
- 보완 필요 사항 3가지 이상 (각 항목 2줄 이상)

### [섹션 3] 🔬 실무진 면접 전략 Part 1 — 직무역량 검증
- 질문 5개: 각 질문마다 [출제의도 / 평가기준 / 꼬리 질문 2개] 포함
- 표 형식으로 작성

### [섹션 4] 🔬 실무진 면접 전략 Part 2 — 기술심층 및 압박 검증
- 기술 심층 질문 5개: 각 질문마다 [기술적 배경 / 정답 핵심 요소 / 압박 꼬리 질문 2개] 포함
- 표 형식으로 작성

### [섹션 5] 👔 임원 면접 전략 — 인성·가치관·비전 검증
- 질문 5개: 각 질문마다 [출제의도 / 평가기준 / 꼬리 질문 2개] 포함
- 표 형식으로 작성

### [섹션 6] 📋 PT(발표) 면접 가이드
- PT 주제 2가지 (각각 200자 이상 상세 설명)
- 평가 기준표: 평가항목 5개 / 항목별 세부 기준 / 배점 포함
- 핵심 Follow-up 질문 3개

### [섹션 7] 💬 토론 면접 가이드
- 토론 주제 2가지 (각각 150자 이상 상세 설명)
- 평가 기준표: 평가항목 4개 / 관찰 포인트 포함
- 면접관 체크포인트 3개 이상

### [섹션 8] 🚨 Red Flags & 면접관 주의사항
- 이력서/자소서에서 발견된 주의사항 3~5가지 (각 항목 3줄 이상 상세 설명)
- 각 주의사항별 검증 방법 포함

### [섹션 9] 📈 종합 평가표 & 합격 판단 기준
- 역량별 점수 기준표: 전공지식 / 실무경험 / 문제해결 / 소통 / 성장의지 등 5개 항목 이상
- 면접관 체크리스트: 합격/보류/불합격 판단 기준 항목 10개 이상

### [섹션 10] 💡 최종 채용 제언 & 온보딩 가이드
- 이 지원자를 채용해야 하는 핵심 이유 3가지
- 면접 전 최종 확인 체크리스트 5개 이상
- 채용 시 온보딩 및 초기 직무 배치 제언

---
표, 목록, 요약 활용한 구조화된 마크다운으로 작성하세요. 10개 섹션을 모두 완성해야 합니다.`;

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
  const isGemini = model.startsWith('gemini');
  const rawKey = apiKey || (isGemini ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY);
  const activeKey = rawKey ? rawKey.trim() : null;

  if (!activeKey) return new Response(JSON.stringify({ error: 'API 키가 필요합니다.' }), { status: 400 });

  const companiesText = companies.map((c, i) => `${i + 1}. 회사: ${c.name} / 직무: ${c.position}`).join('\n');
  const userPrompt = `지원자: ${candidateName}, 전공: ${major}\n지원회사:\n${companiesText}\n\n이력서:\n${resumeText}`;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (isGemini) {
          // Gemini API - 가장 호환성 높은 v1 정식 버전 + 프롬프트 병합 방식
          let geminiModel = model;
          // 모델명 정규화
          if (model === 'gemini-3.1-pro-preview') geminiModel = 'gemini-3.1-pro-preview';
          else if (model === 'gemini-2.5-flash') geminiModel = 'gemini-2.5-flash';
          else if (model === 'gemini-2.5-pro') geminiModel = 'gemini-2.5-pro';
          else if (model === 'gemini-2.5-flash-lite') geminiModel = 'gemini-2.5-flash-lite';
          else geminiModel = 'gemini-2.5-flash';

          // system_instruction 대신 첫 메시지에 지침과 요청을 합침 (모든 키에서 호환됨)
          const combinedPrompt = `${SYSTEM_PROMPT}\n\n### 면접 컨설팅 요청 내용 ###\n${userPrompt}`;

          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${activeKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                role: 'user',
                parts: [{ text: combinedPrompt }]
              }],
              generationConfig: { maxOutputTokens: 65536, temperature: 0.7 }
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
            throw new Error(errJson?.error?.message || `Anthropic API 오류: ${anthropicRes.status}`);
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
