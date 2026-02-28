/* 면접 컨설팅 보고서 생성기 — 클라이언트 JS */
let companyCount = 0;
let fullReportText = '';

document.addEventListener('DOMContentLoaded', () => {
  addCompany();
  setupFileUpload();
  document.getElementById('resumeText').addEventListener('input', updateCharCount);
  checkServerApiKey();
});

function updateCharCount() {
  document.getElementById('charCount').textContent =
    document.getElementById('resumeText').value.length.toLocaleString();
}

async function checkServerApiKey() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.serverApiKey) document.getElementById('serverKeyBadge').style.display = 'flex';
  } catch (_) {}
}

/* ─── 파일 업로드 ─── */

function setupFileUpload() {
  // PDF.js 워커 설정
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
  }
}

function handleFileDrop(event) {
  const file = event.dataTransfer.files[0];
  if (file) handleFile(file);
}

function handleFileSelect(input) {
  if (input.files[0]) handleFile(input.files[0]);
}

async function handleFile(file) {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const allowed = ['.pdf', '.docx', '.doc', '.txt'];
  if (!allowed.includes(ext)) {
    showToast('PDF, DOCX, TXT 파일만 지원합니다.', 'error');
    return;
  }

  showToast('파일 텍스트를 추출하는 중...', 'info');

  try {
    let text = '';
    if (ext === '.pdf') {
      text = await extractPDF(file);
    } else if (ext === '.docx' || ext === '.doc') {
      text = await extractDOCX(file);
    } else {
      text = await extractTXT(file);
    }

    if (!text.trim()) {
      showToast('텍스트를 추출할 수 없습니다. 직접 입력해주세요.', 'error');
      return;
    }

    document.getElementById('resumeText').value = text;
    updateCharCount();

    document.getElementById('uploadFilename').textContent = file.name;
    document.getElementById('uploadChars').textContent = `${text.length.toLocaleString()}자 추출됨`;
    document.getElementById('uploadStatus').classList.remove('hidden');
    document.getElementById('uploadZone').classList.add('hidden');

    showToast(`✅ ${text.length.toLocaleString()}자 추출 완료!`, 'success');
  } catch (err) {
    showToast(`파일 읽기 실패: ${err.message}`, 'error');
  }
}

function clearFile() {
  document.getElementById('resumeFile').value = '';
  document.getElementById('resumeText').value = '';
  document.getElementById('charCount').textContent = '0';
  document.getElementById('uploadStatus').classList.add('hidden');
  document.getElementById('uploadZone').classList.remove('hidden');
}

async function extractPDF(file) {
  if (!window.pdfjsLib) throw new Error('PDF 라이브러리를 불러오지 못했습니다.');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }
  return fullText.trim();
}

async function extractDOCX(file) {
  if (!window.mammoth) throw new Error('DOCX 라이브러리를 불러오지 못했습니다.');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
}

async function extractTXT(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('TXT 파일 읽기 실패'));
    reader.readAsText(file, 'UTF-8');
  });
}

/* ─── 회사 관리 ─── */

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

/* ─── 스텝 UI ─── */

function setStep(n) {
  ['sStep1','sStep2','sStep3'].forEach((id, i) => {
    const el = document.getElementById(id);
    el.classList.remove('active','done');
    if (i+1 < n) el.classList.add('done');
    else if (i+1 === n) el.classList.add('active');
  });
}

/* ─── 보고서 생성 ─── */

async function generateReport() {
  const apiKey        = document.getElementById('apiKey').value.trim();
  const candidateName = document.getElementById('candidateName').value.trim() || '지원자';
  const education     = document.getElementById('education').value;
  const major         = document.getElementById('major').value.trim();
  const resumeText    = document.getElementById('resumeText').value.trim();

  const companies = [];
  document.querySelectorAll('.company-entry').forEach(el => {
    const name  = el.querySelector('.co-name')?.value.trim();
    const pos   = el.querySelector('.co-pos')?.value.trim();
    const extra = el.querySelector('.co-extra')?.value.trim() || '';
    if (name && pos) companies.push({ name, position: pos, extra });
  });

  if (!resumeText)       return showToast('이력서 / 자기소개서 내용을 입력하거나 파일을 업로드해주세요.', 'error');
  if (!companies.length) return showToast('지원 회사와 희망 직무를 최소 1개 입력해주세요.', 'error');

  document.getElementById('inputSection').classList.add('hidden');
  document.getElementById('loadingSection').classList.remove('hidden');
  setStep(2);

  const lSteps  = ['ls1','ls2','ls3','ls4'];
  const lTitles = [
    'AI가 지원자 역량을 분석 중입니다...',
    '산업 트렌드와 경험을 매핑 중입니다...',
    '면접 형식별 질문을 설계 중입니다...',
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
      body: JSON.stringify({ apiKey, candidateName, education, major, resumeText, companies })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '서버 오류' }));
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
  setStep(1);
  fullReportText = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showToast(msg, type = 'success') {
  const bg = type === 'error' ? '#ef4444' : type === 'info' ? '#3b82f6' : '#10b981';
  const duration = type === 'error' ? 5000 : type === 'info' ? 2000 : 3000;
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;bottom:32px;left:50%;transform:translateX(-50%);
    background:${bg};color:white;padding:14px 24px;border-radius:12px;
    font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.2);
    z-index:9999;max-width:90vw;text-align:center;`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}
