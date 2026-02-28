require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
//  시스템 프롬프트
// ─────────────────────────────────────────────
const SYSTEM_PROMPT = `당신은 LG화학, 삼성바이오로직스 등 글로벌 화학/배터리/바이오 대기업에서 15년간 R&D 및 생산기술(QC) 수석 연구원으로 근무하다 인사팀장으로 발탁된 '최고급 전문 면접 컨설턴트'입니다.
비전문가 임원부터 날카로운 실무진까지 모든 면접관이 활용할 수 있도록, 면접 형식별로 구분된 완전한 컨설팅 보고서를 작성합니다.

## 보고서 구성 (지원 회사가 2곳 이상이면 회사별로 반복)

### Page 1: 📊 지원자 핵심 요약 및 직무 적합성 분석
- **지원자 프로필 요약:** 실험/프로젝트 강점을 한 문단으로 요약
- **2026 산업 트렌드 맵핑:** 전고체 배터리, 화이트 바이오, 탄소중립 공정 등 타겟 기업의 이슈와 지원자 경험(FACT) 연결
- **핵심 역량 매칭 (Lab to Scale-up):** 학부/대학원 경험이 현장의 대량 생산·수율 개선·설비 운용에 기여하는 논리적 브릿지 제시
- **💡 비전문가(임원)를 위한 전문 용어 해설:** 핵심 장비/기술 용어 3~4개를 1줄 비유로 해설

### Page 2: 🎯 면접 형식별 심층 질문 리스트

#### 🏛️ 임원(비전문가) 면접
비전공자 임원도 이해할 수 있도록 쉬운 언어로 구성. 각 질문에 [질문 의도]와 [합격 포인트]를 함께 제시.
1. **인성/가치관/안전의식 질문 2개** — 연구 윤리, 협업 가치관, 안전(SHE) 의식 확인
2. **직무 경험 확인 질문 3개** — 전문 용어 최소화, 비유 활용, 성과 중심

#### 🔬 실무진(전문가) 면접
전공 FACT를 검증하는 심층 질문. 각 질문에 [면접관 체크포인트]와 [STAR 합격 가이드] 포함.
1. **전공 기술 심층 검증 5개** — 실험 원리·결과 해석·개선 경험 집중 검증
2. **돌발/상황 대처 질문 2개** — 양산 트러블, 실험 실패, 팀 갈등 등 현장 위기 대처

#### 📊 PT(발표) 면접 대비
- **발표 주제 제안 1가지** — 지원자 경험 기반, 10분 분량 구성 방향 제시
- **예상 질의응답 3개** + 각 질문별 대응 전략

#### 🗣️ 토론 면접 대비
- **토론 주제 제안 1가지** — 직무 관련 시사 이슈
- **찬반 주요 논거** 및 면접관이 주목하는 평가 포인트

### Page 3: 📋 종합 평가표 및 합격 가이드
- **평가 기준표 (마크다운 테이블):** 상/중/하 판단 근거
  - [공정/데이터 분석력]
  - [트러블슈팅 및 스케일업 인지]
  - [조직 적합성 및 안전 의식]
- **🚨 Red Flag (치명적 감점 요인):** 구체적으로 명시
- **최종 컨설팅 의견:** 면접 준비 원포인트 레슨

## 제약사항
1. 업로드된 FACT에만 기반하여 분석 (추측 금지)
2. 전문 용어는 비전공자 임원도 이해할 수 있도록 괄호로 주석
3. 표, 목록, 요약 활용한 구조화된 마크다운 출력 (표는 반드시 마크다운 테이블 형식)`;

// ─────────────────────────────────────────────
//  API 라우트: 보고서 생성 (SSE 스트리밍)
// ─────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const { model = 'claude', apiKey, candidateName, education, major, resumeText, companies } = req.body;

  if (!resumeText || !companies?.length) {
    return res.status(400).json({ error: '이력서와 지원 회사 정보를 입력해주세요.' });
  }

  const isGemini = model.startsWith('gemini');
  const activeKey = apiKey || (isGemini ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY);

  if (!activeKey || activeKey === 'your_api_key_here') {
    const modelName = isGemini ? 'Gemini' : 'Claude';
    const envName = isGemini ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
    return res.status(400).json({
      error: `API 키가 없습니다. 화면의 API 키 입력란에 ${modelName} API 키를 입력하거나, 서버 .env 파일에 ${envName}를 설정하세요.`
    });
  }

  const companiesText = companies
    .map((c, i) => `${i + 1}. 지원 회사: ${c.name} / 희망 직무: ${c.position}${c.extra ? ' / 추가 정보: ' + c.extra : ''}`)
    .join('\n');

  const userPrompt = `다음 지원자의 정보를 바탕으로 면접 컨설팅 보고서를 작성해주세요.

## 지원자 기본 정보
- 이름: ${candidateName || '지원자'}
- 학력: ${education || '미입력'}
- 전공: ${major || '미입력'}

## 지원 회사 및 직무
${companiesText}

## 이력서 / 자기소개서 원문
${resumeText}

---
${companies.length > 1
      ? `지원 회사가 ${companies.length}곳이므로 각 회사별 "# 🏢 [회사명] 면접 가이드" 헤더로 분리 작성해주세요.`
      : `"# 🏢 [${companies[0].name}] 면접 가이드" 헤더로 시작해주세요.`
    }
Page 1(📊), Page 2(🎯 면접 형식별: 임원/실무진/PT/토론), Page 3(📋) 구조를 모두 포함한 완전한 보고서를 작성해주세요.`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    if (isGemini) {
      // Gemini API (Node 18+ fetch 사용)
      const geminiModel = model === 'gemini-pro' ? 'gemini-1.5-pro' : 'gemini-1.5-flash';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${activeKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: { text: SYSTEM_PROMPT } },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            maxOutputTokens: 8000,
            temperature: 0.7,
          },
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `Gemini API 오류 (${response.status})`);
      }

      for await (const chunk of response.body) {
        const lines = chunk.toString().split('\n');
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
      // Anthropic API
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
  console.log(`✅ 면접 컨설팅 서버 실행 중: http://localhost:${PORT}`);
});
