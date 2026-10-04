import { api, esc, icon, toast, modal, applyTheme, renderPdf, FIELD_TYPES, fmtDate } from './common.js';

const token = location.pathname.split('/').pop();
const app = document.getElementById('app');
const today = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
let INFO;
const values = {};
const adopted = { signature: null, initials: null };

async function init() {
  try { INFO = await api(`/api/sign/${token}`); }
  catch (e) { return message('xcircle', 'red', 'Link not valid', e.message); }
  applyTheme(INFO.theme);
  document.title = `${INFO.document.title} · ${INFO.brand_name}`;
  const { document: d, recipient: r } = INFO;
  if (INFO.locked) {
    if (['expired', 'recalled', 'declined'].includes(d.status)) return message('xcircle', 'gray', 'This link is no longer active', `“${d.title}” is ${d.status}.`);
    return verifyGate();
  }

  if (d.status === 'completed') return message('okcircle', 'green', 'This document is complete', `Everyone has signed “${d.title}”. ${INFO.canDownload ? 'Download your copy with the sealed certificate of completion.' : 'Ask the sender for a copy.'}`, INFO.canDownload ? `<a class="btn primary lg" href="/api/sign/${token}/download">${icon('download')} Download signed PDF</a>` : '');
  if (r.status === 'declined' || d.status === 'declined') return message('xcircle', 'red', 'Document declined', `“${d.title}” was declined and can no longer be signed.`);
  if (d.status === 'expired') return message('clock', 'gray', 'This request has expired', `Please contact ${d.sender} (${d.sender_email}) if you still need to sign “${d.title}”.`);
  if (d.status === 'recalled') return message('x', 'gray', 'Request withdrawn', `${d.sender} has recalled “${d.title}”.`);
  if (r.status === 'signed') return message('okcircle', 'green', 'Thanks — you’re done!', `You’ve completed “${d.title}”. We’ll email you the final signed copy once everyone has signed.`);
  if (r.role === 'viewer') return message('eye', 'blue', 'You’ll receive a copy', `You were added to “${d.title}” as a viewer. We’ll email you the signed document when it’s complete.`);
  if (INFO.waitingOnOthers) return message('clock', 'amber', 'Not your turn yet', `“${d.title}” is being signed in order. We’ll email you as soon as it’s your turn.`);
  if (!INFO.canAct) return message('xcircle', 'gray', 'Nothing to sign', 'This document has no action for you right now.');
  signingUI();
}

function message(ic, color, title, text, extra = '') {
  app.innerHTML = `<div class="card center-msg"><div class="big ic ${color}">${icon(ic)}</div><h1>${esc(title)}</h1><p class="muted">${esc(text)}</p>${extra}
    <p class="small muted" style="margin-top:28px">${esc(INFO?.brand_name || '')} · Secure electronic signatures</p></div>`;
}

function signingUI() {
  const { document: d, recipient: r, fields } = INFO;
  for (const f of fields) {
    if (f.type === 'fullname') values[f.id] = r.name;
    if (f.type === 'email') values[f.id] = r.email;
    if (f.type === 'date') values[f.id] = today();
    if (f.type === 'checkbox') values[f.id] = false;
  }
  const isApprover = r.role === 'approver';
  app.innerHTML = `
  <div class="sign-top">
    <div class="brand" style="padding:0;color:var(--text)"><span class="logo">${icon('sign')}</span><span class="hide-sm">${esc(INFO.brand_name)}</span></div>
    <div style="min-width:0;flex:1"><div style="font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.title)}</div><div class="small muted" id="prog"></div></div>
    <button class="btn ghost" id="decline">Decline</button>
    <button class="btn" id="next">${icon('arrow')} Next field</button>
    <button class="btn primary" id="finish">${icon('check')} ${isApprover && !fields.length ? 'Approve' : 'Finish'}</button>
  </div>
  <div class="sign-banner"><div class="card card-b row" style="align-items:flex-start">
    <span class="avatar">${esc(d.sender.split(' ').map((x) => x[0]).join('').slice(0, 2))}</span>
    <div><div><strong>${esc(d.sender)}</strong> <span class="muted small">(${esc(d.sender_email)})</span> ${isApprover ? 'requested your approval' : 'requested your signature'}.</div>
    ${d.message ? `<div style="margin-top:6px;white-space:pre-wrap">${esc(d.message)}</div>` : ''}
    <div class="small muted" style="margin-top:6px">Hi ${esc(r.name)} — ${fields.length ? 'click the highlighted fields to fill them in, then press Finish.' : 'review the document and press Approve.'} ${d.expires_at ? `Expires ${fmtDate(d.expires_at, false)}.` : ''}</div></div>
  </div></div>
  <div class="pages" id="pages"><div class="empty">Loading document…</div></div>`;
  document.getElementById('decline').onclick = declineModal;
  document.getElementById('finish').onclick = finish;
  document.getElementById('next').onclick = nextField;
  renderPdf(`/api/sign/${token}/file`, document.getElementById('pages'), { maxWidth: 900 }).then(drawFields).catch((e) => toast('Could not load PDF: ' + e.message, true));
  updateProgress();
}

function drawFields() {
  const { recipient: r, fields, otherFields } = INFO;
  for (const f of otherFields) {
    const layer = document.querySelector(`.layer[data-page="${f.page}"]`); if (!layer) continue;
    const el = box(f, '#64748b');
    el.classList.add('ro');
    el.innerHTML = f.value.startsWith('data:image') ? `<img src="${f.value}" alt="">` : `<span class="lbl">${f.type === 'checkbox' ? (f.value === 'true' ? '✔' : '') : esc(f.value)}</span>`;
    layer.appendChild(el);
  }
  for (const f of fields) {
    const layer = document.querySelector(`.layer[data-page="${f.page}"]`); if (!layer) continue;
    const el = box(f, r.color || '#2563eb');
    el.dataset.fid = f.id;
    layer.appendChild(el);
    paint(f, el);
  }
}
function box(f, color) {
  const el = document.createElement('div');
  el.className = 'fld';
  el.style.cssText = `--c:${color};left:${f.x * 100}%;top:${f.y * 100}%;width:${f.w * 100}%;height:${f.h * 100}%`;
  return el;
}

function paint(f, el = document.querySelector(`[data-fid="${f.id}"]`)) {
  const v = values[f.id];
  el.classList.toggle('done', isFilled(f));
  const t = FIELD_TYPES[f.type];
  if (f.type === 'signature' || f.type === 'initials') {
    el.innerHTML = v ? `<img src="${v}" alt="${t.label}">` : `<span class="lbl">${icon(t.icon)}${f.type === 'signature' ? 'Click to sign' : 'Initials'}</span>${f.required ? '<span class="req">*</span>' : ''}`;
    el.onclick = () => openSignatureModal(f);
  } else if (f.type === 'checkbox') {
    if (!el.querySelector('input')) {
      el.innerHTML = `<input type="checkbox" class="cb" title="${esc(f.label || 'Checkbox')}">`;
      el.querySelector('input').onchange = (e) => { values[f.id] = e.target.checked; el.classList.toggle('done', isFilled(f)); updateProgress(); };
    }
  } else if (f.type === 'date') {
    el.innerHTML = `<span class="lbl" style="color:#0b1a3b;font-weight:500">${esc(v)}</span>`;
    el.title = 'Filled in automatically when you finish';
  } else if (!el.querySelector('input')) {
    el.innerHTML = `<input class="fin" type="text" placeholder="${esc(f.label || t.label)}${f.required ? ' *' : ''}" value="${esc(v || '')}">`;
    el.querySelector('input').oninput = (e) => { values[f.id] = e.target.value; el.classList.toggle('done', isFilled(f)); updateProgress(); };
  }
  updateProgress();
}

const isFilled = (f) => f.type === 'checkbox' ? values[f.id] === true : !!String(values[f.id] || '').trim();
const requiredOpen = () => INFO.fields.filter((f) => f.required && !isFilled(f));

function updateProgress() {
  const req = INFO.fields.filter((f) => f.required);
  const done = req.filter(isFilled).length;
  const p = document.getElementById('prog');
  if (p) p.textContent = req.length ? `${done} of ${req.length} required fields completed` : 'Review the document';
}

function nextField() {
  const open = requiredOpen();
  const f = open[0] || INFO.fields.find((x) => !isFilled(x));
  if (!f) { toast('All fields are complete — press Finish'); return; }
  const el = document.querySelector(`[data-fid="${f.id}"]`);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('focus'); void el.offsetWidth; el.classList.add('focus');
  setTimeout(() => el.querySelector('input')?.focus(), 400);
}

// ---------------------------------------------------------------- signature modal
const FONTS = ['Dancing Script', 'Great Vibes', 'Caveat', 'Homemade Apple'];

function openSignatureModal(f) {
  const kind = f.type;
  if (adopted[kind] && !values[f.id]) { values[f.id] = adopted[kind]; paint(f); return; }
  const r = INFO.recipient;
  const defaultText = kind === 'initials' ? r.name.split(/\s+/).map((x) => x[0]).join('').toUpperCase() : r.name;
  const m = modal(`
    <div class="mh"><h2>${kind === 'initials' ? 'Add your initials' : 'Add your signature'}</h2><span class="spacer"></span><button class="btn ghost sm" data-close>${icon('x')}</button></div>
    <div class="mb">
      <div class="sig-tabs"><button class="btn sm on" data-t="type">Type</button><button class="btn sm" data-t="draw">Draw</button><button class="btn sm" data-t="upload">Upload</button></div>
      <div data-p="type"><input type="text" id="ty" value="${esc(defaultText)}"><div class="font-opts">${FONTS.map((fn, i) => `<button class="${i ? '' : 'on'}" data-f="${fn}" style="font-family:'${fn}',cursive">${esc(defaultText)}</button>`).join('')}</div></div>
      <div data-p="draw" class="hidden"><canvas class="sig-pad" id="pad"></canvas><div class="row" style="margin-top:8px"><span class="small muted">Draw with your mouse or finger</span><span class="spacer"></span>
        <button class="btn sm ghost" data-ink="#0b1a3b" style="color:#0b1a3b">● Black</button><button class="btn sm ghost" data-ink="#1d4ed8" style="color:#1d4ed8">● Blue</button><button class="btn sm" id="clr">Clear</button></div></div>
      <div data-p="upload" class="hidden"><label class="dropzone">${icon('upload')}<div>Upload an image of your ${kind}</div><input type="file" accept="image/*" hidden id="upf"></label><img id="upv" style="max-width:100%;max-height:140px;display:none;margin:10px auto 0"></div>
      <p class="small muted" style="margin:14px 0 0">By clicking Adopt, I agree this mark is the electronic representation of my ${kind}.</p>
    </div>
    <div class="mf">${values[f.id] ? '<button class="btn danger" id="clear-f">Remove</button><span class="spacer"></span>' : ''}<button class="btn" data-close>Cancel</button><button class="btn primary" id="adopt">Adopt & ${kind === 'initials' ? 'initial' : 'sign'}</button></div>`);
  const $ = (s) => m.el.querySelector(s);
  let tab = 'type', font = FONTS[0], ink = '#0b1a3b', uploaded = null, drawn = false;

  m.el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => {
    tab = b.dataset.t;
    m.el.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b));
    m.el.querySelectorAll('[data-p]').forEach((p) => p.classList.toggle('hidden', p.dataset.p !== tab));
    if (tab === 'draw') setupPad();
  }));
  $('#ty').oninput = (e) => m.el.querySelectorAll('[data-f]').forEach((b) => (b.textContent = e.target.value));
  m.el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { font = b.dataset.f; m.el.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === b)); }));

  const pad = $('#pad'); let ctx, padReady = false;
  function setupPad() {
    if (padReady) return; padReady = true;
    const dpr = window.devicePixelRatio || 1;
    pad.width = pad.clientWidth * dpr; pad.height = pad.clientHeight * dpr;
    ctx = pad.getContext('2d'); ctx.scale(dpr, dpr);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.6;
    let down = false, last = null;
    const pt = (e) => { const r = pad.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    pad.onpointerdown = (e) => { down = true; last = pt(e); pad.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.arc(last.x, last.y, 1.2, 0, Math.PI * 2); ctx.fillStyle = ink; ctx.fill(); drawn = true; };
    pad.onpointermove = (e) => {
      if (!down) return;
      const p = pt(e);
      ctx.strokeStyle = ink; ctx.beginPath(); ctx.moveTo(last.x, last.y);
      ctx.quadraticCurveTo(last.x, last.y, (last.x + p.x) / 2, (last.y + p.y) / 2); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; drawn = true;
    };
    pad.onpointerup = pad.onpointercancel = () => (down = false);
  }
  $('#clr').onclick = () => { ctx?.clearRect(0, 0, pad.width, pad.height); drawn = false; };
  m.el.querySelectorAll('[data-ink]').forEach((b) => (b.onclick = () => (ink = b.dataset.ink)));
  $('#upf').onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => { const img = new Image(); img.onload = () => { uploaded = img; $('#upv').src = rd.result; $('#upv').style.display = 'block'; }; img.src = rd.result; };
    rd.readAsDataURL(file);
  };
  $('#clear-f')?.addEventListener('click', () => { values[f.id] = ''; paint(f); m.close(); });

  $('#adopt').onclick = async () => {
    let data;
    if (tab === 'type') {
      const txt = $('#ty').value.trim(); if (!txt) return toast('Type your name', true);
      await document.fonts.load(`80px "${font}"`).catch(() => {});
      const c = document.createElement('canvas'); const x = c.getContext('2d');
      x.font = `80px "${font}", cursive`;
      c.width = Math.ceil(x.measureText(txt).width + 60); c.height = 160;
      x.font = `80px "${font}", cursive`; x.fillStyle = '#0b1a3b'; x.textBaseline = 'middle'; x.fillText(txt, 30, 85);
      data = trim(c);
    } else if (tab === 'draw') {
      if (!drawn) return toast('Draw your signature first', true);
      data = trim(pad);
    } else {
      if (!uploaded) return toast('Choose an image first', true);
      const c = document.createElement('canvas'); const s = Math.min(1, 800 / uploaded.width);
      c.width = uploaded.width * s; c.height = uploaded.height * s;
      c.getContext('2d').drawImage(uploaded, 0, 0, c.width, c.height);
      data = c.toDataURL('image/png');
    }
    adopted[kind] = data;
    // apply to every empty field of the same kind
    for (const g of INFO.fields) if (g.type === kind && (g.id === f.id || !values[g.id])) { values[g.id] = data; paint(g); }
    m.close();
  };
}

function trim(canvas) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < x0) return canvas.toDataURL('image/png');
  const pad = 6, out = document.createElement('canvas');
  out.width = x1 - x0 + pad * 2; out.height = y1 - y0 + pad * 2;
  out.getContext('2d').drawImage(canvas, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

// ---------------------------------------------------------------- finish / decline
function finish() {
  const open = requiredOpen();
  if (open.length) { toast(`Please complete ${open.length} more required field${open.length > 1 ? 's' : ''}`, true); return nextField(); }
  const isApprover = INFO.recipient.role === 'approver';
  const m = modal(`<div class="mh"><h2>${isApprover ? 'Approve document' : 'Finish signing'}</h2></div><div class="mb stack">
    <p style="margin:0">You're about to ${isApprover ? 'approve' : 'sign'} <strong>${esc(INFO.document.title)}</strong>.</p>
    <label class="check" style="align-items:flex-start"><input type="checkbox" id="cs" style="margin-top:3px"> <span class="small">I agree to do business electronically and that my electronic signature is the legal equivalent of my handwritten signature on this document.</span></label></div>
    <div class="mf"><button class="btn" data-close>Back</button><button class="btn primary" id="go" disabled>${isApprover ? 'Approve' : 'Sign document'}</button></div>`);
  m.el.querySelector('#cs').onchange = (e) => (m.el.querySelector('#go').disabled = !e.target.checked);
  m.el.querySelector('#go').onclick = async () => {
    m.el.querySelector('#go').disabled = true;
    try {
      const r = await api(`/api/sign/${token}/submit`, { method: 'POST', body: { values, consent: true } });
      m.close();
      if (r.completed) message('okcircle', 'green', 'All done — document completed!', `You were the last to sign “${INFO.document.title}”. Everyone will receive the signed copy by email.`, `<a class="btn primary lg" href="/api/sign/${token}/download">${icon('download')} Download signed PDF</a>`);
      else message('okcircle', 'green', 'Thanks — you’re done!', `Your ${isApprover ? 'approval' : 'signature'} has been recorded. We’ll email you the final copy once everyone has signed.`);
      window.scrollTo(0, 0);
    } catch (e) { toast(e.message, true); m.el.querySelector('#go').disabled = false; }
  };
}

function declineModal() {
  const m = modal(`<div class="mh"><h2>Decline to sign</h2></div><div class="mb stack">
    <p class="muted" style="margin:0">${esc(INFO.document.sender)} will be notified and the document will be voided for all recipients.</p>
    <label class="field"><span>Reason</span><textarea id="rs" placeholder="Let the sender know why"></textarea></label></div>
    <div class="mf"><button class="btn" data-close>Cancel</button><button class="btn danger" id="go">Decline</button></div>`);
  m.el.querySelector('#go').onclick = async () => {
    const reason = m.el.querySelector('#rs').value.trim();
    if (!reason) return toast('Please enter a reason', true);
    try { await api(`/api/sign/${token}/decline`, { method: 'POST', body: { reason } }); m.close(); message('xcircle', 'red', 'You declined this document', 'The sender has been notified.'); }
    catch (e) { toast(e.message, true); }
  };
}

// ---------------------------------------------------------------- identity verification gate
const STEP_LABEL = { access_code: 'Access code', otp: 'Email code', id_check: 'ID check' };
function verifyGate() {
  const v = INFO.verification;
  const step = v.required.find((s) => !v.done.includes(s));
  const d = INFO.document;
  app.innerHTML = `<div class="card center-msg gate" style="text-align:left">
    <div class="row" style="gap:10px"><span class="logo-sq">${icon('shield')}</span><div><div class="small muted">${esc(INFO.brand_name)} · secure signing</div><h2 style="margin:0">Confirm it's you</h2></div></div>
    <p class="muted">${esc(d.sender)} (${esc(d.sender_email)}) sent you <b>${esc(d.title)}</b>. For your protection, verify your identity before the document opens.</p>
    <ol class="steps">${v.required.map((s) => `<li class="${v.done.includes(s) ? 'done' : s === step ? 'now' : ''}">${v.done.includes(s) ? icon('check') : ''}${STEP_LABEL[s]}</li>`).join('')}</ol>
    <form id="gf" class="stack" autocomplete="off"></form>
    <p class="small muted" style="margin-top:16px">Every attempt is recorded in the document's audit trail.</p></div>`;
  const f = app.querySelector('#gf');
  const done = async () => { INFO = await api(`/api/sign/${token}`); INFO.locked ? verifyGate() : init(); };
  const busy = (b) => f.querySelectorAll('button').forEach((x) => (x.disabled = b));
  if (step === 'access_code') {
    f.innerHTML = `<label class="field"><span>Access code</span><input type="text" id="code" required autofocus placeholder="The code the sender gave you"></label><p class="small muted" style="margin:0">The sender shares this separately, by phone or text message.</p><button class="btn primary lg">Continue</button>`;
    f.onsubmit = async (e) => { e.preventDefault(); busy(true); try { await api(`/api/sign/${token}/verify/access-code`, { method: 'POST', body: { code: f.querySelector('#code').value } }); await done(); } catch (err) { toast(err.message, true); busy(false); } };
  } else if (step === 'otp') {
    f.innerHTML = `<p style="margin:0">We'll email a 6-digit code to <b>${esc(INFO.recipient.email)}</b>.</p><button type="button" class="btn" id="send">${icon('mail')} Email me a code</button>
      <label class="field hidden" id="cw"><span>6-digit code</span><input type="text" id="code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" placeholder="123456"></label><button class="btn primary lg hidden" id="ok">Verify</button>`;
    f.querySelector('#send').onclick = async () => {
      try { const r = await api(`/api/sign/${token}/verify/otp/send`, { method: 'POST' }); toast(`Code sent to ${r.sentTo}`); f.querySelector('#cw').classList.remove('hidden'); f.querySelector('#ok').classList.remove('hidden'); f.querySelector('#send').textContent = 'Send a new code'; f.querySelector('#code').focus(); }
      catch (err) { toast(err.message, true); }
    };
    f.onsubmit = async (e) => { e.preventDefault(); busy(true); try { await api(`/api/sign/${token}/verify/otp`, { method: 'POST', body: { code: f.querySelector('#code').value } }); await done(); } catch (err) { toast(err.message, true); busy(false); } };
  } else if (step === 'id_check') {
    f.innerHTML = `<label class="field"><span>Full name as on your ID</span><input type="text" id="nm" required></label>
      <label class="field"><span>Document</span><select id="tp"><option>Passport</option><option>National ID / Aadhaar</option><option>Driving licence</option><option>PAN card</option><option>Residence permit</option></select></label>
      <label class="field"><span>Last 4 characters of the document number</span><input type="text" id="l4" maxlength="4" required></label>
      <p class="small muted" style="margin:0">Your server administrator chooses the identity provider. Only the result and a reference are stored.</p><button class="btn primary lg">Verify identity</button>`;
    f.onsubmit = async (e) => { e.preventDefault(); busy(true);
      try { await api(`/api/sign/${token}/verify/id`, { method: 'POST', body: { full_name: f.querySelector('#nm').value, id_type: f.querySelector('#tp').value, id_last4: f.querySelector('#l4').value } }); await done(); }
      catch (err) { toast(err.message, true); busy(false); } };
  }
}

init();
