// UI pieces for jurisdiction rules, risk assessment and signer verification controls.
import { esc, icon } from './common.js';

export const SFC = () => window.SFCompliance;
const LEVEL_COLOR = { low: 'var(--ok)', medium: 'var(--warn)', high: 'var(--bad)', blocked: 'var(--bad)' };
const LEVEL_LABEL = { low: 'Low risk', medium: 'Medium risk', high: 'High risk', blocked: 'Not allowed' };
const MODEL_LABEL = { open: 'Open', tiered: 'Tiered', restrictive: 'Restrictive' };
export const riskPill = (level) => level ? `<span class="rpill" style="--c:${LEVEL_COLOR[level]}">${LEVEL_LABEL[level]}</span>` : '';

/** Risk & compliance summary for an assessment returned by SFCompliance.assess() */
export function riskPanel(a, { compact = false } = {}) {
  const C = SFC();
  const rows = a.perJurisdiction.map((j) => `<li class="jrow ${j.status}"><b>${esc(j.code)}</b><span>${esc(j.text)}</span></li>`).join('');
  return `<div class="risk ${a.level}">
    <div class="risk-top"><div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${a.score}" aria-label="Risk score"><i style="width:${a.score}%;background:${LEVEL_COLOR[a.level]}"></i></div>
      <span class="score">${a.blocked ? '—' : a.score}<small>/100</small></span>${riskPill(a.level)}</div>
    ${a.blocked ? `<div class="risk-alert">${icon('xcircle')}<div><b>Electronic signature isn't valid for this document here.</b><div class="small">${a.reasons.map(esc).join('<br>')} Use wet ink or a notary instead.</div></div></div>` : `
    <div class="kv small"><span class="muted">Minimum signature</span><span><b>${esc(a.requiredLevel)}</b> · ${esc(a.requiredLevelName)}</span>
      <span class="muted">Required checks</span><span>${a.requiredControls.map((c) => `<span class="ctl ${a.missingControls.includes(c) ? 'miss' : 'ok'}">${esc(C.CONTROLS[c].label)}</span>`).join(' ')}</span>
      <span class="muted">Keep records for</span><span>${a.retentionYears} years</span></div>
    ${a.formalities.length ? `<div class="risk-note">${icon('bell')}<div class="small">${a.formalities.map((f) => esc(f.text)).join('<br>')}</div></div>` : ''}`}
    ${compact ? '' : `<ul class="jlist">${rows}</ul>`}
  </div>`;
}

/** Editor section: jurisdictions, document type, value and verification controls. */
export function complianceEditor(box, state, onChange) {
  const C = SFC();
  const draw = () => {
    const a = C.assess({ jurisdictions: state.jurisdictions, category: state.category, value: state.value_band, controls: state.controls });
    state.assessment = a;
    box.innerHTML = `
      <h3>${icon('shield')} Compliance & security</h3>
      <div class="small muted">Governing law and signer countries</div>
      <div class="jchips">${state.jurisdictions.map((c) => `<span class="jchip">${esc(C.byCode[c]?.name || c)}<button data-rm="${c}" aria-label="Remove ${esc(c)}">${icon('x')}</button></span>`).join('') || '<span class="small muted">None selected</span>'}</div>
      <select id="cj-add" aria-label="Add a country"><option value="">Add a country or region…</option>${C.JURISDICTIONS.filter((j) => !state.jurisdictions.includes(j.code)).map((j) => `<option value="${j.code}">${esc(j.name)}</option>`).join('')}</select>
      <label class="field"><span>Document type</span><select id="cj-cat">${Object.entries(C.CATEGORIES).map(([k, v]) => `<option value="${k}" ${k === state.category ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
      <label class="field"><span>Value involved</span><select id="cj-val">${C.VALUE_BANDS.map((v) => `<option value="${v.id}" ${v.id === state.value_band ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
      <div class="small muted">Signer verification</div>
      <div class="stack" style="gap:6px">
        ${['access_code', 'otp', 'id_check', 'qes'].map((c) => { const ok = !window.SF_PLAN_FEATURES || window.SF_PLAN_FEATURES.includes(c);
          return `<label class="check small" ${ok ? '' : 'title="Not included in your plan"'}><input type="checkbox" data-ctl="${c}" ${state.controls.includes(c) ? 'checked' : ''} ${ok || state.controls.includes(c) ? '' : 'disabled'}> ${esc(C.CONTROLS[c].label)}${c === 'qes' ? ' <span class="muted">(needs a trust provider)</span>' : ''}${ok ? '' : ' <a class="chip" href="#/billing">Upgrade</a>'}</label>`; }).join('')}
        ${state.controls.includes('access_code') ? `<input type="text" id="cj-code" placeholder="${state.has_access_code ? 'Access code set — type to replace' : 'Access code to share by phone or SMS'}" value="${esc(state.access_code || '')}" autocomplete="off">` : ''}
      </div>
      ${riskPanel(a)}
      ${!a.blocked && a.missingControls.length ? `<button class="btn sm primary" id="cj-fix">${icon('shield')} Add required checks</button>` : ''}
      <p class="small muted" style="margin:0">Rules reviewed ${esc(C.RULES_REVIEWED)}. Guidance, not legal advice.</p>`;
    box.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { state.jurisdictions = state.jurisdictions.filter((x) => x !== b.dataset.rm); changed(); }));
    box.querySelector('#cj-add').onchange = (e) => { if (e.target.value) { state.jurisdictions.push(e.target.value); changed(); } };
    box.querySelector('#cj-cat').onchange = (e) => { state.category = e.target.value; changed(); };
    box.querySelector('#cj-val').onchange = (e) => { state.value_band = e.target.value; changed(); };
    box.querySelectorAll('[data-ctl]').forEach((cb) => (cb.onchange = () => { state.controls = cb.checked ? [...new Set([...state.controls, cb.dataset.ctl])] : state.controls.filter((x) => x !== cb.dataset.ctl); changed(); }));
    box.querySelector('#cj-code')?.addEventListener('input', (e) => { state.access_code = e.target.value; onChange(state, true); });
    box.querySelector('#cj-fix')?.addEventListener('click', () => { state.controls = [...new Set([...state.controls, ...a.missingControls])]; changed(); });
  };
  const changed = () => { draw(); onChange(state); };
  draw();
}

/** Country rules library with search and region filter. */
export function jurisdictionLibrary(box) {
  const C = SFC();
  const regions = ['All', ...new Set(C.JURISDICTIONS.map((j) => j.region))];
  let region = 'All', q = '';
  box.innerHTML = `<div class="row wrap" style="margin-bottom:12px"><div class="tabs" id="jl-tabs" style="margin:0;flex:1;border:0">${regions.map((r) => `<a href="javascript:void 0" data-r="${esc(r)}" class="${r === 'All' ? 'active' : ''}">${esc(r)}</a>`).join('')}</div>
    <input type="text" id="jl-q" placeholder="Search country or law" style="max-width:240px"></div><div class="jgrid" id="jl-grid"></div>`;
  const cat = (k) => C.CATEGORIES[k]?.label || k;
  const draw = () => {
    const list = C.JURISDICTIONS.filter((j) => (region === 'All' || j.region === region) && (j.name + j.law + j.code).toLowerCase().includes(q));
    box.querySelector('#jl-grid').innerHTML = list.map((j) => `<article class="card jcard">
      <div class="row"><span class="jcode">${j.code}</span><h3 style="flex:1">${esc(j.name)}</h3><span class="chip" title="Legal model">${MODEL_LABEL[j.model]}</span></div>
      <div class="small"><b>Law:</b> ${esc(j.law)}</div>
      <div class="small"><b>Privacy:</b> ${esc(j.privacy)}</div>
      <div class="small"><b>Keep records:</b> ${j.retention} years</div>
      <div class="small"><b>Not e-signable:</b> ${j.excluded.map((e) => `<span class="ctl miss">${esc(cat(e))}</span>`).join(' ')}</div>
      ${Object.keys(j.requires).length ? `<div class="small"><b>Extra requirements:</b> ${Object.entries(j.requires).map(([k, v]) => `<span class="ctl">${esc(cat(k))}: ${esc(v === 'excluded_wet_ink' ? 'wet ink' : v.replace('_', ' '))}</span>`).join(' ')}</div>` : ''}
      <p class="small muted" style="margin:4px 0 0">${esc(j.notes)}</p></article>`).join('') || '<div class="empty">No match.</div>';
  };
  box.querySelector('#jl-tabs').onclick = (e) => { const a = e.target.closest('a'); if (!a) return; region = a.dataset.r; box.querySelectorAll('#jl-tabs a').forEach((x) => x.classList.toggle('active', x === a)); draw(); };
  box.querySelector('#jl-q').oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
  draw();
}

/** Stand-alone risk calculator. */
export function riskCalculator(box) {
  const state = { jurisdictions: ['IN'], category: 'commercial', value_band: 'lt10k', controls: ['email'] };
  complianceEditor(box, state, () => {});
}
