/*
 * Subscription layer: organisations, plans, usage limits, checkout (Razorpay / Stripe / test mode),
 * activation, GST-ready invoices and renewal reminders.
 */
const crypto = require('crypto');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { db, getSettings, setSetting } = require('../db');
const { clean } = require('../pdf');

// ---------------------------------------------------------------- schema
db.exec(`
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  plan_id TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  comped INTEGER DEFAULT 0,
  trial_ends_at TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  billing_interval TEXT,
  billing_email TEXT,
  gstin TEXT, address TEXT, country TEXT DEFAULT 'IN', currency TEXT DEFAULT 'INR',
  reminded_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tagline TEXT,
  price_inr_month INTEGER DEFAULT 0, price_inr_year INTEGER DEFAULT 0,
  price_usd_month INTEGER DEFAULT 0, price_usd_year INTEGER DEFAULT 0,
  docs_per_month INTEGER DEFAULT 3,
  users INTEGER DEFAULT 1,
  templates INTEGER DEFAULT 2,
  features TEXT DEFAULT '[]',
  highlight INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS checkouts (
  id TEXT PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER,
  plan_id TEXT NOT NULL, interval TEXT NOT NULL, currency TEXT NOT NULL,
  amount INTEGER NOT NULL, tax INTEGER NOT NULL, total INTEGER NOT NULL,
  provider TEXT NOT NULL, provider_ref TEXT, payment_ref TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  created_at TEXT DEFAULT (datetime('now')), paid_at TEXT
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  checkout_id TEXT,
  plan_id TEXT, plan_name TEXT, interval TEXT,
  currency TEXT, amount INTEGER, tax INTEGER, tax_rate REAL, total INTEGER,
  period_start TEXT, period_end TEXT,
  provider TEXT, payment_ref TEXT,
  buyer_json TEXT, seller_json TEXT,
  status TEXT DEFAULT 'paid',
  created_at TEXT DEFAULT (datetime('now'))
);
`);
for (const [t, c] of [['users', 'org_id INTEGER'], ['users', "org_role TEXT DEFAULT 'owner'"]]) {
  try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${c}`); } catch (e) { if (!/duplicate column/.test(e.message)) throw e; }
}

const FEATURES = {
  compliance: 'Compliance checks for 30 countries',
  sealed: 'Sealed PDFs and tamper-proof audit trail',
  templates_library: '19 ready-made document templates',
  access_code: 'Access codes for signers',
  otp: 'Email one-time codes for signers',
  reminders: 'Reminders and signing order',
  id_check: 'Government ID verification',
  custom_templates: 'Your own templates',
  team: 'Team workspace',
  branding: 'Your brand on emails and signing pages',
  qes: 'Qualified signatures (with your trust provider)',
  priority_support: 'Priority support',
};
const CONTROL_FEATURE = { access_code: 'access_code', otp: 'otp', id_check: 'id_check', qes: 'qes' };

const DEFAULT_PLANS = [
  { id: 'free', name: 'Free', tagline: 'Try it out', price_inr_month: 0, price_inr_year: 0, price_usd_month: 0, price_usd_year: 0, docs_per_month: 3, users: 1, templates: 2, sort: 0,
    features: ['compliance', 'sealed', 'templates_library'] },
  { id: 'starter', name: 'Starter', tagline: 'For freelancers and small teams', price_inr_month: 499, price_inr_year: 4990, price_usd_month: 9, price_usd_year: 90, docs_per_month: 25, users: 3, templates: 10, sort: 1,
    features: ['compliance', 'sealed', 'templates_library', 'access_code', 'otp', 'reminders', 'custom_templates', 'team'] },
  { id: 'business', name: 'Business', tagline: 'For growing companies and HR teams', price_inr_month: 1499, price_inr_year: 14990, price_usd_month: 29, price_usd_year: 290, docs_per_month: 150, users: 15, templates: -1, sort: 2, highlight: 1,
    features: ['compliance', 'sealed', 'templates_library', 'access_code', 'otp', 'reminders', 'custom_templates', 'team', 'id_check', 'branding'] },
  { id: 'enterprise', name: 'Enterprise', tagline: 'Regulated industries and high volume', price_inr_month: 4999, price_inr_year: 49990, price_usd_month: 99, price_usd_year: 990, docs_per_month: -1, users: 100, templates: -1, sort: 3,
    features: Object.keys(FEATURES) },
];
const insPlan = db.prepare(`INSERT OR IGNORE INTO plans (id, name, tagline, price_inr_month, price_inr_year, price_usd_month, price_usd_year, docs_per_month, users, templates, features, highlight, sort)
  VALUES (@id, @name, @tagline, @price_inr_month, @price_inr_year, @price_usd_month, @price_usd_year, @docs_per_month, @users, @templates, @features, @highlight, @sort)`);
for (const p of DEFAULT_PLANS) insPlan.run({ highlight: 0, ...p, features: JSON.stringify(p.features) });

const DEFAULT_BILLING_SETTINGS = {
  billing_test_mode: '1', trial_days: '14', trial_plan: 'business', default_currency: 'INR', tax_rate_inr: '18', tax_label_inr: 'GST',
  invoice_prefix: 'INV', invoice_sac: '', seller_name: '', seller_gstin: '', seller_address: '', seller_email: '',
  razorpay_key_id: '', razorpay_key_secret: '', razorpay_webhook_secret: '', stripe_secret_key: '', stripe_webhook_secret: '',
};
for (const [k, v] of Object.entries(DEFAULT_BILLING_SETTINGS)) db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(k, v);
const SECRET_KEYS = ['razorpay_key_secret', 'razorpay_webhook_secret', 'stripe_secret_key', 'stripe_webhook_secret'];

// ---------------------------------------------------------------- helpers
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const toDate = (s) => (s ? new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z')) : null);
const iso = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const planById = (id) => { const p = db.prepare('SELECT * FROM plans WHERE id = ?').get(id) || db.prepare("SELECT * FROM plans WHERE id = 'free'").get(); return { ...p, features: parse(p.features, []) }; };
const listPlans = (all = false) => db.prepare(`SELECT * FROM plans ${all ? '' : 'WHERE active = 1'} ORDER BY sort`).all().map((p) => ({ ...p, features: parse(p.features, []) }));

function createOrg({ name, ownerId, platformOwner, email }) {
  const s = getSettings();
  const trialEnd = iso(new Date(Date.now() + (Number(s.trial_days) || 14) * 864e5));
  const id = platformOwner
    ? db.prepare("INSERT INTO organizations (name, plan_id, status, comped, billing_email) VALUES (?, 'enterprise', 'active', 1, ?)").run(name, email).lastInsertRowid
    : db.prepare("INSERT INTO organizations (name, plan_id, status, trial_ends_at, billing_email) VALUES (?, ?, 'trialing', ?, ?)").run(name, s.trial_plan || 'business', trialEnd, email).lastInsertRowid;
  if (ownerId) db.prepare("UPDATE users SET org_id = ?, org_role = 'owner' WHERE id = ?").run(id, ownerId);
  return id;
}

/** Give every legacy user an organisation (runs at start-up). */
function migrateUsers() {
  for (const u of db.prepare('SELECT * FROM users WHERE org_id IS NULL').all()) createOrg({ name: `${u.name}'s workspace`, ownerId: u.id, platformOwner: !!u.is_admin, email: u.email });
}

/** The plan an organisation can use right now, its status, and its usage window. */
function orgState(orgId) {
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId);
  if (!org) return null;
  const t = Date.now();
  let status = org.status, plan = planById(org.plan_id), periodStart, periodEnd;
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const nextMonth = new Date(monthStart); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  if (org.status === 'suspended') { plan = planById('free'); }
  else if (org.comped) { status = 'active'; }
  else if (org.status === 'trialing') {
    if (toDate(org.trial_ends_at) > t) { periodEnd = org.trial_ends_at; }
    else { status = 'trial_expired'; plan = planById('free'); }
  } else if (org.status === 'active' && org.plan_id !== 'free') {
    const end = toDate(org.current_period_end);
    if (end && end.getTime() + 3 * 864e5 > t) { periodStart = org.current_period_start; periodEnd = org.current_period_end; if (end < t) status = 'past_due'; }
    else { status = 'expired'; plan = planById('free'); }
  }
  periodStart = periodStart || iso(monthStart);
  periodEnd = periodEnd || iso(nextMonth);
  const memberIds = db.prepare('SELECT id FROM users WHERE org_id = ?').all(org.id).map((r) => r.id);
  const ph = memberIds.map(() => '?').join(',') || 'NULL';
  const docsUsed = memberIds.length ? db.prepare(`SELECT COUNT(*) c FROM documents WHERE owner_id IN (${ph}) AND sent_at >= ?`).get(...memberIds, periodStart).c : 0;
  const templatesUsed = db.prepare('SELECT COUNT(*) c FROM templates WHERE builtin = 0 AND org_id = ?').get(org.id).c;
  const trialDaysLeft = org.status === 'trialing' ? Math.max(0, Math.ceil((toDate(org.trial_ends_at) - t) / 864e5)) : null;
  return {
    org, plan, status, trialDaysLeft, periodStart, periodEnd,
    usage: { docs: docsUsed, docsLimit: plan.docs_per_month, users: memberIds.length, usersLimit: plan.users, templates: templatesUsed, templatesLimit: plan.templates },
  };
}
const has = (state, feature) => state.plan.features.includes(feature);
const nextPlanWith = (feature) => listPlans().find((p) => p.features.includes(feature))?.name || 'a higher';

/** Throws a friendly 402 error when the plan doesn't allow an action. */
function assertCan(state, action, extra) {
  const err = (msg) => { const e = new Error(msg); e.status = 402; e.upgrade = true; throw e; };
  if (state.org.status === 'suspended') err('This workspace is suspended. Contact support.');
  if (action === 'send') {
    const { docs, docsLimit } = state.usage;
    if (docsLimit >= 0 && docs >= docsLimit) err(`You've sent ${docs} of ${docsLimit} documents allowed this period on the ${state.plan.name} plan. Upgrade to send more.`);
    for (const c of extra || []) {
      const f = CONTROL_FEATURE[c];
      if (f && !has(state, f)) err(`${FEATURES[f]} is available on the ${nextPlanWith(f)} plan.`);
    }
  }
  if (action === 'template') {
    if (!has(state, 'custom_templates')) err(`Custom templates are available on the ${nextPlanWith('custom_templates')} plan.`);
    const { templates, templatesLimit } = state.usage;
    if (templatesLimit >= 0 && templates >= templatesLimit) err(`Your plan allows ${templatesLimit} custom templates. Upgrade for more.`);
  }
  if (action === 'member') {
    if (!has(state, 'team')) err(`Team members are available on the ${nextPlanWith('team')} plan.`);
    const { users, usersLimit } = state.usage;
    if (usersLimit >= 0 && users >= usersLimit) err(`Your plan includes ${usersLimit} users. Upgrade to add more.`);
  }
}

// ---------------------------------------------------------------- pricing & checkout
function priceFor(plan, interval, currency) {
  const amount = plan[`price_${currency.toLowerCase()}_${interval}`] || 0;
  const s = getSettings();
  const rate = currency === 'INR' ? Number(s.tax_rate_inr) || 0 : 0;
  const tax = Math.round(amount * rate) / 100;
  return { amount, tax, total: Math.round((amount + tax) * 100) / 100, rate };
}
function providerFor(currency) {
  const s = getSettings();
  if (currency === 'INR' && s.razorpay_key_id && s.razorpay_key_secret) return 'razorpay';
  if (s.stripe_secret_key) return 'stripe';
  if (s.billing_test_mode === '1') return 'test';
  return null;
}

async function razorpayCreateOrder(c) {
  const s = getSettings();
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${s.razorpay_key_id}:${s.razorpay_key_secret}`).toString('base64') },
    body: JSON.stringify({ amount: Math.round(c.total * 100), currency: c.currency, receipt: c.id.slice(0, 40), notes: { org_id: String(c.org_id), plan_id: c.plan_id, interval: c.interval } }),
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(`Razorpay: ${j.error?.description || r.status}`), { status: 502 });
  return j.id;
}
async function stripeCreateSession(c, base, planName, email) {
  const s = getSettings();
  const form = new URLSearchParams({
    mode: 'payment', client_reference_id: c.id, customer_email: email || '',
    success_url: `${base}/billing/return?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${base}/app#/billing`,
    'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': c.currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]': String(Math.round(c.total * 100)),
    'line_items[0][price_data][product_data][name]': `${s.brand_name} ${planName} — ${c.interval === 'year' ? 'yearly' : 'monthly'}`,
    'metadata[checkout_id]': c.id, 'metadata[org_id]': String(c.org_id),
  });
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${s.stripe_secret_key}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(`Stripe: ${j.error?.message || r.status}`), { status: 502 });
  return { id: j.id, url: j.url };
}
async function stripeGetSession(id) {
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${getSettings().stripe_secret_key}` } });
  return r.json();
}

/** Start a checkout. Returns what the browser needs to collect payment. */
async function startCheckout({ state, user, planId, interval, currency, base }) {
  const plan = planById(planId);
  if (plan.id !== planId || plan.id === 'free' || !plan.active) throw Object.assign(new Error('Choose a paid plan'), { status: 400 });
  if (!['month', 'year'].includes(interval)) throw Object.assign(new Error('Choose monthly or yearly billing'), { status: 400 });
  if (!['INR', 'USD'].includes(currency)) throw Object.assign(new Error('Unsupported currency'), { status: 400 });
  const provider = providerFor(currency);
  if (!provider) throw Object.assign(new Error('Online payments are not set up yet. Please contact the platform owner.'), { status: 503 });
  const p = priceFor(plan, interval, currency);
  const c = { id: crypto.randomUUID(), org_id: state.org.id, user_id: user.id, plan_id: plan.id, interval, currency, amount: p.amount, tax: p.tax, total: p.total, provider };
  db.prepare('INSERT INTO checkouts (id, org_id, user_id, plan_id, interval, currency, amount, tax, total, provider) VALUES (@id, @org_id, @user_id, @plan_id, @interval, @currency, @amount, @tax, @total, @provider)').run(c);
  const s = getSettings();
  if (provider === 'test') { const inv = activate(c.id, 'TEST-' + c.id.slice(0, 8)); return { provider, activated: true, invoice: inv?.number }; }
  if (provider === 'razorpay') {
    const orderId = await razorpayCreateOrder(c);
    db.prepare('UPDATE checkouts SET provider_ref = ? WHERE id = ?').run(orderId, c.id);
    return { provider, checkout_id: c.id, key_id: s.razorpay_key_id, order_id: orderId, amount: Math.round(c.total * 100), currency, name: s.brand_name, description: `${plan.name} plan (${interval === 'year' ? 'yearly' : 'monthly'})`, prefill: { name: user.name, email: user.email } };
  }
  const session = await stripeCreateSession(c, base, plan.name, user.email);
  db.prepare('UPDATE checkouts SET provider_ref = ? WHERE id = ?').run(session.id, c.id);
  return { provider, url: session.url };
}

const hmacHex = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function verifyRazorpayPayment({ checkout_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const c = db.prepare('SELECT * FROM checkouts WHERE id = ?').get(checkout_id);
  if (!c || c.provider_ref !== razorpay_order_id) throw Object.assign(new Error('Unknown payment'), { status: 400 });
  const expected = hmacHex(getSettings().razorpay_key_secret, `${razorpay_order_id}|${razorpay_payment_id}`);
  if (!safeEq(expected, razorpay_signature || '')) throw Object.assign(new Error('Payment signature check failed'), { status: 400 });
  return activate(c.id, razorpay_payment_id);
}
function razorpayWebhook(rawBody, signature) {
  const secret = getSettings().razorpay_webhook_secret;
  if (!secret || !safeEq(hmacHex(secret, rawBody), signature || '')) throw Object.assign(new Error('Invalid signature'), { status: 400 });
  const ev = JSON.parse(rawBody.toString('utf8'));
  const orderId = ev.payload?.payment?.entity?.order_id || ev.payload?.order?.entity?.id;
  const paymentId = ev.payload?.payment?.entity?.id;
  if (['payment.captured', 'order.paid'].includes(ev.event) && orderId) {
    const c = db.prepare("SELECT * FROM checkouts WHERE provider = 'razorpay' AND provider_ref = ?").get(orderId);
    if (c) activate(c.id, paymentId || orderId);
  }
}
function stripeWebhook(rawBody, header) {
  const secret = getSettings().stripe_webhook_secret;
  const parts = Object.fromEntries(String(header || '').split(',').map((kv) => kv.split('=')));
  if (!secret || !parts.t || !parts.v1 || !safeEq(hmacHex(secret, `${parts.t}.${rawBody.toString('utf8')}`), parts.v1)) throw Object.assign(new Error('Invalid signature'), { status: 400 });
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) throw Object.assign(new Error('Stale webhook'), { status: 400 });
  const ev = JSON.parse(rawBody.toString('utf8'));
  if (ev.type === 'checkout.session.completed' && ev.data.object.payment_status === 'paid') activate(ev.data.object.client_reference_id, ev.data.object.payment_intent || ev.data.object.id);
}
async function stripeReturn(sessionId) {
  const sess = await stripeGetSession(sessionId);
  if (sess.payment_status === 'paid' && sess.client_reference_id) activate(sess.client_reference_id, sess.payment_intent || sess.id);
}

/** Mark a checkout paid, extend the subscription and issue an invoice. Idempotent. */
let onActivated = () => {};
function activate(checkoutId, paymentRef) {
  let invoice = null;
  db.transaction(() => {
    const c = db.prepare('SELECT * FROM checkouts WHERE id = ?').get(checkoutId);
    if (!c || c.status === 'paid') return;
    const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(c.org_id);
    const plan = planById(c.plan_id);
    const curEnd = toDate(org.current_period_end);
    const extend = org.status === 'active' && org.plan_id === c.plan_id && curEnd && curEnd > Date.now();
    const start = extend ? curEnd : new Date();
    const end = new Date(start);
    if (c.interval === 'year') end.setUTCFullYear(end.getUTCFullYear() + 1); else end.setUTCMonth(end.getUTCMonth() + 1);
    db.prepare("UPDATE checkouts SET status = 'paid', payment_ref = ?, paid_at = ? WHERE id = ?").run(paymentRef, now(), c.id);
    db.prepare("UPDATE organizations SET plan_id = ?, status = 'active', billing_interval = ?, current_period_start = ?, current_period_end = ?, reminded_at = NULL WHERE id = ?")
      .run(c.plan_id, c.interval, extend ? org.current_period_start : iso(start), iso(end), org.id);
    const s = getSettings();
    const year = new Date().getUTCFullYear();
    const seq = db.prepare("SELECT COUNT(*) c FROM invoices WHERE number LIKE ?").get(`${s.invoice_prefix}-${year}-%`).c + 1;
    const number = `${s.invoice_prefix}-${year}-${String(seq).padStart(5, '0')}`;
    const buyer = { name: org.name, email: org.billing_email, gstin: org.gstin, address: org.address, country: org.country };
    const seller = { name: s.seller_name || s.brand_name, gstin: s.seller_gstin, address: s.seller_address, email: s.seller_email, sac: s.invoice_sac };
    const id = db.prepare(`INSERT INTO invoices (number, org_id, checkout_id, plan_id, plan_name, interval, currency, amount, tax, tax_rate, total, period_start, period_end, provider, payment_ref, buyer_json, seller_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(number, org.id, c.id, plan.id, plan.name, c.interval, c.currency, c.amount, c.tax, c.currency === 'INR' ? Number(s.tax_rate_inr) || 0 : 0, c.total, iso(start), iso(end), c.provider, paymentRef, JSON.stringify(buyer), JSON.stringify(seller)).lastInsertRowid;
    invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  })();
  if (invoice) Promise.resolve(onActivated(invoice)).catch((e) => console.error('[billing] post-activation hook failed:', e.message));
  return invoice;
}

// ---------------------------------------------------------------- invoices
const money = (n, cur) => `${cur === 'INR' ? 'INR' : 'USD'} ${Number(n).toLocaleString(cur === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
async function invoicePdf(inv) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const buyer = parse(inv.buyer_json, {}), seller = parse(inv.seller_json, {});
  const ink = rgb(0.1, 0.12, 0.2), grey = rgb(0.42, 0.44, 0.5);
  let y = 790;
  const t = (s, x, size = 10, f = font, c = ink) => page.drawText(clean(s || ''), { x, y, size, font: f, color: c });
  t(inv.currency === 'INR' && inv.tax ? 'TAX INVOICE' : 'INVOICE', 50, 20, bold); t(inv.number, 400, 12, bold); y -= 16;
  t(`Date: ${inv.created_at.slice(0, 10)}`, 400, 10, font, grey); y -= 30;
  t('From', 50, 9, bold, grey); t('Bill to', 310, 9, bold, grey); y -= 14;
  const left = [seller.name, seller.address, seller.gstin ? `GSTIN: ${seller.gstin}` : '', seller.email].filter(Boolean);
  const right = [buyer.name, buyer.address, buyer.gstin ? `GSTIN: ${buyer.gstin}` : '', buyer.email].filter(Boolean);
  for (let i = 0; i < Math.max(left.length, right.length); i++) { t(left[i], 50); t(right[i], 310); y -= 14; }
  y -= 20;
  page.drawRectangle({ x: 50, y: y - 6, width: 495, height: 22, color: rgb(0.95, 0.96, 0.98) });
  t('Description', 58, 10, bold); t('Period', 290, 10, bold); t('Amount', 470, 10, bold); y -= 26;
  t(`${seller.name || 'Subscription'} — ${inv.plan_name} plan (${inv.interval === 'year' ? 'yearly' : 'monthly'})${seller.sac ? `  SAC ${seller.sac}` : ''}`, 58);
  t(`${inv.period_start.slice(0, 10)} to ${inv.period_end.slice(0, 10)}`, 290); t(money(inv.amount, inv.currency), 450); y -= 30;
  const row = (label, val, b) => { t(label, 330, 10, b ? bold : font); t(val, 450, 10, b ? bold : font); y -= 18; };
  row('Subtotal', money(inv.amount, inv.currency));
  if (inv.tax) row(`GST @ ${inv.tax_rate}%`, money(inv.tax, inv.currency));
  page.drawLine({ start: { x: 330, y: y + 10 }, end: { x: 545, y: y + 10 }, thickness: 0.6, color: grey });
  row('Total paid', money(inv.total, inv.currency), true);
  y -= 20;
  t(`Paid via ${inv.provider === 'test' ? 'test mode (no real payment)' : inv.provider} · reference ${inv.payment_ref || '-'}`, 50, 9, font, grey); y -= 14;
  t('This is a computer-generated invoice and does not require a signature.', 50, 9, font, grey);
  return Buffer.from(await pdf.save());
}

// ---------------------------------------------------------------- platform metrics & reminders
function platformOverview() {
  const orgs = db.prepare('SELECT id FROM organizations').all().map((o) => orgState(o.id));
  const mrr = { INR: 0, USD: 0 };
  for (const st of orgs) {
    if (!['active', 'past_due'].includes(st.status) || st.org.comped || st.plan.id === 'free') continue;
    const last = db.prepare('SELECT * FROM invoices WHERE org_id = ? ORDER BY id DESC LIMIT 1').get(st.org.id);
    if (last) mrr[last.currency] += last.interval === 'year' ? last.amount / 12 : last.amount;
  }
  const since30 = iso(new Date(Date.now() - 30 * 864e5));
  const rev = Object.fromEntries(db.prepare("SELECT currency, SUM(total) s FROM invoices WHERE created_at >= ? AND provider != 'test' GROUP BY currency").all(since30).map((r) => [r.currency, r.s]));
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  return {
    orgs: orgs.length,
    paying: orgs.filter((s) => ['active', 'past_due'].includes(s.status) && !s.org.comped && s.plan.id !== 'free').length,
    trialing: orgs.filter((s) => s.status === 'trialing').length,
    expired: orgs.filter((s) => ['expired', 'trial_expired'].includes(s.status)).length,
    mrr: { INR: Math.round(mrr.INR), USD: Math.round(mrr.USD) }, revenue30: { INR: rev.INR || 0, USD: rev.USD || 0 },
    signups30: db.prepare('SELECT COUNT(*) c FROM organizations WHERE created_at >= ?').get(since30).c,
    docsThisMonth: db.prepare('SELECT COUNT(*) c FROM documents WHERE sent_at >= ?').get(iso(monthStart)).c,
    planCounts: Object.fromEntries(listPlans(true).map((p) => [p.id, orgs.filter((s) => s.plan.id === p.id).length])),
  };
}

function dueReminders() {
  const soon = iso(new Date(Date.now() + 7 * 864e5));
  return db.prepare("SELECT * FROM organizations WHERE status = 'active' AND comped = 0 AND plan_id != 'free' AND current_period_end <= ? AND reminded_at IS NULL").all(soon);
}

module.exports = {
  FEATURES, DEFAULT_PLANS, SECRET_KEYS, planById, listPlans, createOrg, migrateUsers, orgState, has, assertCan, priceFor, providerFor,
  startCheckout, verifyRazorpayPayment, razorpayWebhook, stripeWebhook, stripeReturn, activate, invoicePdf, platformOverview, dueReminders,
  setActivationHook: (fn) => { onActivated = fn; }, hmacHex,
};
