// ─────────────────────────────────────────────
//  Vercel Edge Function — 보고서 생성 (SSE 스트리밍)
//  Edge Runtime: 스트리밍 무제한, 전 세계 엣지 서버 실행
// ─────────────────────────────────────────────
export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `당신은 LG화학, 삼성바이오로직스 등 글로벌 화학/배터리/바이오 대기업에서 15년간 R&D 및 생산기술(QC) 수석 연구원으로 근무하다 인사팀장으로 발탁된 '최고급 전문 면접 컨설턴트'입니다.
당신의 목표는 비전문가 임원 면접관과 날카로운 실무진 면접관 모두가 지원자를 완벽하게 검증할 수 있도록, 최근 3년 채용 데이터에 기반한 [3페이지 분량의 컨설팅 보고서]를 작성하는 것입니다.

## 보고서 구성 (지원 회사가 2곳 이상이면 회사별로 반복)

### Page 1: 📊 지원자 핵심 요약 및 화공/배터리 직무 적합성 분석
- **지원자 프로필 요약:** 실험/프로젝트 강점을 한 문단으로 요약
- **2026 산업 트렌드 맵핑:** 전고체 배터리, 화이트 바이오, 탄소중립 공정 등 타겟 기업의 이슈와 지원자의 경험(FACT) 연결
- **핵심 역량 매칭 (Lab to Scale-up):** 지원자의 학부/대학원 수준 경험이 현장의 대량 생산, 수율 개선, 설비 운용에 어떻게 기여할 수 있는지 논리적 브릿지 제시
- **💡 비전문가(임원)를 위한 전문 용어 해설:** 자소서에 등장하는 핵심 장비/기술 용어 3~4개를 비전문가의 눈높이에서 1줄 비유로 해설

### Page 2: 🎯 구조화된 심층 면접 질문 리스트 (STAR 검증용)
비전문가 면접관도 질문 의도를 알 수 있도록 [체크포인트]를 포함하며, 지원자의 [STAR 합격 가이드]를 함께 제시합니다.
1. **아이스브레이킹 & 인성/안전 질문 (3개)**
2. **직무/경험 FACT 심층 검증 (5개):** 각 질문에 [면접관 체크포인트]와 [STAR 합격 가이드] 포함
3. **돌발/상황 대처 질문 (2개)**

### Page 3: 📋 종합 평가표 및 합격 가이드
- **평가 기준표:** [공정/데이터 분석력], [트러블슈팅 및 스케일업 인지], [조직 적합성 및 안전 의식] 상/중/하 기준
- **🚨 Red Flag (치명적 감점 요인)**
- **최종 컨설팅 의견**

## 제약사항
1. FACT 기반 분석, 실험실 경험→양산 연결 논리 제시
2. 전문 용어는 비전공자 임원도 이해할 수 있도록 괄호로 주석
3. 표, 목록, 요약 활용한 구조화된 마크다운 출력`;

export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: '요청 파싱 실패' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { apiKey, candidateName, education, major, interviewType, resumeText, companies } = body;

  if (!resumeText || !companies?.length) {
    return new Response(JSON.stringify({ error: '이력서와 지원 회사 정보를 입력해주세요.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const anthropicKey = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey || anthropicKey === 'your_api_key_here') {
    return new Response(
      JSON.stringify({ error: 'API 키가 없습니다. 화면에서 입력하거나 Vercel 환경 변수 ANTHROPIC_API_KEY를 설정하세요.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 프롬프트 조립
  const companiesText = companies
    .map((c, i) => `${i + 1}. 지원 회사: ${c.name} / 희망 직무: ${c.position}${c.extra ? ' / 추가 정보: ' + c.extra : ''}`)
    .join('\n');

  const userPrompt = `다음 지원자의 정보를 바탕으로 면접 컨설팅 보고서를 작성해주세요.

## 지원자 기본 정보
- 이름: ${candidateName || '지원자'}
- 학력: ${education || '미입력'}
- 전공: ${major || '미입력'}
- 면접 형식: ${interviewType || '임원 면접 + 실무진 면접'}

## 지원 회사 및 직무
${companiesText}

## 이력서 / 자기소개서 원문
${resumeText}

---
${companies.length > 1
    ? `지원 회사가 ${companies.length}곳이므로 각 회사별 "# 🏢 [회사명] 면접 가이드" 헤더로 분리 작성해주세요.`
    : `"# 🏢 [${companies[0].name}] 면접 가이드" 헤더로 시작해주세요.`
  }
Page 1(📊), Page 2(🎯), Page 3(📋) 구조를 모두 포함한 완전한 보고서를 작성해주세요.`;

  const encoder = new TextEncoder();

  // ReadableStream으로 Anthropic API 스트리밍 → SSE 전달
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // raw fetch 사용 (Edge Runtime 완전 호환)
        const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-opus-4-5',
            max_tokens: 8000,
            stream: true,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }],
          }),
        });

        if (!anthropicRes.ok) {
          const errJson = await anthropicRes.json().catch(() => ({}));
          throw new Error(errJson?.error?.message || `Anthropic API 오류 (${anthropicRes.status})`);
        }

        const reader = anthropicRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // 마지막 불완전 줄 보존

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;
            try {
              const ev = JSON.parse(raw);
              if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
                const out = JSON.stringify({ type: 'text', content: ev.delta.text });
                controller.enqueue(encoder.encode(`data: ${out}\n\n`));
              }
            } catch (_) { /* 불완전 JSON 무시 */ }
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        controller.close();

      } catch (err) {
        const errOut = JSON.stringify({ type: 'error', message: err.message });
        controller.enqueue(encoder.encode(`data: ${errOut}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
