import { api, esc, icon, applyTheme, fmtDate } from './common.js';
const cfg = await api('/api/public-config');
applyTheme(cfg.theme);
document.getElementById('bn').textContent = cfg.brand_name;
document.getElementById('logo').innerHTML = icon('sign');
document.getElementById('dzi').innerHTML = icon('shield');
const out = document.getElementById('out'), dz = document.getElementById('dz');
async function check(file) {
  if (!file) return;
  out.innerHTML = '<p class="muted">Checking…</p>';
  const fd = new FormData(); fd.append('file', file);
  try {
    const r = await api('/api/verify', { method: 'POST', body: fd });
    out.innerHTML = r.valid
      ? `<div class="card card-b" style="border-color:#16a34a"><div class="row" style="color:#15803d;font-weight:700">${icon('okcircle')} Authentic and unaltered</div>
         <div class="stack small" style="margin-top:10px"><div><span class="muted">Document:</span> ${esc(r.title)} (#${esc(r.uid)})</div><div><span class="muted">Completed:</span> ${fmtDate(r.completed_at)}</div>
         <div><span class="muted">Signed by:</span><br>${r.signers.map((s) => `${esc(s.name)} (${esc(s.email)}) — ${fmtDate(s.signed_at)}`).join('<br>')}</div>
         <div><span class="muted">Audit trail:</span> ${r.auditChainValid ? 'intact' : '<b style="color:#b91c1c">broken — contact the sender</b>'}</div>
         ${r.seal ? `<div><span class="muted">Sealed by:</span> ${esc(r.seal.subject)}${r.seal.selfSigned ? ' (self-signed certificate)' : ''}</div>` : ''}
         <div class="mono muted">SHA-256 ${esc(r.hash)}</div></div></div>`
      : `<div class="card card-b" style="border-color:#dc2626"><div class="row" style="color:#b91c1c;font-weight:700">${icon('xcircle')} Not recognised</div>
         <p class="small muted">This file doesn't match any completed document on this server. It may have been modified after signing, or signed elsewhere.</p><div class="mono muted">SHA-256 ${esc(r.hash)}</div></div>`;
  } catch (e) { out.innerHTML = `<p style="color:#b91c1c">${esc(e.message)}</p>`; }
}
document.getElementById('fi').onchange = (e) => check(e.target.files[0]);
dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
dz.ondragleave = () => dz.classList.remove('over');
dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); check(e.dataTransfer.files[0]); };
