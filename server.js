const express = require('express');
const path = require('path');
const { Anthropic } = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

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

app.post('/api/generate', async (req, res) => {
  const { model = 'claude', apiKey, candidateName, education, major, resumeText, companies } = req.body;

  if (!resumeText || !companies?.length) {
    return res.status(400).json({ error: '데이터가 부족합니다.' });
  }

  const isGemini = model.startsWith('gemini');
  const activeKey = apiKey || (isGemini ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY);

  if (!activeKey || activeKey === 'your_api_key_here') {
    return res.status(400).json({ error: `${isGemini ? 'Gemini' : 'Claude'} API 키가 설정되지 않았습니다.` });
  }

  const companiesText = companies
    .map((c, i) => `${i + 1}. 회사: ${c.name} / 직무: ${c.position}`)
    .join('\n');

  const userPrompt = `지원자: ${candidateName}, 전공: ${major}\n지원회사:\n${companiesText}\n\n이력서:\n${resumeText}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    if (isGemini) {
      let geminiModel = model;
      if (model === 'gemini-3.1-pro-preview') geminiModel = 'gemini-3.1-pro-preview';
      else if (model === 'gemini-2.5-flash') geminiModel = 'gemini-2.5-flash';
      else if (model === 'gemini-2.5-pro') geminiModel = 'gemini-2.5-pro';
      else if (model === 'gemini-2.5-flash-lite') geminiModel = 'gemini-2.5-flash-lite';
      else geminiModel = 'gemini-2.5-flash';

      const combinedPrompt = `${SYSTEM_PROMPT}\n\n### 면접 컨설팅 요청 내용 ###\n${userPrompt}`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${activeKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }],
          generationConfig: { maxOutputTokens: 65536, temperature: 0.7 }
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Gemini API 오류 (${response.status})`);
      }

      const reader = response.body.getReader();
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
            if (text) {
              res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
            }
          } catch (_) { }
        }
      }
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } else {
      const client = new Anthropic({ apiKey: activeKey });
      const stream = client.messages.stream({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      });

      stream.on('text', (text) => {
        res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
      });
      stream.on('message', () => {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
      });
      stream.on('error', (err) => {
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
        res.end();
      });
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasAnthropicKey: !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_api_key_here'),
    hasGeminiKey: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_api_key_here'),
    serverApiKey: !!((process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_api_key_here') ||
      (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_api_key_here'))
  });
});

app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
