// Subscription UI: billing & usage, team, upgrade prompts and the platform owner console.
import { api, esc, icon, toast, modal, fmtDate, confirmBox } from './common.js';

const money = (n, cur) => { const v = Number(n || 0); return (cur === 'USD' ? '$' : '₹') + v.toLocaleString(cur === 'USD' ? 'en-US' : 'en-IN', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }); };
const limit = (v) => (v < 0 ? 'Unlimited' : v);
const STATUS = { trialing: ['Trial', 'b-in_progress'], active: ['Active', 'b-completed'], past_due: ['Payment due', 'b-declined'], expired: ['Expired', 'b-declined'], trial_expired: ['Trial ended', 'b-declined'], suspended: ['Suspended', 'b-declined'], canceled: ['Cancelled', 'b-expired'] };
export const statusBadge = (s) => `<span class="badge ${(STATUS[s] || [s, 'b-draft'])[1]}">${esc((STATUS[s] || [s])[0])}</span>`;

export function upgradeModal(message) {
  const m = modal(`<div class="mh"><h2>Upgrade your plan</h2></div><div class="mb"><p style="margin:0">${esc(message)}</p></div>
    <div class="mf"><button class="btn" data-close>Not now</button><button class="btn primary" id="up">${icon('arrow')} See plans</button></div>`);
  m.el.querySelector('#up').onclick = () => { m.close(); location.hash = '#/billing'; };
}

function meter(label, used, max) {
  const pct = max < 0 ? 4 : Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  const col = max >= 0 && used >= max ? '#b91c1c' : pct > 80 ? '#b45309' : 'var(--primary)';
  return `<div class="stack" style="gap:6px"><div class="row small"><b>${label}</b><span class="spacer"></span><span class="muted">${used} of ${limit(max)}</span></div>
    <div class="meter"><i style="width:${pct}%;background:${col}"></i></div></div>`;
}

export function planCards(plans, { currency, interval, current, features, onPick, cta = 'Choose' }) {
  return `<div class="plans">${plans.map((p) => {
    const price = p[`price_${currency.toLowerCase()}_${interval}`];
    const monthly = interval === 'year' ? price / 12 : price;
    const isCur = current === p.id;
    return `<div class="plan card ${p.highlight ? 'hl' : ''}">
      ${p.highlight ? '<span class="chip plan-tag">Most popular</span>' : ''}
      <h3>${esc(p.name)}</h3><p class="small muted" style="margin:2px 0 10px">${esc(p.tagline || '')}</p>
      <div class="price">${price ? money(Math.round(monthly), currency) : 'Free'}<small>${price ? ' / month' : ''}</small></div>
      <div class="small muted" style="min-height:18px">${price && interval === 'year' ? `${money(price, currency)} billed yearly` : price ? 'billed monthly' : 'forever'}</div>
      <ul class="feat"><li>${limit(p.docs_per_month)} documents / month</li><li>${limit(p.users)} user${p.users === 1 ? '' : 's'}</li><li>${p.templates < 0 ? 'Unlimited' : p.templates} custom templates</li>
        ${p.features.filter((f) => !['compliance', 'sealed', 'templates_library'].includes(f)).map((f) => `<li>${esc(features[f] || f)}</li>`).join('')}</ul>
      ${onPick ? `<button class="btn ${p.highlight ? 'primary' : ''} block" data-plan="${p.id}" ${isCur || !price ? 'disabled' : ''}>${isCur ? 'Current plan' : !price ? 'Included' : cta}</button>` : ''}
    </div>`;
  }).join('')}</div>`;
}

// ---------------------------------------------------------------- billing
export async function billingPage(main, me) {
  const o = await api('/api/org');
  const invoices = await api('/api/billing/invoices');
  let currency = o.details.currency || 'INR', interval = 'year';
  const canManage = (me.permissions || []).includes('billing.manage');
  main.innerHTML = `<div class="topbar"><div><h1>Plan & billing</h1><p class="muted" style="margin:4px 0 0">${esc(o.name)}</p></div></div>
  <div class="content stack" style="gap:16px">
    ${o.testMode ? `<div class="card card-b small" style="border-color:#f59e0b;background:color-mix(in srgb,#f59e0b 10%,var(--surface))">${icon('bell')} <b>Test mode:</b> payments are simulated and no money is charged. The platform owner can connect Razorpay or Stripe in Platform › Payments.</div>` : ''}
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
      <div class="card card-b stack"><div class="row"><h2 style="flex:1">${esc(o.plan.name)} plan</h2>${statusBadge(o.status)}</div>
        <div class="small muted">${o.comped ? 'Complimentary plan — no billing.' : o.status === 'trialing' ? `${o.trialDaysLeft} day(s) left in your free trial. Choose a plan to keep these features.` : ['expired', 'trial_expired'].includes(o.status) ? 'Your paid features are paused. You are on the Free plan until you renew.' : `Renews or ends on ${fmtDate(o.periodEnd, false)}.`}</div>
        ${meter('Documents sent this period', o.usage.docs, o.usage.docsLimit)}${meter('Team members', o.usage.users, o.usage.usersLimit)}${meter('Custom templates', o.usage.templates, o.usage.templatesLimit)}</div>
      <div class="card"><div class="card-h"><h2>Billing details</h2></div><form class="card-b stack" id="bd">
        <label class="field"><span>Company / legal name</span><input type="text" name="name" value="${esc(o.details.name)}" ${canManage ? '' : 'disabled'}></label>
        <div class="row"><label class="field" style="flex:1"><span>Billing email</span><input type="email" name="billing_email" value="${esc(o.details.billing_email || '')}"></label>
          <label class="field" style="flex:1"><span>GSTIN (India, optional)</span><input type="text" name="gstin" value="${esc(o.details.gstin || '')}" maxlength="15"></label></div>
        <label class="field"><span>Billing address</span><input type="text" name="address" value="${esc(o.details.address || '')}"></label>
        <div class="row"><label class="field" style="flex:1"><span>Currency</span><select name="currency"><option ${currency === 'INR' ? 'selected' : ''}>INR</option><option ${currency === 'USD' ? 'selected' : ''}>USD</option></select></label>
          <label class="field" style="flex:1"><span>Country code</span><input type="text" name="country" maxlength="2" value="${esc(o.details.country || 'IN')}"></label></div>
        ${canManage ? '<div><button class="btn primary">Save details</button></div>' : ''}</form></div>
    </div>
    <div class="card"><div class="card-h"><h2 style="flex:1">Plans</h2>
      <div class="seg" id="iv"><button data-v="month">Monthly</button><button data-v="year">Yearly <span class="chip">2 months free</span></button></div>
      <div class="seg" id="cu"><button data-v="INR">₹ INR</button><button data-v="USD">$ USD</button></div></div>
      <div class="card-b" id="plans"></div>
      ${currency === 'INR' ? `<p class="small muted" style="padding:0 18px 16px;margin:0">Prices exclude ${o.taxRate}% GST, added at checkout.</p>` : ''}</div>
    <div class="card"><div class="card-h"><h2>Invoices</h2></div>
      ${invoices.length ? `<table class="tbl"><thead><tr><th>Invoice</th><th>Plan</th><th class="hide-m">Period</th><th>Total</th><th></th></tr></thead><tbody>
      ${invoices.map((i) => `<tr style="cursor:default"><td><b>${esc(i.number)}</b><div class="small muted">${fmtDate(i.created_at, false)}${i.provider === 'test' ? ' · test' : ''}</div></td><td>${esc(i.plan_name)} · ${i.interval === 'year' ? 'yearly' : 'monthly'}</td>
        <td class="hide-m small">${fmtDate(i.period_start, false)} – ${fmtDate(i.period_end, false)}</td><td>${money(i.total, i.currency)}</td><td><a class="btn sm" href="/api/billing/invoices/${i.id}/pdf">${icon('download')} PDF</a></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty small">No invoices yet.</div>'}</div>
  </div>`;
  const drawPlans = () => {
    main.querySelectorAll('#iv button').forEach((b) => b.classList.toggle('on', b.dataset.v === interval));
    main.querySelectorAll('#cu button').forEach((b) => b.classList.toggle('on', b.dataset.v === currency));
    main.querySelector('#plans').innerHTML = planCards(o.plans, { currency, interval, current: o.status === 'active' || o.comped ? o.plan.id : null, features: o.features, onPick: canManage, cta: 'Upgrade' });
    main.querySelectorAll('[data-plan]').forEach((b) => (b.onclick = () => checkout(b.dataset.plan, interval, currency, o, b)));
  };
  main.querySelectorAll('#iv button').forEach((b) => (b.onclick = () => { interval = b.dataset.v; drawPlans(); }));
  main.querySelectorAll('#cu button').forEach((b) => (b.onclick = () => { currency = b.dataset.v; drawPlans(); }));
  drawPlans();
  main.querySelector('#bd').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/api/org', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Billing details saved'); billingPage(main, me); } catch (err) { toast(err.message, true); }
  };
}

let rzpLoading;
const loadRazorpay = () => (rzpLoading ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load Razorpay checkout')); document.head.appendChild(s); }));

async function checkout(planId, interval, currency, o, btn) {
  const plan = o.plans.find((p) => p.id === planId);
  const price = plan[`price_${currency.toLowerCase()}_${interval}`];
  const tax = currency === 'INR' ? Math.round(price * o.taxRate) / 100 : 0;
  const ok = await confirmBox(`Upgrade to ${plan.name}`, `${money(price, currency)}${tax ? ` + ${money(tax, currency)} GST` : ''} for one ${interval}. ${o.testMode && !o.providers[currency] ? '' : ''}`, o.providers[currency] === 'test' ? 'Simulate payment' : 'Continue to payment');
  if (!ok) return;
  btn.disabled = true;
  try {
    const r = await api('/api/billing/checkout', { method: 'POST', body: { plan_id: planId, interval, currency } });
    if (r.provider === 'test') { toast(`${plan.name} plan activated (test payment) · ${r.invoice}`); return location.reload(); }
    if (r.provider === 'stripe') { location.href = r.url; return; }
    await loadRazorpay();
    const rzp = new window.Razorpay({
      key: r.key_id, order_id: r.order_id, amount: r.amount, currency: r.currency, name: r.name, description: r.description, prefill: r.prefill,
      handler: async (resp) => {
        try { const v = await api('/api/billing/razorpay/verify', { method: 'POST', body: { checkout_id: r.checkout_id, ...resp } }); toast(`Payment received · ${v.invoice}`); location.reload(); }
        catch (e) { toast(e.message, true); }
      },
      modal: { ondismiss: () => { btn.disabled = false; } },
    });
    rzp.open();
  } catch (e) { toast(e.message, true); btn.disabled = false; }
}

// ---------------------------------------------------------------- team
export async function teamPage(main, me) {
  const [members, o] = await Promise.all([api('/api/org/members'), api('/api/org')]);
  const canManage = (me.permissions || []).includes('billing.manage');
  main.innerHTML = `<div class="topbar"><div><h1>Team</h1><p class="muted" style="margin:4px 0 0">${o.usage.users} of ${limit(o.usage.usersLimit)} seats used on the ${esc(o.plan.name)} plan</p></div></div>
  <div class="content stack" style="gap:16px"><div class="card"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th class="hide-m">Joined</th><th></th></tr></thead><tbody>
    ${members.map((u) => `<tr style="cursor:default"><td>${esc(u.name)}</td><td class="small">${esc(u.email)}</td><td><span class="chip">${esc(u.org_role || 'member')}</span></td><td class="hide-m small muted">${fmtDate(u.created_at, false)}</td>
      <td>${canManage && u.id !== me.id && u.org_role !== 'owner' ? `<button class="btn sm ghost danger" data-del="${u.id}">${icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
    ${canManage ? `<div class="card"><div class="card-h"><h2>Add a team member</h2></div><form class="card-b stack" id="f" style="max-width:480px">
      <label class="field"><span>Name</span><input type="text" name="name" required></label><label class="field"><span>Email</span><input type="email" name="email" required></label>
      <label class="field"><span>Temporary password</span><input type="text" name="password" required minlength="10" placeholder="At least 10 characters with a number"></label>
      <label class="field"><span>Role</span><select name="role"><option value="member">Member — sends own documents</option><option value="admin">Admin — also manages billing and team</option></select></label>
      <div><button class="btn primary">Add member</button></div></form></div>` : ''}</div>`;
  main.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (await confirmBox('Remove member?', 'Their documents are deleted with their account.', 'Remove', true)) { await api(`/api/org/members/${b.dataset.del}`, { method: 'DELETE' }); teamPage(main, me); } }));
  main.querySelector('#f')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/org/members', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Member added. Share their temporary password with them securely.'); teamPage(main, me); }
    catch (err) { if (!err.upgrade) toast(err.message, true); }
  });
}

// ---------------------------------------------------------------- platform owner console
export async function platformPage(main, tab = 'overview') {
  main.innerHTML = `<div class="topbar"><div><h1>Platform</h1><p class="muted" style="margin:4px 0 0">Run your e-signature business: customers, plans, payments and revenue.</p></div></div>
  <div class="content"><div class="tabs">${[['overview', 'Overview'], ['customers', 'Customers'], ['plans', 'Plans & pricing'], ['payments', 'Payments & tax'], ['invoices', 'Invoices'], ['website', 'Website & enquiries'], ['privacy', 'Private access']].map(([k, l]) => `<a href="#/platform/${k}" class="${tab === k ? 'active' : ''}">${l}</a>`).join('')}</div><div id="pp"></div></div>`;
  const box = main.querySelector('#pp');
  if (tab === 'overview') {
    const ov = await api('/api/platform/overview');
    box.innerHTML = `<div class="stats">
      ${[['MRR', `${money(ov.mrr.INR, 'INR')}${ov.mrr.USD ? ` + ${money(ov.mrr.USD, 'USD')}` : ''}`], ['Paying customers', ov.paying], ['On trial', ov.trialing], ['Lapsed', ov.expired], ['Revenue (30 days)', `${money(ov.revenue30.INR, 'INR')}${ov.revenue30.USD ? ` + ${money(ov.revenue30.USD, 'USD')}` : ''}`], ['New sign-ups (30 days)', ov.signups30], ['Documents sent this month', ov.docsThisMonth], ['Workspaces', ov.orgs]]
        .map(([l, v]) => `<div class="card stat" style="cursor:default"><div><div class="n" style="font-size:20px">${v}</div><div class="small muted">${l}</div></div></div>`).join('')}</div>
      <div class="card card-b" style="margin-top:16px"><h2 style="margin-bottom:12px">Workspaces by plan</h2>${Object.entries(ov.planCounts).map(([p, n]) => `<div class="row small" style="margin:6px 0"><span style="width:110px;text-transform:capitalize">${esc(p)}</span><div class="meter" style="flex:1"><i style="width:${ov.orgs ? (n / ov.orgs) * 100 : 0}%;background:var(--primary)"></i></div><b style="width:30px;text-align:right">${n}</b></div>`).join('')}
      <p class="small muted" style="margin:12px 0 0">MRR uses each customer's latest invoice (yearly ÷ 12), including test-mode payments. Revenue excludes test payments.</p></div>`;
  } else if (tab === 'customers') {
    const draw = async (q = '') => {
      const [rows, plans] = await Promise.all([api(`/api/platform/orgs?q=${encodeURIComponent(q)}`), api('/api/platform/plans')]);
      box.querySelector('#cl').innerHTML = `<table class="tbl"><thead><tr><th>Workspace</th><th>Plan</th><th>Status</th><th class="hide-m">Usage</th><th class="hide-m">Renews / ends</th><th></th></tr></thead><tbody>
        ${rows.map((o) => `<tr style="cursor:default"><td><b>${esc(o.name)}</b><div class="small muted">${esc(o.owner?.email || '')}</div></td><td>${esc(o.plan.name)}${o.comped ? ' <span class="chip">comped</span>' : ''}</td><td>${statusBadge(o.status)}</td>
          <td class="hide-m small">${o.usage.docs}/${limit(o.usage.docsLimit)} docs · ${o.usage.users} users</td><td class="hide-m small">${fmtDate(o.status === 'trialing' ? o.trial_ends_at : o.current_period_end, false)}</td>
          <td><button class="btn sm" data-edit="${o.id}">Manage</button></td></tr>`).join('')}</tbody></table>`;
      box.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => {
        const o = rows.find((x) => x.id === Number(b.dataset.edit));
        const m = modal(`<div class="mh"><h2>${esc(o.name)}</h2></div><div class="mb stack">
          <label class="field"><span>Plan</span><select id="pl">${plans.plans.map((p) => `<option value="${p.id}" ${p.id === o.plan_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Status</span><select id="st">${['active', 'trialing', 'suspended', 'canceled'].map((s) => `<option ${s === o.raw_status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          <label class="field"><span>Extend paid period by (days)</span><input type="number" id="ex" min="0" value="0"></label>
          <label class="check"><input type="checkbox" id="cp" ${o.comped ? 'checked' : ''}> Complimentary (never billed)</label></div>
          <div class="mf"><button class="btn" data-close>Cancel</button><button class="btn primary" id="sv">Save</button></div>`);
        m.el.querySelector('#sv').onclick = async () => {
          try { await api(`/api/platform/orgs/${o.id}`, { method: 'PUT', body: { plan_id: m.el.querySelector('#pl').value, status: m.el.querySelector('#st').value, extend_days: Number(m.el.querySelector('#ex').value) || 0, comped: m.el.querySelector('#cp').checked } }); m.close(); toast('Workspace updated'); draw(q); }
          catch (e) { toast(e.message, true); }
        };
      }));
    };
    box.innerHTML = `<div class="row" style="margin-bottom:12px"><input type="text" id="q" placeholder="Search workspace or email" style="max-width:300px"></div><div class="card" id="cl"></div>`;
    let t; box.querySelector('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => draw(e.target.value), 250); };
    draw();
  } else if (tab === 'plans') {
    const { plans, features } = await api('/api/platform/plans');
    box.innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">${plans.map((p) => `<form class="card card-b stack" data-id="${p.id}">
      <div class="row"><input type="text" name="name" value="${esc(p.name)}" style="font-weight:700"><label class="check small"><input type="checkbox" name="highlight" ${p.highlight ? 'checked' : ''}> Highlight</label></div>
      <input type="text" name="tagline" value="${esc(p.tagline || '')}" placeholder="Tagline">
      <div class="row"><label class="field" style="flex:1"><span>₹ / month</span><input type="number" name="price_inr_month" value="${p.price_inr_month}"></label><label class="field" style="flex:1"><span>₹ / year</span><input type="number" name="price_inr_year" value="${p.price_inr_year}"></label></div>
      <div class="row"><label class="field" style="flex:1"><span>$ / month</span><input type="number" name="price_usd_month" value="${p.price_usd_month}"></label><label class="field" style="flex:1"><span>$ / year</span><input type="number" name="price_usd_year" value="${p.price_usd_year}"></label></div>
      <div class="row"><label class="field" style="flex:1"><span>Docs / month</span><input type="number" name="docs_per_month" value="${p.docs_per_month}"></label><label class="field" style="flex:1"><span>Users</span><input type="number" name="users" value="${p.users}"></label><label class="field" style="flex:1"><span>Templates</span><input type="number" name="templates" value="${p.templates}"></label></div>
      <div class="small muted">-1 means unlimited</div>
      <div class="stack" style="gap:4px">${Object.entries(features).map(([k, l]) => `<label class="check small"><input type="checkbox" name="f_${k}" ${p.features.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>
      <div class="row"><label class="check small" style="flex:1"><input type="checkbox" name="active" ${p.active ? 'checked' : ''} ${p.id === 'free' ? 'disabled' : ''}> Offered to customers</label><button class="btn primary sm">Save ${esc(p.name)}</button></div></form>`).join('')}</div>`;
    box.querySelectorAll('form').forEach((f) => (f.onsubmit = async (e) => {
      e.preventDefault();
      const body = { features: Object.keys(features).filter((k) => f[`f_${k}`].checked), highlight: f.highlight.checked, active: f.active.checked };
      for (const k of ['name', 'tagline', 'price_inr_month', 'price_inr_year', 'price_usd_month', 'price_usd_year', 'docs_per_month', 'users', 'templates']) body[k] = f[k].value;
      try { await api(`/api/platform/plans/${f.dataset.id}`, { method: 'PUT', body }); toast(`${body.name} plan saved`); } catch (err) { toast(err.message, true); }
    }));
  } else if (tab === 'payments') {
    const s = await api('/api/settings');
    box.innerHTML = `<form class="stack" id="pf" style="gap:16px">
      <div class="card"><div class="card-h"><h2>Payment gateways</h2></div><div class="card-b stack" style="max-width:620px">
        <label class="check"><input type="checkbox" name="billing_test_mode" ${s.billing_test_mode === '1' ? 'checked' : ''}> Test mode — simulate payments when no gateway is connected</label>
        <h3>Razorpay (INR: UPI, cards, net banking)</h3>
        <div class="row"><label class="field" style="flex:1"><span>Key ID</span><input type="text" name="razorpay_key_id" value="${esc(s.razorpay_key_id || '')}" placeholder="rzp_live_..."></label><label class="field" style="flex:1"><span>Key secret</span><input type="password" name="razorpay_key_secret" value="${esc(s.razorpay_key_secret || '')}"></label></div>
        <label class="field"><span>Webhook secret</span><input type="password" name="razorpay_webhook_secret" value="${esc(s.razorpay_webhook_secret || '')}"></label>
        <div class="small muted">Webhook URL: <code>${location.origin}/api/billing/webhooks/razorpay</code> · events: payment.captured, order.paid</div>
        <h3>Stripe (USD and international cards)</h3>
        <div class="row"><label class="field" style="flex:1"><span>Secret key</span><input type="password" name="stripe_secret_key" value="${esc(s.stripe_secret_key || '')}" placeholder="sk_live_..."></label><label class="field" style="flex:1"><span>Webhook signing secret</span><input type="password" name="stripe_webhook_secret" value="${esc(s.stripe_webhook_secret || '')}" placeholder="whsec_..."></label></div>
        <div class="small muted">Webhook URL: <code>${location.origin}/api/billing/webhooks/stripe</code> · event: checkout.session.completed</div></div></div>
      <div class="card"><div class="card-h"><h2>Trials, tax and invoices</h2></div><div class="card-b stack" style="max-width:620px">
        <div class="row"><label class="field" style="flex:1"><span>Free trial (days)</span><input type="number" name="trial_days" value="${esc(s.trial_days)}"></label><label class="field" style="flex:1"><span>Trial plan</span><select name="trial_plan">${['starter', 'business', 'enterprise'].map((p) => `<option ${s.trial_plan === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
          <label class="field" style="flex:1"><span>Default currency</span><select name="default_currency"><option ${s.default_currency === 'INR' ? 'selected' : ''}>INR</option><option ${s.default_currency === 'USD' ? 'selected' : ''}>USD</option></select></label></div>
        <div class="row"><label class="field" style="flex:1"><span>GST rate on INR (%)</span><input type="number" name="tax_rate_inr" value="${esc(s.tax_rate_inr)}"></label><label class="field" style="flex:1"><span>Invoice prefix</span><input type="text" name="invoice_prefix" value="${esc(s.invoice_prefix)}"></label><label class="field" style="flex:1"><span>SAC code</span><input type="text" name="invoice_sac" value="${esc(s.invoice_sac || '')}"></label></div>
        <label class="field"><span>Your legal business name</span><input type="text" name="seller_name" value="${esc(s.seller_name || '')}"></label>
        <div class="row"><label class="field" style="flex:1"><span>Your GSTIN</span><input type="text" name="seller_gstin" value="${esc(s.seller_gstin || '')}"></label><label class="field" style="flex:1"><span>Billing support email</span><input type="email" name="seller_email" value="${esc(s.seller_email || '')}"></label></div>
        <label class="field"><span>Registered address</span><input type="text" name="seller_address" value="${esc(s.seller_address || '')}"></label>
        <div><button class="btn primary">Save payment settings</button></div></div></div></form>`;
    box.querySelector('#pf').onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target)); body.billing_test_mode = e.target.billing_test_mode.checked ? '1' : '0';
      try { await api('/api/settings', { method: 'PUT', body }); toast('Payment settings saved'); } catch (err) { toast(err.message, true); }
    };
  } else if (tab === 'website') {
    await websiteTab(box);
  } else if (tab === 'privacy') {
    await privacyTab(box);
  } else {
    const rows = await api('/api/platform/invoices');
    box.innerHTML = `<div class="card">${rows.length ? `<table class="tbl"><thead><tr><th>Invoice</th><th>Customer</th><th>Plan</th><th>Total</th><th class="hide-m">Via</th><th></th></tr></thead><tbody>
      ${rows.map((i) => `<tr style="cursor:default"><td><b>${esc(i.number)}</b><div class="small muted">${fmtDate(i.created_at, false)}</div></td><td>${esc(i.org_name)}</td><td>${esc(i.plan_name)} · ${i.interval}</td><td>${money(i.total, i.currency)}</td><td class="hide-m small">${esc(i.provider)}</td><td><a class="btn sm" href="/api/billing/invoices/${i.id}/pdf">${icon('download')}</a></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No invoices yet.</div>'}</div>`;
  }
}

// ---------------------------------------------------------------- platform: public website & enquiries
const LEAD_ST = { new: ['New', 'var(--warn, #b45309)'], contacted: ['Contacted', 'var(--primary)'], won: ['Customer', 'var(--ok, #15803d)'], closed: ['Closed', 'var(--muted)'] };
async function websiteTab(box) {
  const [cfg, leads] = await Promise.all([api('/api/platform/site'), api('/api/platform/leads')]);
  const newCount = leads.filter((l) => l.status === 'new').length;
  box.innerHTML = `<div class="stack" style="gap:16px">
    <div class="card card-b row wrap" style="gap:12px"><div style="flex:1;min-width:220px"><h2 style="margin:0">Your public website</h2><p class="small muted" style="margin:4px 0 0">Home, Features, Solutions, Templates, Security, Compliance, Pricing, Contact, Terms and Privacy. Prices and plans update automatically.</p></div>
      <a class="btn" href="/" target="_blank" rel="noopener">${icon('eye')} Open website</a><a class="btn" href="/sitemap.xml" target="_blank" rel="noopener">Sitemap</a></div>
    <div class="card"><div class="card-h row"><h2 style="flex:1;margin:0">Enquiries ${newCount ? `<span class="chip">${newCount} new</span>` : ''}</h2>${leads.length ? '<a class="btn sm" href="/api/platform/leads.csv">Export CSV</a>' : ''}</div>
      ${leads.length ? `<table class="tbl"><thead><tr><th>From</th><th>Topic</th><th class="hide-m">Received</th><th>Status</th><th></th></tr></thead><tbody>${leads.map((l) => `<tr style="cursor:default"><td><b>${esc(l.name)}</b><div class="small muted">${esc(l.email)}${l.company ? ` · ${esc(l.company)}` : ''}</div></td><td class="small">${esc(l.topic_label)}${l.size ? `<div class="muted">${esc(l.size)}</div>` : ''}</td><td class="hide-m small">${fmtDate(l.created_at)}</td>
        <td><span class="badge" style="color:${LEAD_ST[l.status][1]};border-color:currentColor">${LEAD_ST[l.status][0]}</span></td><td><button class="btn sm" data-lead="${l.id}">Open</button></td></tr>`).join('')}</tbody></table>`
        : '<div class="card-b muted small">No enquiries yet. They arrive here (and by email) when someone uses the Contact page.</div>'}</div>
    <form class="card card-b stack" id="wsf"><h2 style="margin:0">Contact details on the website</h2><p class="small muted" style="margin:0">Shown in the footer, on the Contact page and in the Terms and Privacy pages. Enquiry notifications go to the contact email.</p>
      <div class="grid2">
        <label class="field"><span>Company / legal name</span><input type="text" name="site_company" value="${esc(cfg.site_company)}" placeholder="e.g. Vamshi Technologies Pvt. Ltd."></label>
        <label class="field"><span>Contact email</span><input name="site_email" type="email" value="${esc(cfg.site_email)}" placeholder="sales@yourdomain.com"></label>
        <label class="field"><span>Phone</span><input type="text" name="site_phone" value="${esc(cfg.site_phone)}" placeholder="+91 90000 00000"></label>
        <label class="field"><span>WhatsApp number</span><input type="text" name="site_whatsapp" value="${esc(cfg.site_whatsapp)}" placeholder="+91 90000 00000"></label>
        <label class="field"><span>Address</span><input type="text" name="site_address" value="${esc(cfg.site_address)}"></label>
        <label class="field"><span>City for legal jurisdiction</span><input type="text" name="site_city" value="${esc(cfg.site_city)}" placeholder="Hyderabad"></label></div>
      <div><button class="btn primary">Save contact details</button></div></form>
    <form class="card card-b stack" id="lgf"><h2 style="margin:0">Terms and privacy policy</h2>
      <p class="small muted" style="margin:0">A starting draft is used until you write your own. Have a lawyer review both before you take payments. Use “## ” at the start of a line for headings; {{brand}}, {{company}}, {{email}} and {{city}} are filled in automatically.</p>
      <label class="field"><span>Terms of service</span><textarea name="site_terms" rows="10" style="font-family:ui-monospace,monospace;font-size:13px">${esc(cfg.site_terms || cfg.defaults.terms)}</textarea></label>
      <label class="field"><span>Privacy policy</span><textarea name="site_privacy" rows="10" style="font-family:ui-monospace,monospace;font-size:13px">${esc(cfg.site_privacy || cfg.defaults.privacy)}</textarea></label>
      <div class="row"><button class="btn primary">Save legal pages</button><a class="btn ghost" href="/terms" target="_blank" rel="noopener">View terms</a><a class="btn ghost" href="/privacy" target="_blank" rel="noopener">View privacy</a></div></form></div>`;
  const save = (id, msg) => (box.querySelector(id).onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/api/platform/site', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast(msg); } catch (err) { toast(err.message, true); }
  });
  save('#wsf', 'Contact details saved'); save('#lgf', 'Legal pages saved');
  box.querySelectorAll('[data-lead]').forEach((b) => (b.onclick = () => {
    const l = leads.find((x) => x.id === Number(b.dataset.lead));
    const m = modal(`<div class="mh"><h2>${esc(l.name)}</h2></div><div class="mb stack">
      <div class="small"><div><a href="mailto:${esc(l.email)}">${esc(l.email)}</a>${l.phone ? ` · <a href="tel:${esc(l.phone)}">${esc(l.phone)}</a>` : ''}</div><div class="muted">${esc(l.company || 'No company given')} · ${esc(l.size || '')} · ${esc(l.topic_label)}</div><div class="muted">${fmtDate(l.created_at)}${l.ip ? ` · IP ${esc(l.ip)}` : ''}</div></div>
      <div class="card card-b small" style="white-space:pre-wrap">${esc(l.message || '(no message)')}</div>
      <label class="field"><span>Status</span><select id="ls">${Object.entries(LEAD_ST).map(([k, [n]]) => `<option value="${k}" ${k === l.status ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field"><span>Notes (only you see these)</span><textarea id="ln" rows="3">${esc(l.notes || '')}</textarea></label></div>
      <div class="mf"><button class="btn danger" id="ld">Delete</button><span style="flex:1"></span><a class="btn" href="mailto:${esc(l.email)}?subject=${encodeURIComponent('Re: your enquiry')}">${icon('mail')} Reply</a><button class="btn primary" id="lsv">Save</button></div>`);
    m.el.querySelector('#lsv').onclick = async () => { try { await api(`/api/platform/leads/${l.id}`, { method: 'PUT', body: { status: m.el.querySelector('#ls').value, notes: m.el.querySelector('#ln').value } }); m.close(); toast('Enquiry updated'); websiteTab(box); } catch (e) { toast(e.message, true); } };
    m.el.querySelector('#ld').onclick = async () => { if (!(await confirmBox('Delete this enquiry?', 'This cannot be undone.', 'Delete', true))) return; await api(`/api/platform/leads/${l.id}`, { method: 'DELETE' }); m.close(); websiteTab(box); };
  }));
}

// ---------------------------------------------------------------- platform: private access
async function privacyTab(box) {
  const p = await api('/api/platform/privacy');
  const lockNote = (on) => (on ? '<div class="small muted">Set on the server (.env) and can only be changed there.</div>' : '');
  box.innerHTML = `<form class="stack" id="pvf" style="gap:16px">
    <div class="card card-b stack">
      <div class="row wrap" style="gap:12px"><div style="flex:1;min-width:240px"><h2 style="margin:0">Private platform</h2>
        <p class="small muted" style="margin:4px 0 0">Keep this platform for your own organisation. The public website, pricing and contact form are switched off and replaced by a sign-in page. Search engines are told not to index anything. Nobody can sign up; people join only by invitation. External signers can still open the signing links you send them.</p></div>
        <label class="check" style="font-weight:650"><input type="checkbox" name="private_mode" ${p.private_mode ? 'checked' : ''} ${p.private_locked ? 'disabled' : ''}> Private</label></div>
      ${lockNote(p.private_locked)}</div>
    <div class="card card-b stack"><h2 style="margin:0">Allowed email domains</h2>
      <p class="small muted" style="margin:0">Only these domains can be invited or have accounts, for example <code>yourcompany.com</code>. Sub-domains are included. Leave empty to allow any address.</p>
      <input type="text" name="allowed_email_domains" value="${esc(p.allowed_email_domains)}" placeholder="yourcompany.com, yourgroup.in" ${p.domains_locked ? 'disabled' : ''}>${lockNote(p.domains_locked)}</div>
    <div class="card card-b stack"><h2 style="margin:0">Office / VPN network only</h2>
      <p class="small muted" style="margin:0">If set, the app and API only answer from these IP addresses or ranges (one per line, e.g. <code>203.0.113.10</code> or <code>203.0.113.0/24</code>). Signing links, the verify page and payment webhooks stay reachable for outside signers. Your current IP is <b>${esc(p.your_ip)}</b>.</p>
      <textarea name="platform_ip_allowlist" rows="4" style="font-family:ui-monospace,monospace" ${p.ip_locked ? 'disabled' : ''}>${esc(p.platform_ip_allowlist)}</textarea>${lockNote(p.ip_locked)}
      <p class="small muted" style="margin:0">Locked out? On the server run <code>docker compose exec signflow node scripts/admin.js platform-open</code>.</p></div>
    <div><button class="btn primary">Save private access settings</button></div></form>`;
  box.querySelector('#pvf').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = {};
    if (!f.private_mode.disabled) body.private_mode = f.private_mode.checked;
    if (!f.allowed_email_domains.disabled) body.allowed_email_domains = f.allowed_email_domains.value;
    if (!f.platform_ip_allowlist.disabled) body.platform_ip_allowlist = f.platform_ip_allowlist.value;
    if (body.private_mode && !p.private_mode && !(await confirmBox('Make the platform private?', 'The public website, pricing page and sign-ups will be switched off. Existing customers keep their accounts. You can switch it back at any time.', 'Make private'))) return;
    try { await api('/api/platform/privacy', { method: 'PUT', body }); toast('Private access settings saved'); privacyTab(box); } catch (err) { toast(err.message, true); }
  };
}
