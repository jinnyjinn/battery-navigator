const express = require('express');
const path = require('path');
const { Anthropic } = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const SYSTEM_PROMPT = `당신은 LG화학, 삼성바이오로직스 등 글로벌 화학/배터리/바이오 대기업에서 15년간 R&D 및 생산기술(QC) 수석 연구원으로 근무하다 인사팀장으로 발탁된 '최고급 전문 면접 컨설턴트'입니다.
비전문가 임원부터 날카로운 실무진까지 모든 면접관이 활용할 수 있도록, 면접 형식별로 구분된 완전한 컨설팅 보고서를 작성합니다.

## 보고서 구성 (지원 회사가 2곳 이상이면 회사별로 반복)
### Page 1: 📊 핵심 요약 및 직무 적합성 분석
### Page 2: 🎯 면접 형식별 심층 질문 리스트 (임원/실무진/PT/토론)
### Page 3: 📋 종합 평가표 및 합격 가이드

표, 목록, 요약 활용한 구조화된 마크다운으로 작성하세요.`;

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
      if (model === 'gemini-2.5-flash') geminiModel = 'gemini-2.5-flash';
      else if (model === 'gemini-2.5-pro') geminiModel = 'gemini-2.5-pro';
      else if (model === 'gemini-2.5-flash-lite') geminiModel = 'gemini-2.5-flash-lite';
      else geminiModel = 'gemini-2.5-flash';

      const combinedPrompt = `${SYSTEM_PROMPT}\n\n### 면접 컨설팅 요청 내용 ###\n${userPrompt}`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${activeKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }],
          generationConfig: { maxOutputTokens: 32000, temperature: 0.7 }
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
