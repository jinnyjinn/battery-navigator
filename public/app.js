/* 면접 컨설팅 보고서 생성기 — 클라이언트 JS */
let companyCount = 0;
let fullReportText = '';

document.addEventListener('DOMContentLoaded', () => {
  addCompany();
  document.getElementById('resumeText').addEventListener('input', () => {
    document.getElementById('charCount').textContent =
      document.getElementById('resumeText').value.length.toLocaleString();
  });
  checkServerApiKey();
});

async function checkServerApiKey() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.serverApiKey) document.getElementById('serverKeyBadge').style.display = 'flex';
  } catch (_) {}
}

function addCompany() {
  companyCount++;
  const idx = companyCount;
  const div = document.createElement('div');
  div.className = 'company-entry';
  div.id = `company-${idx}`;
  div.innerHTML = `
    <div class="company-entry-header">
      <div class="company-label">
        <span class="company-num">${idx}</span>지원 회사 ${idx}
      </div>
      ${idx > 1 ? `<button class="btn btn-danger-outline" onclick="removeCompany('company-${idx}')">✕ 삭제</button>` : ''}
    </div>
    <div class="company-grid">
      <div class="form-row">
        <label class="form-label">회사명 <span class="required">*</span></label>
        <input type="text" class="co-name" placeholder="예: LG에너지솔루션, 삼성바이오로직스" />
      </div>
      <div class="form-row">
        <label class="form-label">희망 직무 <span class="required">*</span></label>
        <input type="text" class="co-pos" placeholder="예: 배터리 소재 연구, GMP 품질관리" />
      </div>
    </div>
    <div class="form-row" style="margin-bottom:0">
      <label class="form-label">추가 정보 <span style="font-weight:400;color:var(--text-muted)">(선택)</span></label>
      <input type="text" class="co-extra" placeholder="예: 인턴 경험, 해당 직무 특이사항 등" />
    </div>`;
  document.getElementById('companiesContainer').appendChild(div);
}

function removeCompany(id) {
  document.getElementById(id)?.remove();
  document.querySelectorAll('.company-entry').forEach((el, i) => {
    el.querySelector('.company-label').innerHTML =
      `<span class="company-num">${i+1}</span>지원 회사 ${i+1}`;
  });
}

function toggleApiKey() {
  const inp = document.getElementById('apiKey');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function setStep(n) {
  ['sStep1','sStep2','sStep3'].forEach((id, i) => {
    const el = document.getElementById(id);
    el.classList.remove('active','done');
    if (i+1 < n) el.classList.add('done');
    else if (i+1 === n) el.classList.add('active');
  });
}

async function generateReport() {
  const apiKey       = document.getElementById('apiKey').value.trim();
  const candidateName = document.getElementById('candidateName').value.trim() || '지원자';
  const education    = document.getElementById('education').value;
  const major        = document.getElementById('major').value.trim();
  const interviewType = document.getElementById('interviewType').value;
  const resumeText   = document.getElementById('resumeText').value.trim();

  const companies = [];
  document.querySelectorAll('.company-entry').forEach(el => {
    const name  = el.querySelector('.co-name')?.value.trim();
    const pos   = el.querySelector('.co-pos')?.value.trim();
    const extra = el.querySelector('.co-extra')?.value.trim() || '';
    if (name && pos) companies.push({ name, position: pos, extra });
  });

  if (!resumeText)       return showToast('이력서 / 자기소개서 내용을 입력해주세요.', 'error');
  if (!companies.length) return showToast('지원 회사와 희망 직무를 최소 1개 입력해주세요.', 'error');

  document.getElementById('inputSection').classList.add('hidden');
  document.getElementById('loadingSection').classList.remove('hidden');
  setStep(2);

  const lSteps  = ['ls1','ls2','ls3','ls4'];
  const lTitles = [
    'AI가 지원자 역량을 분석 중입니다...',
    '산업 트렌드와 경험을 매핑 중입니다...',
    '심층 면접 질문을 설계 중입니다...',
    '종합 평가 기준을 수립 중입니다...',
  ];
  document.getElementById(lSteps[0]).classList.add('active');
  document.getElementById('loadingTitle').textContent = lTitles[0];
  let lIdx = 1;
  const lInterval = setInterval(() => {
    document.getElementById(lSteps[lIdx-1]).classList.replace('active','done');
    if (lIdx < lSteps.length) {
      document.getElementById(lSteps[lIdx]).classList.add('active');
      document.getElementById('loadingTitle').textContent = lTitles[lIdx];
    }
    lIdx = Math.min(lIdx+1, lSteps.length);
  }, 8000);

  fullReportText = '';
  const streamEl = document.getElementById('streamingText');
  streamEl.textContent = '';

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, candidateName, education, major, interviewType, resumeText, companies })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '서버 오류');
    }

    const reader  = res.body.getReader();
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
        let ev;
        try { ev = JSON.parse(line.slice(6)); } catch (_) { continue; }
        if (ev.type === 'text') {
          fullReportText += ev.content;
          streamEl.textContent = '...' + fullReportText.slice(-400);
          streamEl.parentElement.scrollTop = streamEl.parentElement.scrollHeight;
        } else if (ev.type === 'error') {
          throw new Error(ev.message);
        }
      }
    }

    clearInterval(lInterval);
    lSteps.forEach(id => {
      document.getElementById(id).classList.remove('active');
      document.getElementById(id).classList.add('done');
    });
    renderReport(fullReportText, candidateName, companies);

  } catch (err) {
    clearInterval(lInterval);
    document.getElementById('loadingSection').classList.add('hidden');
    document.getElementById('inputSection').classList.remove('hidden');
    setStep(1);
    showToast(`오류: ${err.message}`, 'error');
  }
}

function renderReport(md, candidateName, companies) {
  marked.setOptions({ breaks: true, gfm: true });
  document.getElementById('reportBody').innerHTML = marked.parse(md);

  const today = new Date();
  const ds = `${today.getFullYear()}년 ${today.getMonth()+1}월 ${today.getDate()}일`;
  document.getElementById('reportMeta').innerHTML =
    `<strong>${candidateName}</strong> | ${companies.map(c=>`${c.name}(${c.position})`).join(' · ')} | ${ds}`;

  document.getElementById('loadingSection').classList.add('hidden');
  document.getElementById('reportSection').classList.remove('hidden');
  setStep(3);
  document.getElementById('reportSection').scrollIntoView({ behavior: 'smooth' });
}

async function copyReport() {
  try {
    await navigator.clipboard.writeText(fullReportText);
    showToast('📋 보고서가 클립보드에 복사되었습니다!', 'success');
  } catch {
    showToast('복사 실패 — 직접 선택 후 복사해주세요.', 'error');
  }
}

function resetAll() {
  document.getElementById('reportSection').classList.add('hidden');
  document.getElementById('loadingSection').classList.add('hidden');
  document.getElementById('inputSection').classList.remove('hidden');
  setStep(1); fullReportText = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showToast(msg, type='success') {
  const bg = type === 'error' ? '#ef4444' : '#10b981';
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;bottom:32px;left:50%;transform:translateX(-50%);
    background:${bg};color:white;padding:14px 24px;border-radius:12px;
    font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.2);
    z-index:9999;max-width:90vw;text-align:center;`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 5000 : 3000);
}
