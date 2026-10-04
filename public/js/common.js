// Shared helpers for the app, signing page and verify page.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function api(url, opts = {}) {
  const o = { credentials: 'same-origin', ...opts };
  if (o.body && !(o.body instanceof FormData)) { o.headers = { 'Content-Type': 'application/json', ...(o.headers || {}) }; o.body = JSON.stringify(o.body); }
  const res = await fetch(url, o);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) { const e = new Error(data?.error || `Request failed (${res.status})`); e.status = res.status; e.upgrade = !!data?.upgrade; e.code = data?.code; if (e.upgrade) window.dispatchEvent(new CustomEvent('sf-upgrade', { detail: e.message })); if (['mfa_setup_required', 'password_change_required'].includes(data?.code)) window.dispatchEvent(new Event('sf-restricted')); throw e; }
  return data;
}

export function toast(msg, err = false) {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), err ? 5000 : 3000);
}

const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  files: '<path d="M15 2H8a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M15 2v5h5"/><path d="M4 7v13a2 2 0 0 0 2 2h10"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>',
  template: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  sign: '<path d="M3 17c3-1 4-6 6-6s1 5 3 5 3-4 5-4 2 2 4 2"/><path d="M3 21h18"/>',
  initials: '<path d="M4 20V4l6 10 6-10v16"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  text: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkbox: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  xcircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  okcircle: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
  trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0 0 22 10c0-4.4-4.5-8-10-8z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
};
export const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24">${P[name] || ''}</svg>`;

export const FIELD_TYPES = {
  signature: { label: 'Signature', icon: 'sign', w: 170, h: 42 },
  initials: { label: 'Initials', icon: 'initials', w: 70, h: 38 },
  fullname: { label: 'Full name', icon: 'user', w: 160, h: 22 },
  email: { label: 'Email', icon: 'mail', w: 180, h: 22 },
  date: { label: 'Date signed', icon: 'calendar', w: 110, h: 22 },
  company: { label: 'Company', icon: 'building', w: 160, h: 22 },
  title: { label: 'Job title', icon: 'briefcase', w: 140, h: 22 },
  text: { label: 'Text', icon: 'text', w: 160, h: 22 },
  checkbox: { label: 'Checkbox', icon: 'checkbox', w: 16, h: 16 },
};

export const STATUS_LABEL = { draft: 'Draft', in_progress: 'In progress', completed: 'Completed', declined: 'Declined', expired: 'Expired', recalled: 'Recalled', pending: 'Not sent', sent: 'Sent', viewed: 'Viewed', signed: 'Signed' };
export const badge = (s) => `<span class="badge b-${esc(s)}">${esc(STATUS_LABEL[s] || s)}</span>`;

export function fmtDate(s, withTime = true) {
  if (!s) return '—';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  return withTime ? d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
export function timeAgo(s) {
  if (!s) return '';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  const sec = (Date.now() - d) / 1000;
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return fmtDate(s, false);
}
export const initials = (n) => String(n || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();

export function modal(html, { wide = false } = {}) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}">${html}</div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  bg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  return { el: bg.querySelector('.modal'), close };
}

export function confirmBox(title, text, okLabel = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    const m = modal(`<div class="mh"><h2>${esc(title)}</h2></div><div class="mb muted">${esc(text)}</div>
      <div class="mf"><button class="btn" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" id="ok">${esc(okLabel)}</button></div>`);
    m.el.querySelector('#ok').onclick = () => { m.close(); resolve(true); };
    m.el.parentElement.addEventListener('click', (e) => { if (e.target.hasAttribute?.('data-close')) resolve(false); });
  });
}

export function applyTheme(theme) { document.documentElement.dataset.theme = theme || 'ocean'; }

/* ---------- PDF rendering via pdf.js ---------- */
let pdfjsReady;
function loadPdfjs() {
  if (!pdfjsReady) {
    pdfjsReady = import('/vendor/pdfjs/pdf.min.mjs').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
      return pdfjs;
    });
  }
  return pdfjsReady;
}

/** Render all pages of a PDF into `container`. Returns [{el, layer, num, wPt, hPt}] */
export async function renderPdf(url, container, { maxWidth = 820 } = {}) {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ url, withCredentials: true }).promise;
  container.innerHTML = '';
  const avail = Math.min(maxWidth, (container.clientWidth || maxWidth) - 32);
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const cssW = Math.max(280, avail);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = page.getViewport({ scale: (cssW / base.width) * dpr });
    const wrap = document.createElement('div');
    wrap.className = 'page';
    wrap.style.width = cssW + 'px';
    wrap.innerHTML = `<span class="pno">Page ${n} of ${pdf.numPages}</span>`;
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    const layer = document.createElement('div');
    layer.className = 'layer';
    layer.dataset.page = n;
    wrap.append(canvas, layer);
    container.appendChild(wrap);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    pages.push({ el: wrap, layer, num: n, wPt: base.width, hPt: base.height });
  }
  return pages;
}

/** Render just the first page as a thumbnail canvas. */
export async function renderThumb(url, canvas, width = 300) {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ url, withCredentials: true }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: width / base.width });
  canvas.width = vp.width; canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
}
