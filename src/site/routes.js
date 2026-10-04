/* Public website routes, enquiries (leads) and the platform owner's website settings. */
const path = require('path');
const site = require('./site');
const LIB = require('../templates-library');
const RULES = require('../compliance/rules');

const SITE_KEYS = ['site_company', 'site_email', 'site_phone', 'site_whatsapp', 'site_address', 'site_city', 'site_terms', 'site_privacy'];
const TOPICS = { demo: 'Book a demo', sales: 'Pricing and plans', enterprise: 'Enterprise or private deployment', support: 'Help with my account', partner: 'Partner or reseller', other: 'Something else' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

module.exports = function mountSite(app, { db, getSettings, setSetting, billing, auth, adminOnly, rateLimit, sendEmail, HttpError, publicUrl, isPrivate = () => false }) {
  db.exec(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, company TEXT, phone TEXT, topic TEXT, size TEXT, message TEXT,
    page TEXT, ip TEXT, user_agent TEXT, status TEXT NOT NULL DEFAULT 'new', notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  for (const k of SITE_KEYS) db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(k, '');

  const ctx = () => {
    const s = getSettings();
    return {
      base: '', brand: s.brand_name || 'SignFlow', trialDays: Number(s.trial_days) || 14, taxRate: Number(s.tax_rate_inr) || 0, taxLabel: s.tax_label_inr || 'GST',
      currency: s.default_currency === 'USD' ? 'USD' : 'INR', plans: billing.listPlans(), features: billing.FEATURES, templates: LIB, rules: RULES,
      contact: { company: s.site_company || s.seller_name || s.brand_name, email: s.site_email || s.seller_email, phone: s.site_phone, whatsapp: s.site_whatsapp, address: s.site_address || s.seller_address, city: s.site_city },
      legal: { terms: s.site_terms, privacy: s.site_privacy }, theme: s.theme,
    };
  };
  const signupOpen = () => getSettings().allow_signup === '1' || db.prepare('SELECT COUNT(*) c FROM users').get().c === 0;

  function page(req, res, next) {
    if (req.path.startsWith('/api/') || /\.\w+$/.test(req.path)) return next();
    const c = ctx();
    if (!signupOpen()) c.registerUrl = '/contact?topic=sales';
    if (isPrivate()) {
      // Private platform: no marketing site. "/" shows a sign-in card; other website pages go there.
      if (!site.render(req.path, c)) return next();
      if (req.path !== '/') return res.redirect(302, '/');
      const p = site.renderPrivate(c);
      return res.set('Cache-Control', 'no-cache').type('html').send(`<!doctype html><html lang="en" data-theme="${esc(c.theme || 'ocean')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(p.title)}</title><meta name="robots" content="noindex, nofollow"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/css/app.css"><link rel="stylesheet" href="/css/site.css"></head><body style="margin:0">${p.html}</body></html>`);
    }
    const out = site.render(req.originalUrl.replace(/^[^?]*/, req.path), c);
    if (!out) return next();
    const base = publicUrl(req);
    const boot = { currency: c.currency, taxRate: c.taxRate, taxLabel: c.taxLabel, trialDays: c.trialDays };
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(`<!doctype html>
<html lang="en" data-theme="${esc(c.theme || 'ocean')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(out.title)}</title>
<meta name="description" content="${esc(out.description)}">
<link rel="canonical" href="${esc(base + req.path)}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(out.title)}"><meta property="og:description" content="${esc(out.description)}"><meta property="og:url" content="${esc(base + req.path)}"><meta property="og:site_name" content="${esc(c.brand)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/vendor/fonts/ibm-plex-serif/files/ibm-plex-serif-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/vendor/fonts/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/app.css">
<link rel="stylesheet" href="/css/site.css">
</head>
<body style="margin:0">
${out.html}
<script type="application/json" id="site-boot">${JSON.stringify(boot).replace(/</g, '\\u003c')}</script>
<script src="/js/site.js"></script>
<script src="/js/site-boot.js"></script>
</body>
</html>`);
  }

  app.get('/js/site.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'site.js')));
  app.get('/robots.txt', (req, res) => res.type('text/plain').send(isPrivate() ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /api/\nDisallow: /sign/\nSitemap: ${publicUrl(req)}/sitemap.xml\n`));
  app.get('/sitemap.xml', (req, res, next) => {
    if (isPrivate()) return next();
    const base = publicUrl(req);
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${site.paths(ctx()).map((p) => `<url><loc>${esc(base + p)}</loc></url>`).join('')}</urlset>`);
  });
  app.use((req, res, next) => (req.method === 'GET' || req.method === 'HEAD' ? page(req, res, next) : next()));

  // ---------------------------------------------------------------- enquiries from the contact form
  app.post('/api/public/contact', rateLimit('contact', 5, 3600e3), async (req, res, next) => {
    try {
      if (isPrivate()) throw new HttpError(404, 'Not found');
      const b = req.body || {};
      if (b.website) return res.json({ ok: true, message: 'Thanks. We will be in touch within one business day.' }); // honeypot: bots fill hidden fields
      const lead = { name: clean(b.name, 100), email: clean(b.email, 160).toLowerCase(), company: clean(b.company, 120), phone: clean(b.phone, 30), topic: TOPICS[b.topic] ? b.topic : 'other', size: clean(b.size, 20), message: clean(b.message, 2000) };
      if (!lead.name) throw new HttpError(400, 'Please enter your name');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) throw new HttpError(400, 'Please enter a valid email address');
      if (lead.phone && !/^[+\d\s()-]{6,30}$/.test(lead.phone)) throw new HttpError(400, 'Please check the phone number');
      const recent = db.prepare("SELECT COUNT(*) c FROM leads WHERE email = ? AND created_at > datetime('now', '-1 day')").get(lead.email).c;
      if (recent >= 3) return res.json({ ok: true, message: 'Thanks, we already have your message and will reply soon.' });
      const id = db.prepare('INSERT INTO leads (name, email, company, phone, topic, size, message, page, ip, user_agent) VALUES (@name, @email, @company, @phone, @topic, @size, @message, @page, @ip, @ua)')
        .run({ ...lead, page: clean(req.get('referer'), 300), ip: req.ip, ua: clean(req.get('user-agent'), 300) }).lastInsertRowid;
      const s = getSettings();
      const owner = db.prepare('SELECT email FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1').get();
      const to = s.site_email || s.seller_email || owner?.email;
      if (to) sendEmail(to, 'new_lead', { lead_name: lead.name, lead_email: lead.email, lead_company: lead.company || '-', lead_phone: lead.phone || '-', lead_topic: TOPICS[lead.topic], lead_size: lead.size || '-', lead_message: lead.message || '(no message)', action_link: `${publicUrl(req)}/app#/platform/website` }).catch(() => {});
      res.json({ ok: true, id, message: 'Thanks. We will be in touch within one business day.' });
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- platform owner: website settings & enquiries
  app.get('/api/platform/site', auth, adminOnly, (req, res) => {
    const s = getSettings();
    res.json({ ...Object.fromEntries(SITE_KEYS.map((k) => [k, s[k] || ''])), defaults: site.DEFAULT_LEGAL, counts: db.prepare('SELECT status, COUNT(*) n FROM leads GROUP BY status').all() });
  });
  app.put('/api/platform/site', auth, adminOnly, (req, res) => {
    const b = req.body || {};
    if (b.site_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.site_email).trim())) throw new HttpError(400, 'Enter a valid contact email');
    for (const k of SITE_KEYS) if (k in b) setSetting(k, clean(b[k], k.endsWith('terms') || k.endsWith('privacy') ? 30000 : 300));
    res.json({ ok: true });
  });
  app.get('/api/platform/leads', auth, adminOnly, (req, res) => {
    const st = ['new', 'contacted', 'won', 'closed'].includes(req.query.status) ? req.query.status : null;
    res.json(db.prepare(`SELECT id, name, email, company, phone, topic, size, message, page, ip, status, notes, created_at FROM leads ${st ? 'WHERE status = ?' : ''} ORDER BY id DESC LIMIT 500`).all(...(st ? [st] : [])).map((l) => ({ ...l, topic_label: TOPICS[l.topic] || l.topic })));
  });
  app.put('/api/platform/leads/:id', auth, adminOnly, (req, res) => {
    const b = req.body || {};
    const status = ['new', 'contacted', 'won', 'closed'].includes(b.status) ? b.status : null;
    const r = db.prepare('UPDATE leads SET status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ?').run(status, b.notes != null ? clean(b.notes, 2000) : null, req.params.id);
    if (!r.changes) throw new HttpError(404, 'Enquiry not found');
    res.json({ ok: true });
  });
  app.delete('/api/platform/leads/:id', auth, adminOnly, (req, res) => {
    db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });
  app.get('/api/platform/leads.csv', auth, adminOnly, (req, res) => {
    const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
    const rows = db.prepare('SELECT created_at, name, email, company, phone, topic, size, status, message, notes FROM leads ORDER BY id DESC').all();
    res.type('text/csv').attachment('enquiries.csv').send(['Received,Name,Email,Company,Phone,Topic,Team size,Status,Message,Notes', ...rows.map((r) => [r.created_at, r.name, r.email, r.company, r.phone, TOPICS[r.topic] || r.topic, r.size, r.status, r.message, r.notes].map(cell).join(','))].join('\n'));
  });

  /** Friendly 404 for unknown pages (mounted after static files). */
  function notFound(req, res, next) {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || /\.\w+$/.test(req.path) || !req.accepts('html')) return next();
    if (isPrivate()) return res.redirect(302, '/');
    const out = site.render('/404', ctx());
    res.status(404).type('html').send(`<!doctype html><html lang="en" data-theme="${esc(getSettings().theme || 'ocean')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(out.title)}</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/css/app.css"><link rel="stylesheet" href="/css/site.css"></head><body style="margin:0">${out.html}<script src="/js/site.js"></script><script src="/js/site-boot.js"></script></body></html>`);
  }
  return { ctx, notFound };
};
