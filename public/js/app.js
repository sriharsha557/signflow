import { api, esc, icon, toast, badge, fmtDate, timeAgo, initials, modal, confirmBox, applyTheme, renderPdf, renderThumb, FIELD_TYPES, STATUS_LABEL } from './common.js';
import { openEditor } from './editor.js';
import { billingPage, teamPage, platformPage, upgradeModal, statusBadge } from './saas.js';
import { accessPage, accountSecurity, hasPerm } from './access-ui.js';
let RESTRICTED = null;
window.addEventListener('sf-restricted', () => { ME = null; ORG = null; route(); });
let ORG = null;
window.addEventListener('sf-upgrade', (e) => upgradeModal(e.detail));
import { riskPanel, riskPill, jurisdictionLibrary, riskCalculator, SFC } from './compliance-ui.js';

const app = document.getElementById('app');
let ME = null;
let CONFIG = null;

const THEMES = {
  ocean: { name: 'Ocean' },
  emerald: { name: 'Emerald' },
  sunset: { name: 'Sunset' },
  royal: { name: 'Royal' },
  rose: { name: 'Rose' },
  graphite: { name: 'Graphite' },
  midnight: { name: 'Midnight (dark)' },
};

/**
 * Read a theme's swatch colours from CSS rather than duplicating them here.
 * Renders a detached probe element carrying the theme attribute and asks the
 * browser for the resolved custom properties, so public/css is the only
 * place a palette is ever defined.
 */
function themeSwatch(key) {
  const probe = document.createElement('div');
  probe.dataset.theme = key;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const read = (name) => cs.getPropertyValue(name).trim();
  const swatch = {
    sb: read('--sidebar'),
    bg: read('--bg'),
    p: read('--primary'),
    t: read('--sidebar-text'),
    text: read('--text'),
    border: read('--border'),
  };
  probe.remove();
  return swatch;
}

const go = (h) => { location.hash = h; };

// ======================================================= router
async function route() {
  window.__pageCleanup?.(); window.__pageCleanup = null;
  const h = location.hash.replace(/^#/, '') || '/';
  const parts = h.split('?')[0].split('/').filter(Boolean);

  if (!CONFIG) { CONFIG = await api('/api/public-config'); applyTheme(CONFIG.theme); document.title = CONFIG.brand_name; }
  if (parts[0] === 'login' || parts[0] === 'register') return authPage(parts[0]);
  if (parts[0] === 'invite' && parts[1]) return invitePage(parts[1]);
  if (!ME || !ORG) {
    try { const r = await api('/api/auth/me'); ME = r.user; ORG = r.org; RESTRICTED = r.restricted; window.SF_PLAN_FEATURES = ORG?.plan.features || []; } catch { return go(CONFIG.first_run ? '#/register' : '#/login'); }
  }

  if (RESTRICTED) {
    app.innerHTML = `<div style="max-width:760px;margin:6vh auto;padding:0 16px"><div class="row" style="margin-bottom:16px"><div class="brand" style="padding:0;color:var(--text)"><span class="logo">${icon('sign')}</span>${esc(CONFIG.brand_name)}</div><span class="spacer"></span><button class="btn ghost" id="lo">${icon('logout')} Sign out</button></div><div id="fs"></div></div>`;
    document.getElementById('lo').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); ME = null; ORG = null; RESTRICTED = null; go('#/login'); };
    return accountSecurity(document.getElementById('fs'), { forced: RESTRICTED });
  }
  try {
    if (parts[0] === 'documents' && parts[1] && parts[2] === 'edit') return await openEditor(app, { mode: 'document', id: parts[1], navigate: go });
    if (parts[0] === 'templates' && parts[1] && parts[2] === 'edit') return await openEditor(app, { mode: 'template', id: parts[1], navigate: go });

    const main = shell(parts[0] || 'dashboard');
    if (!parts[0] || parts[0] === 'dashboard') return await dashboard(main);
    if (parts[0] === 'documents' && parts[1] === 's') return await documentsPage(main, parts[2]);
    if (parts[0] === 'documents' && parts[1]) return await documentDetail(main, parts[1]);
    if (parts[0] === 'documents') return await documentsPage(main, 'all');
    if (parts[0] === 'templates') return await templatesPage(main);
    if (parts[0] === 'settings') return await settingsPage(main, parts[1] || 'profile');
    if (parts[0] === 'compliance') return compliancePage(main, parts[1] || 'rules');
    if (parts[0] === 'billing') return await billingPage(main, ME);
    if (parts[0] === 'team' || parts[0] === 'access') return await accessPage(main, ME, parts[1] || 'users');
    if (parts[0] === 'platform' && ME.is_admin) return await platformPage(main, parts[1] || 'overview');
    main.innerHTML = '<div class="empty">Page not found</div>';
  } catch (e) {
    if (e.status === 401) { ME = null; return go('#/login'); }
    if (['mfa_setup_required', 'password_change_required'].includes(e.code)) return;
    toast(e.message, true);
    console.error(e);
  }
}
window.addEventListener('hashchange', () => {
  if (window.__isDirty?.() && !confirm('You have unsaved changes. Leave anyway?')) return;
  window.__isDirty = null;
  route();
});

// ======================================================= shell
function shell(active) {
  const nav = [
    ['dashboard', 'Dashboard', 'dashboard', '#/'],
    ['documents', 'Documents', 'files', '#/documents'],
    ['templates', 'Templates', 'template', '#/templates'],
    ...(hasPerm(ME, 'compliance.view') ? [['compliance', 'Compliance', 'shield', '#/compliance']] : []),
    ...(hasPerm(ME, 'team.view') ? [['access', 'Users & access', 'users', '#/access']] : []),
    ...(hasPerm(ME, 'billing.view') ? [['billing', 'Plan & billing', 'inbox', '#/billing']] : []),
    ...(ME.is_admin ? [['platform', 'Platform', 'dashboard', '#/platform']] : []),
  ];
  const trial = ORG && ORG.status === 'trialing' && !ORG.comped;
  const lapsed = ORG && ['expired', 'trial_expired', 'past_due', 'suspended'].includes(ORG.status);
  app.innerHTML = `
  <div class="mobile-bar"><button class="btn ghost sm" id="menu">${icon('menu')}</button><strong>${esc(CONFIG.brand_name)}</strong></div>
  <div class="shell">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><span class="logo">${icon('sign')}</span>${esc(CONFIG.brand_name)}</div>
      ${ORG ? `<a href="#/billing" class="plan-pill"><span>${esc(ORG.name)}</span><b>${esc(ORG.plan.name)}</b></a>` : ''}
      ${hasPerm(ME, 'documents.send') ? `<button class="btn primary new-btn" id="new-doc">${icon('plus')} New document</button>` : `<div class="plan-pill" style="justify-content:center">${esc(ME.role.name)} · read-only</div>`}
      <nav class="nav">
        ${nav.map(([k, l, ic, href]) => `<a href="${href}" class="${active === k ? 'active' : ''}">${icon(ic)}${l}</a>`).join('')}
        <div class="sep"></div>
        <a href="#/settings" class="${active === 'settings' ? 'active' : ''}">${icon('settings')}Settings</a>
        <a href="/verify" target="_blank">${icon('shield')}Verify a document</a>
      </nav>
      <div class="user">
        <span class="avatar">${esc(initials(ME.name))}</span>
        <div class="meta"><div style="font-weight:650">${esc(ME.name)}</div><div class="small" style="opacity:.7">${esc(ME.email)}</div></div>
        <button class="btn ghost sm" id="logout" title="Sign out" style="color:inherit">${icon('logout')}</button>
      </div>
    </aside>
    <div class="main">${trial ? `<div class="banner">${icon('clock')} ${ORG.trialDaysLeft} day(s) left in your ${esc(ORG.plan.name)} trial. <a href="#/billing">Choose a plan</a></div>` : ''}
      ${lapsed ? `<div class="banner bad">${icon('bell')} ${ORG.status === 'past_due' ? 'Your payment is due. Renew to avoid losing paid features.' : ORG.status === 'suspended' ? 'This workspace is suspended. Contact support.' : 'Your paid plan has ended; you are on the Free plan.'} <a href="#/billing">Renew now</a></div>` : ''}
      <div id="main"></div></div>
  </div>`;
  document.getElementById('new-doc')?.addEventListener('click', newDocumentModal);
  document.getElementById('logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); ME = null; ORG = null; go('#/login'); };
  document.getElementById('menu').onclick = () => document.getElementById('sidebar').classList.toggle('open');
  return document.getElementById('main');
}

// ======================================================= auth
const AUTH_FEATURES = [
  ['template', '19 ready-made documents', 'Offer, appraisal and relieving letters, NDAs, agreements, consent forms.'],
  ['pen', 'Sign on any phone', 'No account or app for signers. Type, draw or upload a signature.'],
  ['shield', 'Sealed PDF + certificate', 'Tamper-evident seal and an audit trail nobody can edit.'],
  ['globe', 'Compliance for 30 countries', 'Signature level, identity checks and formalities set automatically.'],
  ['user', 'Signer verification', 'Access codes, email one-time codes and ID checks.'],
  ['users', 'Team roles & 2FA', 'Six roles, custom roles, IP allowlist and activity log.'],
  ['save', 'Pay in INR or USD', 'UPI, cards and net banking, with GST invoices.'],
];
const planParam = () => { const m = location.hash.match(/[?&]plan=([\w-]+)/); return m ? m[1].replace(/^\w/, (c) => c.toUpperCase()) : ''; };
function authPage(kind) {
  const reg = kind === 'register';
  if (reg && !CONFIG.allow_signup) return go('#/login');
  app.innerHTML = `
  <div class="auth-wrap">
    <div class="auth-art">
      <a class="brand" href="/" style="color:var(--surface);padding:0"><span class="logo" style="background:rgba(255,255,255,.2)">${icon('sign')}</span>${esc(CONFIG.brand_name)}</a>
      <div>
        <h1>${reg ? 'Everything you need to get documents signed, the right way.' : 'Welcome back. Your documents are waiting.'}</h1>
        <ul class="auth-feats">${AUTH_FEATURES.map(([i, t, d]) => `<li>${icon(i)}<div><b>${t}</b><span>${d}</span></div></li>`).join('')}</ul>
        ${CONFIG.private ? '<p class="small" style="opacity:.85;margin-top:16px">Private workspace. Accounts are by invitation only.</p>' : '<div class="auth-links"><a href="/features">All features</a><a href="/security">Security</a><a href="/compliance">Compliance</a><a href="/pricing">Pricing</a><a href="/templates">Templates</a></div>'}
      </div>
      <div class="small" style="opacity:.8">${icon('shield')} Encrypted at rest · Sealed PDFs · Two-factor login</div>
    </div>
    <div class="auth-form"><form class="box stack" id="f">
      <h1>${reg ? (CONFIG.first_run ? 'Create the admin account' : 'Create your account') : 'Welcome back'}</h1>
      <p class="muted" style="margin-top:4px">${reg ? (CONFIG.first_run ? 'This is a fresh install. The first account becomes the administrator.' : 'Start your free trial. No card needed.') : 'Sign in to continue.'}</p>
      ${reg && planParam() && !CONFIG.first_run ? `<div class="chip" style="align-self:flex-start">${icon('check')} Trial, then the ${esc(planParam())} plan when you're ready</div>` : ''}
      ${reg ? '<label class="field"><span>Full name</span><input type="text" name="name" required autocomplete="name"></label><label class="field"><span>Company or workspace name</span><input type="text" name="company" autocomplete="organization" placeholder="e.g. Acme Studio Pvt. Ltd."></label>' : ''}
      <label class="field"><span>Email</span><input type="email" name="email" required autocomplete="email"></label>
      <label class="field"><span>Password</span><input type="password" name="password" required minlength="${reg ? 8 : 1}" autocomplete="${reg ? 'new-password' : 'current-password'}"></label>
      <button class="btn primary lg block">${reg ? 'Create account' : 'Sign in'}</button>
      ${CONFIG.allow_signup && !CONFIG.first_run ? `<p class="small muted" style="text-align:center">${reg ? 'Already have an account? <a href="#/login">Sign in</a>' : 'New here? <a href="#/register">Start a free trial</a>'}</p>` : ''}
      ${reg ? '<p class="small muted" style="text-align:center;margin:0">By creating an account you agree to the <a href="/terms" target="_blank">Terms</a> and <a href="/privacy" target="_blank">Privacy policy</a>.</p>' : ''}
      <p class="small" style="text-align:center;margin:0"><a href="/">← Back to the website</a></p>
    </form>
    <ul class="auth-feats auth-m">${AUTH_FEATURES.slice(0, 6).map(([i, t]) => `<li>${icon(i)}<div><b>${t}</b></div></li>`).join('')}</ul></div>
  </div>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      const r = await api(`/api/auth/${reg ? 'register' : 'login'}`, { method: 'POST', body });
      if (r.mfa_required) return mfaStep(r.mfa_token);
      ME = r.user; ORG = null;
      CONFIG = null; go('#/');
      if (location.hash === '#/') route();
    } catch (err) { toast(err.message, true); }
  };
  function mfaStep(token) {
    const box = document.querySelector('.auth-form');
    let useRecovery = false;
    const draw = () => {
      box.innerHTML = `<form class="box stack" id="mf"><h1>Two-step verification</h1>
        <p class="muted" style="margin:0">${useRecovery ? 'Enter one of the recovery codes you saved when you set up 2FA.' : 'Enter the 6-digit code from your authenticator app.'}</p>
        <label class="field"><span>${useRecovery ? 'Recovery code' : 'Authentication code'}</span><input type="text" id="code" ${useRecovery ? 'placeholder="ABCDE-12345"' : 'inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456"'} required autofocus></label>
        <button class="btn primary lg block">Verify</button>
        <button type="button" class="btn ghost" id="sw">${useRecovery ? 'Use authenticator code instead' : "Can't use your phone? Use a recovery code"}</button></form>`;
      box.querySelector('#sw').onclick = () => { useRecovery = !useRecovery; draw(); };
      box.querySelector('#mf').onsubmit = async (e) => {
        e.preventDefault();
        const v = box.querySelector('#code').value.trim();
        try { const r = await api('/api/auth/login/mfa', { method: 'POST', body: useRecovery ? { mfa_token: token, recovery_code: v } : { mfa_token: token, code: v } }); ME = r.user; ORG = null; CONFIG = null; go('#/'); if (location.hash === '#/') route(); }
        catch (err) { toast(err.message, true); if (/timed out|Start again/.test(err.message)) go('#/login'); }
      };
    };
    draw();
  }
}

// ======================================================= dashboard
async function dashboard(main) {
  const [s, templates] = await Promise.all([api('/api/stats'), api('/api/templates')]);
  const c = s.counts;
  const hr = new Date().getHours();
  main.innerHTML = `
  <div class="topbar"><div><h1>Good ${hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening'}, ${esc(ME.name.split(' ')[0])}</h1><p class="muted" style="margin:4px 0 0">Here's what's happening with your documents.</p></div>
    <span class="spacer"></span>${hasPerm(ME, 'documents.send') ? `<button class="btn" data-href="#/templates">${icon('template')} Use a template</button><button class="btn primary" id="d-new">${icon('upload')} Upload & send</button>` : ''}</div>
  <div class="content">
    <div class="stats">
      ${stat('in_progress', 'Awaiting others', c.in_progress || 0, 'clock', 'amber')}
      ${stat('completed', 'Completed', c.completed || 0, 'okcircle', 'green')}
      ${stat('draft', 'Drafts', c.draft || 0, 'file', 'gray')}
      ${stat('closed', 'Declined / expired', (c.declined || 0) + (c.expired || 0) + (c.recalled || 0), 'xcircle', 'red')}
      <div class="card stat" data-href="#/documents/s/completed"><span class="ic blue">${icon('check')}</span><div><div class="n">${s.completedThisMonth}</div><div class="small muted">Completed this month</div></div></div>
    </div>
    ${s.waitingForMe.length ? `<div class="card" style="margin-top:16px;border-color:var(--primary)"><div class="card-h"><h2>${icon('pen')} Waiting for your signature</h2></div>
      ${s.waitingForMe.map((w) => `<a class="list-item" href="/sign/${esc(w.token)}" target="_blank"><span class="ic amber" style="width:34px;height:34px;border-radius:8px;display:grid;place-items:center">${icon('pen')}</span><div style="min-width:0;flex:1"><div class="t">${esc(w.title)}</div><div class="small muted">From ${esc(w.sender)} · ${timeAgo(w.sent_at)}</div></div><span class="btn sm primary">Sign now</span></a>`).join('')}</div>` : ''}
    ${s.expiring.length ? `<div class="card" style="margin-top:16px"><div class="card-h"><h2>${icon('bell')} Expiring within 3 days</h2></div>${s.expiring.map((d) => `<div class="list-item" data-doc="${d.id}"><div class="t" style="flex:1">${esc(d.title)}</div><span class="small muted">Expires ${fmtDate(d.expires_at)}</span></div>`).join('')}</div>` : ''}
    <div class="dash-grid">
      <div class="card"><div class="card-h"><h2>Recent documents</h2><span class="spacer"></span><a href="#/documents" class="small">View all</a></div>
        ${s.recent.length ? s.recent.map((d) => `<div class="list-item" data-doc="${d.id}"><span style="color:var(--primary)">${icon('file')}</span><div style="min-width:0;flex:1"><div class="t">${esc(d.title)}</div><div class="small muted">${d.recipients} recipient(s) · updated ${timeAgo(d.updated_at)}</div></div>${badge(d.status)}</div>`).join('')
          : `<div class="empty">${icon('inbox')}<div>No documents yet.</div>${hasPerm(ME, 'documents.send') ? '<button class="btn primary sm" style="margin-top:10px" id="d-new2">Upload your first PDF</button>' : ''}</div>`}
      </div>
      <div class="card"><div class="card-h"><h2>Activity</h2></div><div class="timeline">
        ${s.activity.length ? s.activity.map((a) => `<div class="ev"><span class="dot"></span><div class="small"><strong>${esc(a.action)}</strong> · <span class="muted">${esc(a.title)}</span><div class="muted">${esc(a.details || '')}</div><div class="muted" style="font-size:11.5px">${timeAgo(a.created_at)}</div></div></div>`).join('') : '<div class="empty small">Activity will appear here.</div>'}
      </div></div>
    </div>
    <div class="row" style="margin:26px 0 12px"><h2>Start from a template</h2><span class="spacer"></span><a href="#/templates" class="small">All templates</a></div>
    <div class="tpl-grid" id="d-tpls"></div>
  </div>`;
  main.querySelectorAll('[data-doc]').forEach((el) => (el.onclick = () => go(`#/documents/${el.dataset.doc}`)));
  main.querySelector('#d-new')?.addEventListener('click', newDocumentModal);
  main.querySelector('#d-new2')?.addEventListener('click', newDocumentModal);
  renderTemplateCards(main.querySelector('#d-tpls'), templates.slice(0, 4), true);
}
const stat = (s, label, n, ic, color) => `<div class="card stat" data-href="#/documents/s/${s}"><span class="ic ${color}">${icon(ic)}</span><div><div class="n">${n}</div><div class="small muted">${label}</div></div></div>`;

// ======================================================= new document
function newDocumentModal() {
  const m = modal(`
    <div class="mh"><h2>New document</h2><span class="spacer"></span><button class="btn ghost sm" data-close>${icon('x')}</button></div>
    <div class="mb stack">
      <label class="dropzone" id="dz">${icon('upload')}<div style="font-weight:650;margin-top:6px">Drop a PDF here or click to browse</div><div class="small muted">Up to 25 MB</div><input type="file" accept="application/pdf,.pdf" hidden id="fi"></label>
      <div id="picked" class="small"></div>
      <label class="field"><span>Document title (optional)</span><input type="text" id="tt" placeholder="Defaults to the file name"></label>
      <p class="small muted" style="margin:0">Or <a href="#/templates" data-close>start from a template</a>.</p>
    </div>
    <div class="mf"><button class="btn" data-close>Cancel</button><button class="btn primary" id="go" disabled>${icon('arrow')} Continue</button></div>`);
  let file = null;
  const fi = m.el.querySelector('#fi'), dz = m.el.querySelector('#dz');
  const pick = (f) => {
    if (!f || !/pdf$/i.test(f.type || f.name)) return toast('Please choose a PDF file', true);
    file = f; m.el.querySelector('#picked').innerHTML = `${icon('file')} <strong>${esc(f.name)}</strong> · ${(f.size / 1024 / 1024).toFixed(2)} MB`;
    m.el.querySelector('#go').disabled = false;
  };
  fi.onchange = () => pick(fi.files[0]);
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); pick(e.dataTransfer.files[0]); };
  m.el.querySelector('#go').onclick = async () => {
    const fd = new FormData(); fd.append('file', file); fd.append('title', m.el.querySelector('#tt').value);
    m.el.querySelector('#go').disabled = true;
    try { const { id } = await api('/api/documents', { method: 'POST', body: fd }); m.close(); go(`#/documents/${id}/edit`); }
    catch (e) { toast(e.message, true); m.el.querySelector('#go').disabled = false; }
  };
}

// ======================================================= documents list
async function documentsPage(main, status = 'all') {
  const tabs = [['all', 'All'], ['in_progress', 'In progress'], ['completed', 'Completed'], ['draft', 'Drafts'], ['closed', 'Declined & expired']];
  main.innerHTML = `
  <div class="topbar"><h1>Documents</h1><span class="spacer"></span>
    <div style="position:relative;width:240px"><input type="text" id="q" placeholder="Search by title" style="padding-left:34px"><span style="position:absolute;left:10px;top:9px;color:var(--muted)">${icon('search')}</span></div>
    <button class="btn primary" id="n">${icon('plus')} New</button></div>
  <div class="content">
    <div class="tabs">${tabs.map(([k, l]) => `<a href="#/documents/s/${k}" class="${status === k ? 'active' : ''}">${l}</a>`).join('')}</div>
    <div class="card" id="list"></div>
  </div>`;
  main.querySelector('#n').onclick = newDocumentModal;
  const load = async (q = '') => {
    const rows = await api(`/api/documents?status=${status}&q=${encodeURIComponent(q)}`);
    const list = main.querySelector('#list');
    if (!rows.length) { list.innerHTML = `<div class="empty">${icon('inbox')}<div>No documents here yet.</div></div>`; return; }
    list.innerHTML = `<table class="tbl"><thead><tr><th>Document</th>${hasPerm(ME, 'documents.view_all') ? '<th class="hide-m">Owner</th>' : ''}<th class="hide-m">Recipients</th><th>Status</th><th class="hide-m">Risk</th><th class="hide-m">Progress</th><th class="hide-m">Last updated</th></tr></thead><tbody>
      ${rows.map((d) => `<tr data-id="${d.id}" data-status="${d.status}">
        <td><div style="font-weight:650">${esc(d.title)}</div><div class="small muted mono" style="font-family:inherit">#${esc(d.uid)}</div></td>
        ${hasPerm(ME, 'documents.view_all') ? `<td class="hide-m small">${esc(d.owner_id === ME.id ? 'You' : d.owner_name || '')}</td>` : ''}
        <td class="hide-m small">${esc(d.recipient_names || '—')}</td>
        <td>${badge(d.status)}</td>
        <td class="hide-m">${d.risk_level ? riskPill(d.risk_level) : '<span class="small muted">—</span>'}</td>
        <td class="hide-m"><div class="row small"><div class="progress"><div style="width:${d.recipient_count ? (d.signed_count / d.recipient_count) * 100 : 0}%"></div></div>${d.signed_count}/${d.recipient_count}</div></td>
        <td class="hide-m small muted">${timeAgo(d.updated_at)}</td></tr>`).join('')}</tbody></table>`;
    list.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => go(tr.dataset.status === 'draft' ? `#/documents/${tr.dataset.id}/edit` : `#/documents/${tr.dataset.id}`)));
  };
  let t; main.querySelector('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => load(e.target.value), 250); };
  await load();
}

// ======================================================= document detail
async function documentDetail(main, id) {
  const d = await api(`/api/documents/${id}`);
  const mine = d.owner_id === ME.id;
  const canModify = (mine && hasPerm(ME, 'documents.send')) || hasPerm(ME, 'documents.manage_all');
  if (d.status === 'draft' && canModify) return go(`#/documents/${id}/edit`);
  const actionable = d.recipients.filter((r) => r.role !== 'viewer');
  const done = actionable.filter((r) => r.status === 'signed').length;
  main.innerHTML = `
  <div class="topbar">
    <a class="btn ghost sm" href="#/documents">${icon('back')}</a>
    <div style="min-width:0"><h1>${esc(d.title)}</h1><div class="row small muted" style="margin-top:4px">${badge(d.status)} <span>#${esc(d.uid)}</span> <span>· ${done}/${actionable.length} completed</span></div></div>
    <span class="spacer"></span>
    <div class="row wrap">
      ${d.status === 'in_progress' && canModify ? `<button class="btn" id="remind">${icon('bell')} Remind</button><button class="btn" id="recall">${icon('x')} Recall</button>` : ''}
      ${hasPerm(ME, 'documents.download') ? `<a class="btn ${d.status === 'completed' ? 'primary' : ''}" href="/api/documents/${d.id}/download">${icon('download')} ${d.status === 'completed' ? 'Download signed' : 'Download'}</a>` : ''}
      ${hasPerm(ME, 'documents.send') ? `<button class="btn" id="dup" title="Duplicate as new draft">${icon('copy')}</button>` : ''}
      ${hasPerm(ME, 'templates.manage') ? `<button class="btn" id="tpl" title="Save as template">${icon('template')}</button>` : ''}
      ${hasPerm(ME, 'documents.delete') && (mine || hasPerm(ME, 'documents.manage_all')) ? `<button class="btn danger" id="del" title="Delete">${icon('trash')}</button>` : ''}
    </div>
  </div>
  <div class="content" style="max-width:none">
    <div style="display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:18px" class="detail-grid">
      <div class="card" style="background:var(--page-bg);overflow:hidden"><div class="pages" id="pv"><div class="empty">Loading preview…</div></div></div>
      <div class="stack">
        <div class="card"><div class="card-h"><h2>Recipients</h2><span class="spacer"></span><span class="small muted">${d.sequential ? 'In order' : 'Parallel'}</span></div>
          ${d.recipients.map((r) => `<div class="list-item" style="cursor:default"><span class="avatar" style="background:${r.color}">${esc(initials(r.name))}</span>
            <div style="min-width:0;flex:1"><div class="t">${esc(r.name)}</div><div class="small muted" style="overflow:hidden;text-overflow:ellipsis">${esc(r.email)} · ${r.role === 'viewer' ? 'gets a copy' : r.role}</div>
            ${r.signed_at ? `<div class="small muted">${r.status === 'declined' ? 'Declined' : 'Signed'} ${fmtDate(r.signed_at)}</div>` : r.viewed_at ? `<div class="small muted">Viewed ${fmtDate(r.viewed_at)}</div>` : ''}
            ${r.decline_reason ? `<div class="small" style="color:var(--bad)">“${esc(r.decline_reason)}”</div>` : ''}</div>${r.role === 'viewer' ? '' : badge(r.status)}</div>`).join('')}
        </div>
        <div class="card"><div class="card-h"><h2>Compliance</h2><span class="spacer"></span>${d.jurisdictions.map((c) => `<span class="chip">${esc(c)}</span>`).join(' ')}</div><div class="card-b stack">
          <div class="small"><span class="muted">Document type:</span> ${esc(SFC().CATEGORIES[d.category]?.label || 'Commercial')} · <span class="muted">Checks:</span> ${d.controls.map((c) => esc(SFC().CONTROLS[c]?.label || c)).join(', ')}</div>
          ${riskPanel(d.compliance || d.assessment, { compact: false })}
          ${d.retain_until ? `<div class="small">${icon('shield')} Retention hold until <b>${fmtDate(d.retain_until, false)}</b></div>` : ''}
        </div></div>
        <div class="card"><div class="card-h"><h2>Protection & integrity</h2><span class="spacer"></span><button class="btn sm" id="integ">${icon('shield')} Run check</button></div><div class="card-b small" id="integ-out">
          <div class="stack" style="gap:6px"><div>${icon('check')} Files encrypted at rest (AES-256-GCM)</div><div>${icon('check')} Hash-chained, append-only audit trail</div>
          <div>${d.sealed ? icon('check') + ' Signed PDF sealed with the platform certificate' : icon('clock') + ' PDF will be sealed when everyone has signed'}</div></div></div></div>
        <div class="card"><div class="card-h"><h2>Details</h2></div><div class="card-b small stack">
          <div class="row"><span class="muted" style="width:110px">Sent</span>${fmtDate(d.sent_at)}</div>
          <div class="row"><span class="muted" style="width:110px">Expires</span>${fmtDate(d.expires_at)}</div>
          ${d.completed_at ? `<div class="row"><span class="muted" style="width:110px">Completed</span>${fmtDate(d.completed_at)}</div>` : ''}
          <div><div class="muted">Original SHA-256</div><div class="mono">${esc(d.original_hash)}</div></div>
          ${d.final_hash ? `<div><div class="muted">Signed file SHA-256</div><div class="mono">${esc(d.final_hash)}</div></div>` : ''}
          ${d.message ? `<div><div class="muted">Message</div>${esc(d.message)}</div>` : ''}
        </div></div>
        <div class="card"><div class="card-h"><h2>Audit trail</h2></div><div class="timeline" style="max-height:420px;overflow:auto">
          ${d.audit.map((a) => `<div class="ev"><span class="dot"></span><div class="small"><strong>${esc(a.action)}</strong>${a.actor ? ` · ${esc(a.actor)}` : ''}<div class="muted">${esc(a.details || '')}</div><div class="muted" style="font-size:11.5px">${fmtDate(a.created_at)}${a.ip ? ` · IP ${esc(a.ip)}` : ''}</div></div></div>`).join('')}
        </div></div>
      </div>
    </div>
  </div>
  <style>@media (max-width: 1000px){ .detail-grid { grid-template-columns: 1fr !important; } }</style>`;

  const $ = (s) => main.querySelector(s);
  $('#remind')?.addEventListener('click', async () => { try { const r = await api(`/api/documents/${id}/remind`, { method: 'POST' }); toast(r.reminded ? `Reminder sent to ${r.reminded} recipient(s)` : 'Nobody to remind right now'); route(); } catch (e) { toast(e.message, true); } });
  $('#recall')?.addEventListener('click', async () => { if (await confirmBox('Recall document?', 'Recipients will no longer be able to sign it.', 'Recall', true)) { await api(`/api/documents/${id}/recall`, { method: 'POST', body: {} }); toast('Document recalled'); route(); } });
  $('#del')?.addEventListener('click', async () => { if (await confirmBox('Delete document?', 'This permanently deletes the document, its signed copy and audit trail.', 'Delete', true)) { try { await api(`/api/documents/${id}`, { method: 'DELETE' }); toast('Deleted'); go('#/documents'); } catch (e) { toast(e.message, true); } } });
  $('#integ').onclick = async () => {
    const r = await api(`/api/documents/${id}/integrity`);
    const line = (ok, text) => `<div class="row" style="gap:8px;color:${ok ? 'var(--ok)' : 'var(--bad)'}">${icon(ok ? 'okcircle' : 'xcircle')}<span>${text}</span></div>`;
    $('#integ-out').innerHTML = `<div class="stack" style="gap:6px">
      ${line(r.chain.valid, r.chain.valid ? `Audit trail intact (${r.chain.entries} chained entries)` : `Audit trail broken at entry ${r.chain.brokenAt}`)}
      ${line(r.encryptedAtRest, r.encryptedAtRest ? 'Original encrypted at rest' : 'Original stored unencrypted (run "Encrypt existing files" in Settings › Security)')}
      ${line(r.original?.ok, r.original?.ok ? 'Original file matches its recorded SHA-256' : r.original?.error || 'Original file does not match its fingerprint')}
      ${r.signed ? line(r.signed.ok, r.signed.ok ? 'Signed PDF matches its recorded SHA-256' : r.signed.error || 'Signed PDF changed') : ''}
      ${r.seal ? `<div class="muted">Seal: ${esc(r.seal.subject)}${r.seal.selfSigned ? ' (self-signed)' : ''}<br><span class="mono">${esc(r.seal.fingerprint)}</span></div>` : ''}
      <b style="color:${r.ok ? 'var(--ok)' : 'var(--bad)'}">${r.ok ? 'All integrity checks passed' : 'Integrity problem found — investigate before relying on this document'}</b></div>`;
  };
  $('#dup')?.addEventListener('click', async () => { const r = await api(`/api/documents/${id}/duplicate`, { method: 'POST' }); toast('Copied to a new draft'); go(`#/documents/${r.id}/edit`); });
  $('#tpl')?.addEventListener('click', () => saveAsTemplateModal(d));

  const pv = $('#pv');
  if (d.status === 'completed') {
    await renderPdf(`/api/documents/${id}/signed-file`, pv, { maxWidth: 760 });
  } else {
    await renderPdf(`/api/documents/${id}/file`, pv, { maxWidth: 760 });
    for (const f of d.fields) {
      const layer = pv.querySelector(`.layer[data-page="${f.page}"]`); if (!layer) continue;
      const r = d.recipients.find((x) => x.id === f.recipient_id);
      const el = document.createElement('div');
      el.className = 'fld';
      el.style.cssText = `--c:${r?.color || 'var(--primary)'};left:${f.x * 100}%;top:${f.y * 100}%;width:${f.w * 100}%;height:${f.h * 100}%;${f.value ? 'background:transparent;border-color:transparent;color:var(--ink)' : ''}`;
      el.title = `${FIELD_TYPES[f.type]?.label} — ${r?.name}`;
      el.innerHTML = f.value
        ? (f.value.startsWith('data:image') ? `<img src="${f.value}" style="max-width:100%;max-height:100%">` : `<span class="lbl" style="font-weight:500">${f.type === 'checkbox' ? (f.value === 'true' ? '✔' : '') : esc(f.value)}</span>`)
        : `<span class="lbl">${icon(FIELD_TYPES[f.type]?.icon || 'text')}${f.type === 'checkbox' ? '' : esc(f.label || FIELD_TYPES[f.type]?.label)}</span>`;
      layer.appendChild(el);
    }
  }
}

function saveAsTemplateModal(d) {
  const m = modal(`<div class="mh"><h2>Save as template</h2></div><div class="mb stack">
    <label class="field"><span>Template name</span><input type="text" id="n" value="${esc(d.title)}"></label>
    <label class="field"><span>Category</span><input type="text" id="c" value="General"></label>
    <label class="field"><span>Description</span><textarea id="ds" style="min-height:60px"></textarea></label>
    <p class="small muted" style="margin:0">Recipients become reusable roles; field positions are kept. Filled-in values are not copied.</p></div>
    <div class="mf"><button class="btn" data-close>Cancel</button><button class="btn primary" id="ok">Save template</button></div>`);
  m.el.querySelector('#ok').onclick = async () => {
    const r = await api(`/api/documents/${d.id}/save-as-template`, { method: 'POST', body: { name: m.el.querySelector('#n').value, category: m.el.querySelector('#c').value, description: m.el.querySelector('#ds').value } });
    m.close(); toast('Template created'); go(`#/templates/${r.id}/edit`);
  };
}

// ======================================================= templates
async function templatesPage(main) {
  const rows = await api('/api/templates');
  const cats = ['All', ...new Set(rows.map((t) => t.category))];
  main.innerHTML = `
  <div class="topbar"><div><h1>Templates</h1><p class="muted" style="margin:4px 0 0">Reusable documents with signature fields already placed.</p></div><span class="spacer"></span>${hasPerm(ME, 'templates.manage') ? `<button class="btn primary" id="up">${icon('upload')} New template</button>` : ''}</div>
  <div class="content">
    <div class="tabs" id="cats">${cats.map((c, i) => `<a href="javascript:void 0" data-c="${esc(c)}" class="${i ? '' : 'active'}">${esc(c)}</a>`).join('')}</div>
    <div class="tpl-grid" id="grid"></div>
  </div>`;
  const grid = main.querySelector('#grid');
  renderTemplateCards(grid, rows);
  main.querySelector('#cats').onclick = (e) => {
    const a = e.target.closest('a'); if (!a) return;
    main.querySelectorAll('#cats a').forEach((x) => x.classList.toggle('active', x === a));
    renderTemplateCards(grid, a.dataset.c === 'All' ? rows : rows.filter((t) => t.category === a.dataset.c));
  };
  main.querySelector('#up') && (main.querySelector('#up').onclick = () => {
    const m = modal(`<div class="mh"><h2>New template</h2></div><div class="mb stack">
      <label class="dropzone" id="dz">${icon('upload')}<div style="font-weight:650;margin-top:6px">Choose a PDF</div><input type="file" accept=".pdf,application/pdf" hidden id="fi"></label><div id="pk" class="small"></div>
      <label class="field"><span>Name</span><input type="text" id="n"></label>
      <label class="field"><span>Category</span><input type="text" id="c" value="General" list="catlist"><datalist id="catlist">${cats.slice(1).map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label></div>
      <div class="mf"><button class="btn" data-close>Cancel</button><button class="btn primary" id="ok" disabled>Create & place fields</button></div>`);
    let file;
    m.el.querySelector('#fi').onchange = (e) => { file = e.target.files[0]; m.el.querySelector('#pk').textContent = file?.name || ''; m.el.querySelector('#ok').disabled = !file; if (!m.el.querySelector('#n').value) m.el.querySelector('#n').value = file.name.replace(/\.pdf$/i, ''); };
    m.el.querySelector('#ok').onclick = async () => {
      const fd = new FormData(); fd.append('file', file); fd.append('name', m.el.querySelector('#n').value); fd.append('category', m.el.querySelector('#c').value);
      try { const r = await api('/api/templates', { method: 'POST', body: fd }); m.close(); go(`#/templates/${r.id}/edit`); } catch (e) { toast(e.message, true); }
    };
  });
}

function renderTemplateCards(grid, rows, compact = false) {
  if (!rows.length) { grid.innerHTML = `<div class="empty card" style="grid-column:1/-1">${icon('template')}<div>No templates in this category.</div></div>`; return; }
  grid.innerHTML = rows.map((t) => `
    <div class="card tpl" data-id="${t.id}">
      <div class="thumb"><span class="chip cat">${esc(t.category)}</span><canvas></canvas></div>
      <div class="body"><div class="row"><h3 style="flex:1">${esc(t.name)}</h3>${t.builtin ? '<span class="small muted" title="Built-in">★</span>' : ''}</div>
        ${compact ? '' : `<div class="small muted">${esc(t.description || '')}</div>`}
        <div class="small muted">${t.role_count} role(s) · ${t.field_count} fields${t.use_count ? ` · used ${t.use_count}×` : ''}</div></div>
      <div class="actions">${hasPerm(ME, 'templates.use') && hasPerm(ME, 'documents.send') ? `<button class="btn primary sm" data-a="use">${icon('send')} Use</button>` : ''}
        ${compact || !hasPerm(ME, 'templates.manage') ? '' : `${!t.builtin || ME.is_admin ? `<button class="btn sm" data-a="edit">${icon('pen')} Edit</button>` : ''}<button class="btn sm ghost" data-a="dup" title="Duplicate">${icon('copy')}</button>${!t.builtin || ME.is_admin ? `<button class="btn sm ghost danger" data-a="del" title="Delete">${icon('trash')}</button>` : ''}`}</div>
    </div>`).join('');
  grid.querySelectorAll('.tpl').forEach((card) => {
    renderThumb(`/api/templates/${card.dataset.id}/file`, card.querySelector('canvas'), 220).catch(() => {});
    card.onclick = async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      const id = card.dataset.id;
      if (a === 'use') useTemplateModal(id);
      if (a === 'edit') go(`#/templates/${id}/edit`);
      if (a === 'dup') { const r = await api(`/api/templates/${id}/duplicate`, { method: 'POST' }); toast('Template duplicated'); go(`#/templates/${r.id}/edit`); }
      if (a === 'del' && await confirmBox('Delete template?', 'Documents already created from it are not affected.', 'Delete', true)) { await api(`/api/templates/${id}`, { method: 'DELETE' }); toast('Template deleted'); route(); }
    };
  });
}

async function useTemplateModal(id) {
  const t = await api(`/api/templates/${id}`);
  const m = modal(`<div class="mh"><h2>${esc(t.name)}</h2><span class="spacer"></span><button class="btn ghost sm" data-close>${icon('x')}</button></div>
    <div class="mb stack">
      <label class="field"><span>Document title</span><input type="text" id="tt" value="${esc(t.name)}"></label>
      ${t.vars.length ? `<div class="card card-b stack" style="background:var(--surface-2)"><div class="row"><h3 style="flex:1">Document details</h3><button type="button" class="btn sm ghost" id="ex">Fill with example</button></div>
        <div class="vgrid">${t.vars.map((v) => `<label class="field"><span>${esc(v.label)}</span><input type="text" data-var="${esc(v.key)}" placeholder="${esc(v.example || '')}"></label>`).join('')}</div>
        <p class="small muted" style="margin:0">These go straight into the document text. Anything left empty shows as [placeholder].</p></div>` : ''}
      <h3 style="margin-top:4px">Who signs</h3>
      ${t.roles.map((r, i) => `<div class="recip" style="--c:${r.color}"><div class="head"><span class="num">${i + 1}</span><strong class="small">${esc(r.name)}</strong><span class="small muted">· ${r.role === 'viewer' ? 'gets a copy' : r.role}</span></div>
        <div class="row"><input type="text" placeholder="Full name" data-i="${i}" data-k="name"><input type="email" placeholder="Email" data-i="${i}" data-k="email"></div></div>`).join('')}
    </div>
    <div class="mf"><button class="btn" id="review">Review fields first</button><button class="btn primary" id="send">${icon('send')} Send now</button></div>`, { wide: true });
  const collect = () => {
    const people = t.roles.map(() => ({}));
    m.el.querySelectorAll('[data-k]').forEach((inp) => (people[inp.dataset.i][inp.dataset.k] = inp.value.trim()));
    const variables = {};
    m.el.querySelectorAll('[data-var]').forEach((inp) => { if (inp.value.trim()) variables[inp.dataset.var] = inp.value.trim(); });
    return { title: m.el.querySelector('#tt').value, recipients: people, variables };
  };
  m.el.querySelector('#ex')?.addEventListener('click', () => m.el.querySelectorAll('[data-var]').forEach((inp) => { inp.value = inp.placeholder; }));
  m.el.querySelector('#review').onclick = async () => { const r = await api(`/api/templates/${id}/use`, { method: 'POST', body: collect() }); m.close(); go(`#/documents/${r.id}/edit`); };
  m.el.querySelector('#send').onclick = async () => {
    const body = collect();
    if (body.recipients.some((p) => !p.name || !/^\S+@\S+\.\S+$/.test(p.email || ''))) return toast('Enter a name and valid email for every role', true);
    const r = await api(`/api/templates/${id}/use`, { method: 'POST', body });
    try { await api(`/api/documents/${r.id}/send`, { method: 'POST' }); m.close(); toast('Sent for signature'); go(`#/documents/${r.id}`); }
    catch (e) { m.close(); toast(e.message, true); go(`#/documents/${r.id}/edit`); }
  };
}

// ======================================================= settings
async function settingsPage(main, tab) {
  const admin = ME.is_admin;
  const tabs = [['profile', 'My account', 'user'], ...(admin ? [['appearance', 'Branding & themes', 'palette'], ['emails', 'Email templates', 'mail'], ['delivery', 'Email delivery', 'send'], ['outbox', 'Outbox', 'inbox'], ['users', 'All users (platform)', 'users'], ['security', 'Platform security', 'shield']] : [])];
  main.innerHTML = `<div class="topbar"><h1>Settings</h1></div><div class="content"><div class="settings">
    <nav class="snav card" style="padding:8px">${tabs.map(([k, l, ic]) => `<a href="#/settings/${k}" class="${tab === k ? 'active' : ''}">${icon(ic)}${l}</a>`).join('')}</nav>
    <div id="pane"></div></div></div>`;
  const pane = main.querySelector('#pane');
  if (tab === 'profile') return profileTab(pane);
  if (!admin) return go('#/settings');
  if (tab === 'appearance') return appearanceTab(pane);
  if (tab === 'emails') return emailsTab(pane);
  if (tab === 'delivery') return deliveryTab(pane);
  if (tab === 'outbox') return outboxTab(pane);
  if (tab === 'users') return usersTab(pane);
  if (tab === 'security') return securityTab(pane);
}

async function invitePage(token) {
  if (!CONFIG) { CONFIG = await api('/api/public-config'); applyTheme(CONFIG.theme); }
  let info;
  try { info = await api(`/api/auth/invite/${token}`); } catch (e) { app.innerHTML = `<div class="center-msg card"><h1>Link expired</h1><p class="muted">${esc(e.message)}</p><a class="btn primary" href="#/login">Go to sign in</a></div>`; return; }
  app.innerHTML = `<div class="auth-form" style="min-height:100vh"><form class="box stack" id="f"><div class="brand" style="padding:0;color:var(--text)"><span class="logo">${icon('sign')}</span>${esc(CONFIG.brand_name)}</div>
    <h1>Welcome, ${esc(info.name.split(' ')[0])}</h1><p class="muted" style="margin:0">Set a password to join <b>${esc(info.org || 'your workspace')}</b> as ${esc(info.email)}.</p>
    <label class="field"><span>New password</span><input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
    <label class="field"><span>Confirm password</span><input type="password" name="confirm" required autocomplete="new-password"></label>
    <p class="small muted" style="margin:0">At least 10 characters with letters and numbers. Avoid common passwords and your name.</p>
    <button class="btn primary lg block">Set password and sign in</button></form></div>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    if (f.password.value !== f.confirm.value) return toast("The passwords don't match", true);
    try { const r = await api(`/api/auth/invite/${token}`, { method: 'POST', body: { password: f.password.value } }); ME = r.user; ORG = null; history.replaceState(null, '', '/app#/'); route(); }
    catch (err) { toast(err.message, true); }
  };
}

function profileTab(pane) {
  pane.innerHTML = `<div class="card"><div class="card-h"><h2>Your profile</h2></div><form class="card-b stack" id="f" style="max-width:460px">
    <label class="field"><span>Name</span><input type="text" name="name" value="${esc(ME.name)}"></label>
    <label class="field"><span>Email</span><input type="email" value="${esc(ME.email)}" disabled></label>
    <div class="small muted">Role: <b>${esc(ME.role.name)}</b></div>
    <div><button class="btn primary">Save name</button></div></form></div><div id="sec" style="margin-top:16px"></div>`;
  accountSecurity(pane.querySelector('#sec'));
  pane.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    try { ME = (await api('/api/auth/me', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) })).user; toast('Profile updated'); route(); } catch (err) { toast(err.message, true); }
  };
}

async function appearanceTab(pane) {
  const s = await api('/api/settings');
  pane.innerHTML = `<div class="stack">
    <div class="card"><div class="card-h"><h2>Branding</h2></div><div class="card-b stack" style="max-width:460px">
      <label class="field"><span>Product name</span><input type="text" id="bn" value="${esc(s.brand_name)}"></label>
      <p class="small muted" style="margin:0">Shown in the sidebar, signing pages, emails and the completion certificate.</p>
      <div><button class="btn primary" id="sv">Save</button></div></div></div>
    <div class="card"><div class="card-h"><h2>Theme</h2><span class="spacer"></span><span class="small muted">Applies to the app, signing pages, emails and certificates</span></div><div class="card-b"><div class="themes">
      ${Object.keys(THEMES).map((k) => { const sw = themeSwatch(k); return `<div class="theme-card ${s.theme === k ? 'on' : ''}" data-k="${k}">
        <div class="pv"><div class="sb" style="background:${sw.sb};border-right:1px solid rgba(0,0,0,.06)"><i style="background:${sw.p};opacity:1;width:70%"></i><i style="background:${sw.t}"></i><i style="background:${sw.t}"></i><i style="background:${sw.t};width:60%"></i></div>
        <div class="mn" style="background:${sw.bg}"><b style="background:${sw.text};opacity:.8"></b><i style="background:${sw.p};width:40%;height:14px;border-radius:4px"></i><i style="background:${sw.border}"></i><i style="background:${sw.border};width:70%"></i></div></div>
        <div class="nm">${THEMES[k].name}<span class="spacer"></span>${s.theme === k ? `<span style="color:var(--primary)">${icon('check')}</span>` : ''}</div></div>`; }).join('')}
    </div></div></div></div>`;
  pane.querySelector('#sv').onclick = async () => { await api('/api/settings', { method: 'PUT', body: { brand_name: pane.querySelector('#bn').value } }); CONFIG = null; toast('Branding saved'); route(); };
  pane.querySelectorAll('.theme-card').forEach((c) => (c.onclick = async () => { await api('/api/settings', { method: 'PUT', body: { theme: c.dataset.k } }); applyTheme(c.dataset.k); CONFIG.theme = c.dataset.k; toast(`${THEMES[c.dataset.k].name} theme applied`); appearanceTab(pane); }));
}

async function emailsTab(pane) {
  const list = await api('/api/email-templates');
  let cur = list[0];
  const PH = ['recipient_name', 'sender_name', 'sender_email', 'document_title', 'message', 'expires_at', 'brand_name', 'actor_name', 'decline_reason'];
  pane.innerHTML = `<div class="card"><div class="card-h"><h2>Email templates</h2><span class="spacer"></span><select id="k" style="width:auto">${list.map((e) => `<option value="${e.key}">${esc(e.name)}</option>`).join('')}</select></div>
    <div class="card-b" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px" id="eg">
      <div class="stack">
        <label class="field"><span>Subject</span><input type="text" id="sub"></label>
        <label class="field"><span>Body</span><textarea id="body" style="min-height:220px"></textarea></label>
        <label class="field"><span>Button label</span><input type="text" id="btn"></label>
        <div><div class="small muted" style="margin-bottom:6px">Placeholders (click to insert)</div><div class="ph-list">${PH.map((p) => `<code data-p="${p}">{{${p}}}</code>`).join('')}</div></div>
        <div class="row"><button class="btn primary" id="save">Save template</button><button class="btn ghost" id="reset">Reset to default</button></div>
      </div>
      <div><div class="small muted" style="margin-bottom:6px">Live preview (sample data)</div><iframe class="email-preview" id="pv"></iframe></div>
    </div></div>
    <style>@media (max-width:1000px){#eg{grid-template-columns:1fr !important}}</style>`;
  const $ = (s) => pane.querySelector(s);
  let lastFocus = $('#body');
  const load = () => { $('#sub').value = cur.subject; $('#body').value = cur.body; $('#btn').value = cur.button || ''; preview(); };
  let t;
  const preview = () => { clearTimeout(t); t = setTimeout(async () => { const r = await api('/api/email-templates/preview', { method: 'POST', body: { subject: $('#sub').value, body: $('#body').value, button: $('#btn').value } }); $('#pv').srcdoc = `<div style="font:600 14px sans-serif;padding:12px 16px;background:#fff;border-bottom:1px solid #e5e7eb">Subject: ${esc(r.subject)}</div>` + r.html; }, 250); }; // ui-check-ignore: iframe srcdoc is a separate document and cannot resolve var(--token), this mimics fixed email-client chrome
  ['#sub', '#body', '#btn'].forEach((s) => { $(s).oninput = preview; $(s).onfocus = () => (lastFocus = $(s)); });
  $('#k').onchange = (e) => { cur = list.find((x) => x.key === e.target.value); load(); };
  pane.querySelectorAll('[data-p]').forEach((c) => (c.onclick = () => {
    const el = lastFocus, ins = `{{${c.dataset.p}}}`, p = el.selectionStart ?? el.value.length;
    el.value = el.value.slice(0, p) + ins + el.value.slice(el.selectionEnd ?? p); el.focus(); el.selectionStart = el.selectionEnd = p + ins.length; preview();
  }));
  $('#save').onclick = async () => {
    try { await api(`/api/email-templates/${cur.key}`, { method: 'PUT', body: { subject: $('#sub').value, body: $('#body').value, button: $('#btn').value } }); Object.assign(cur, { subject: $('#sub').value, body: $('#body').value, button: $('#btn').value }); toast('Email template saved'); } catch (e) { toast(e.message, true); }
  };
  $('#reset').onclick = async () => { if (await confirmBox('Reset template?', 'Restore the default subject and body for this email.', 'Reset')) { Object.assign(cur, await api(`/api/email-templates/${cur.key}/reset`, { method: 'POST' })); load(); toast('Restored default'); } };
  load();
}

async function deliveryTab(pane) {
  const s = await api('/api/settings');
  pane.innerHTML = `<div class="stack">
    <div class="card"><div class="card-h"><h2>General</h2></div><form class="card-b stack" id="g" style="max-width:520px">
      <label class="field"><span>Public URL of this server</span><input type="url" name="app_url" value="${esc(s.app_url)}" placeholder="https://sign.yourcompany.com"></label>
      <p class="small muted" style="margin:-4px 0 0">Used to build signing links in emails. Leave empty to use the address in the browser.</p>
      <label class="field"><span>Default expiry (days)</span><input type="number" name="default_expiry_days" min="1" value="${esc(s.default_expiry_days)}"></label>
      <label class="check"><input type="checkbox" name="allow_signup" ${s.allow_signup === '1' ? 'checked' : ''}> Allow anyone to create an account</label>
      <div><button class="btn primary">Save</button></div></form></div>
    <div class="card"><div class="card-h"><h2>SMTP server</h2><span class="spacer"></span><span class="badge ${s.smtp_host ? 'b-completed' : 'b-pending'}">${s.smtp_host ? 'Configured' : 'Not configured'}</span></div><form class="card-b stack" id="m" style="max-width:520px">
      <p class="small muted" style="margin:0">Without SMTP, emails are not delivered but are recorded in the Outbox so you can copy signing links manually.</p>
      <div class="row"><label class="field" style="flex:2"><span>Host</span><input type="text" name="smtp_host" value="${esc(s.smtp_host)}" placeholder="smtp.gmail.com"></label><label class="field" style="flex:1"><span>Port</span><input type="number" name="smtp_port" value="${esc(s.smtp_port)}"></label></div>
      <label class="check"><input type="checkbox" name="smtp_secure" ${s.smtp_secure === '1' ? 'checked' : ''}> Use TLS (port 465)</label>
      <label class="field"><span>Username</span><input type="text" name="smtp_user" value="${esc(s.smtp_user)}" autocomplete="off"></label>
      <label class="field"><span>Password</span><input type="password" name="smtp_pass" value="${esc(s.smtp_pass)}" autocomplete="new-password"></label>
      <label class="field"><span>From address</span><input type="text" name="smtp_from" value="${esc(s.smtp_from)}" placeholder='"Acme Sign" <no-reply@acme.com>'></label>
      <div class="row"><button class="btn primary">Save</button><button type="button" class="btn" id="test">${icon('send')} Send test email</button></div></form></div></div>`;
  const save = (form, extra = {}) => async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    form.querySelectorAll('input[type=checkbox]').forEach((c) => (body[c.name] = c.checked ? '1' : '0'));
    await api('/api/settings', { method: 'PUT', body: { ...body, ...extra } }); toast('Settings saved');
  };
  pane.querySelector('#g').onsubmit = save(pane.querySelector('#g'));
  pane.querySelector('#m').onsubmit = save(pane.querySelector('#m'));
  pane.querySelector('#test').onclick = async () => {
    const r = await api('/api/settings/test-email', { method: 'POST', body: { to: ME.email } });
    if (r.status === 'sent') toast(`Test email sent to ${ME.email}`); else if (r.status === 'logged') toast('No SMTP host set — test email saved to Outbox'); else toast(`Failed: ${r.error}`, true);
  };
}

async function outboxTab(pane) {
  const rows = await api('/api/outbox');
  pane.innerHTML = `<div class="card"><div class="card-h"><h2>Outbox</h2><span class="spacer"></span><span class="small muted">Last 100 emails</span></div>
    ${rows.length ? `<table class="tbl"><thead><tr><th>To</th><th>Subject</th><th>Status</th><th class="hide-m">When</th><th></th></tr></thead><tbody>
    ${rows.map((e) => `<tr style="cursor:default"><td class="small">${esc(e.to_email)}</td><td class="small">${esc(e.subject)}${e.error ? `<div style="color:var(--bad)">${esc(e.error)}</div>` : ''}</td>
      <td><span class="badge ${e.status === 'sent' ? 'b-completed' : e.status === 'failed' ? 'b-declined' : 'b-pending'}">${e.status === 'logged' ? 'Not delivered (no SMTP)' : e.status}</span></td>
      <td class="hide-m small muted">${timeAgo(e.created_at)}</td>
      <td><div class="row">${e.link ? `<button class="btn sm" data-link="${esc(e.link)}" title="Copy link">${icon('copy')}</button>` : ''}<a class="btn sm" href="/api/outbox/${e.id}" target="_blank" title="View email">${icon('eye')}</a></div></td></tr>`).join('')}</tbody></table>`
    : `<div class="empty">${icon('inbox')}<div>No emails yet.</div></div>`}</div>`;
  pane.querySelectorAll('[data-link]').forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.link); toast('Link copied'); } catch { prompt('Copy this link', b.dataset.link); } }));
}

async function usersTab(pane) {
  const rows = await api('/api/users');
  pane.innerHTML = `<div class="stack"><div class="card"><div class="card-h"><h2>Users</h2></div>
    <table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th class="hide-m">Joined</th><th></th></tr></thead><tbody>
    ${rows.map((u) => `<tr style="cursor:default"><td>${esc(u.name)}</td><td class="small">${esc(u.email)}</td><td>${u.is_admin ? '<span class="chip">Admin</span>' : 'Member'}</td><td class="hide-m small muted">${fmtDate(u.created_at, false)}</td>
      <td>${u.id !== ME.id ? `<button class="btn sm ghost danger" data-del="${u.id}">${icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
    <div class="card"><div class="card-h"><h2>Add a user</h2></div><form class="card-b stack" id="f" style="max-width:460px">
      <label class="field"><span>Name</span><input type="text" name="name" required></label>
      <label class="field"><span>Email</span><input type="email" name="email" required></label>
      <label class="field"><span>Temporary password</span><input type="text" name="password" minlength="8" required></label>
      <label class="check"><input type="checkbox" name="is_admin"> Administrator</label>
      <div><button class="btn primary">Add user</button></div></form></div></div>`;
  pane.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (await confirmBox('Delete user?', 'Their documents and templates will be deleted too.', 'Delete', true)) { await api(`/api/users/${b.dataset.del}`, { method: 'DELETE' }); route(); } }));
  pane.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target)); body.is_admin = !!body.is_admin;
    try { await api('/api/users', { method: 'POST', body }); toast('User added'); route(); } catch (err) { toast(err.message, true); }
  };
}




// ======================================================= compliance
function compliancePage(main, tab) {
  const C = SFC();
  main.innerHTML = `<div class="topbar"><div><h1>Compliance</h1><p class="muted" style="margin:4px 0 0">E-signature rules for ${C.JURISDICTIONS.length} countries and regions, and the risk checks applied before a document is sent.</p></div></div>
  <div class="content"><div class="tabs">${[['rules', 'Country rules'], ['calculator', 'Risk calculator'], ['levels', 'How it works']].map(([k, l]) => `<a href="#/compliance/${k}" class="${tab === k ? 'active' : ''}">${l}</a>`).join('')}</div><div id="cp"></div>
  <p class="small muted" style="margin-top:18px">Rules reviewed ${esc(C.RULES_REVIEWED)}. This library is operational guidance, not legal advice; confirm requirements with counsel in each jurisdiction.</p></div>`;
  const box = main.querySelector('#cp');
  if (tab === 'calculator') { box.innerHTML = '<div class="card card-b stack" style="max-width:560px" id="calc"></div>'; return riskCalculator(box.querySelector('#calc')); }
  if (tab === 'levels') {
    box.innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
      ${Object.entries(C.LEVELS).map(([k, l]) => `<div class="card card-b stack"><div class="row"><span class="jcode">${k}</span><h3>${esc(l.name)}</h3></div><p class="small" style="margin:0">${esc(l.how)}</p></div>`).join('')}</div>
      <div class="card card-b stack" style="margin-top:16px"><h2>How a document is checked before sending</h2>
      <ol class="small" style="margin:0;padding-left:18px;line-height:1.7"><li>The sender picks the governing law, the signers' countries, the document type and the value involved.</li>
      <li>Each jurisdiction's rules decide whether the document can be e-signed at all, the minimum signature level, and any formality (notary, witness, stamp duty, registration).</li>
      <li>A risk score (0–100) combines document type, value, the strictness of the law and cross-border signing. Verification checks lower the residual risk.</li>
      <li>Medium risk needs a one-time passcode; high risk or an advanced-signature requirement also needs ID verification; qualified signatures need a connected trust provider.</li>
      <li>The server repeats the assessment when you press Send and refuses to send if a rule isn't met. The result is written to the audit trail and the completion certificate.</li></ol></div>`;
    return;
  }
  jurisdictionLibrary(box);
}

async function securityTab(pane) {
  const s = await api('/api/security');
  const C = SFC();
  const p = s.policies;
  pane.innerHTML = `<div class="stack">
    <div class="card"><div class="card-h"><h2>Protection status</h2></div><div class="card-b stack small">
      <div class="row"><span style="color:var(--ok)">${icon('okcircle')}</span><div><b>Encryption at rest:</b> ${esc(s.encryption.algorithm)} · key from ${esc(s.encryption.keySource)} · ${s.encryption.encrypted}/${s.encryption.files} files encrypted</div></div>
      ${s.encryption.encrypted < s.encryption.files ? `<div><button class="btn sm" id="enc">${icon('shield')} Encrypt existing files</button></div>` : ''}
      <div class="row"><span style="color:${s.seal.selfSigned ? 'var(--warn)' : 'var(--ok)'}">${icon(s.seal.selfSigned ? 'bell' : 'okcircle')}</span><div><b>Document seal:</b> ${esc(s.seal.subject)} · ${esc(s.seal.source)} · valid to ${fmtDate(s.seal.validTo, false)}<div class="mono muted">${esc(s.seal.fingerprint)}</div>
        ${s.seal.selfSigned ? '<div class="muted">Seals detect tampering, but PDF readers show "issuer unknown". For trusted seals set SEAL_P12_PATH to a certificate from a CA or qualified trust service provider.</div>' : ''}</div></div>
      <div class="row"><span style="color:var(--ok)">${icon('okcircle')}</span><div><b>Audit trail:</b> SHA-256 hash chain, append-only (database triggers block edits)</div></div>
      <div class="row"><span style="color:var(--ok)">${icon('okcircle')}</span><div><b>Web protection:</b> strict CSP, HSTS (with HTTPS), rate limits, account lockout after 5 failed sign-ins, ${s.sessions} active session(s)</div></div>
    </div></div>
    <div class="card"><div class="card-h"><h2>Policies</h2></div><form class="card-b stack" id="pol" style="max-width:560px">
      <label class="check"><input type="checkbox" name="enforce_compliance" ${p.enforce_compliance === '1' ? 'checked' : ''}> Block sending when country rules or the risk policy aren't met</label>
      <div><div class="small muted" style="margin-bottom:6px">Minimum signer checks for every document</div>${['access_code', 'otp', 'id_check'].map((c) => `<label class="check small" style="margin-right:14px"><input type="checkbox" name="min_${c}" ${p.min_controls.includes(c) ? 'checked' : ''}> ${esc(C.CONTROLS[c].label)}</label>`).join('')}</div>
      <label class="field"><span>Default jurisdiction for new documents</span><select name="default_jurisdictions">${C.JURISDICTIONS.map((j) => `<option value="${j.code}" ${p.default_jurisdictions === j.code ? 'selected' : ''}>${esc(j.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Sign out after inactivity (hours)</span><input type="number" name="session_idle_hours" min="1" max="168" value="${esc(p.session_idle_hours)}"></label>
      <label class="check"><input type="checkbox" name="allow_recipient_download" ${p.allow_recipient_download === '1' ? 'checked' : ''}> Let recipients download the signed copy</label>
      <label class="field"><span>Data residency (shown to signers and in reports)</span><input type="text" name="data_region" value="${esc(p.data_region)}"></label>
      <label class="field"><span>Identity verification provider</span><select name="idv_provider"><option value="demo" ${p.idv_provider === 'demo' ? 'selected' : ''}>Demo check (name + ID number)</option></select></label>
      <label class="field"><span>Qualified signature provider</span><input type="text" name="qes_provider" value="${esc(p.qes_provider)}" placeholder="Not connected"></label>
      <p class="small muted" style="margin:0">Connect a real ID-verification vendor and a qualified trust service provider in <code>src/server.js</code> (see verifyIdentity) before relying on ID or qualified checks in production.</p>
      <div><button class="btn primary">Save policies</button></div></form></div></div>`;
  pane.querySelector('#enc')?.addEventListener('click', async () => { const r = await api('/api/security/encrypt-legacy', { method: 'POST' }); toast(`Encrypted ${r.encrypted} file(s)`); securityTab(pane); });
  pane.querySelector('#pol').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    const body = { enforce_compliance: f.enforce_compliance.checked ? '1' : '0', allow_recipient_download: f.allow_recipient_download.checked ? '1' : '0',
      min_controls: ['access_code', 'otp', 'id_check'].filter((c) => f['min_' + c].checked), default_jurisdictions: f.default_jurisdictions.value,
      session_idle_hours: f.session_idle_hours.value, data_region: f.data_region.value, idv_provider: f.idv_provider.value, qes_provider: f.qes_provider.value.trim() };
    try { await api('/api/settings', { method: 'PUT', body }); toast('Security policies saved'); } catch (err) { toast(err.message, true); }
  };
}

document.addEventListener('click', (e) => { const a = e.target.closest('[data-href]'); if (a) location.hash = a.dataset.href; });
route();
