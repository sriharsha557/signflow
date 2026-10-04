/*
 * Private platform mode: keep SignFlow for your own organisation only.
 *
 * When private mode is on:
 *   - the public marketing website, pricing, sitemap and contact form are switched off; visitors see a
 *     plain "private workspace" page with a sign-in button, and search engines are told not to index anything;
 *   - nobody can create an account by themselves (only invitations from inside), after the first owner account;
 *   - optionally, accounts are limited to your email domains (e.g. yourcompany.com);
 *   - optionally, the app and API only answer from your office / VPN IP addresses.
 * Signing links, the verify page, payment webhooks and the health check stay reachable so outside
 * signers can still sign documents you send them.
 *
 * Settings live in the database (Platform → Private access). Environment variables override them and
 * cannot be changed from the browser: PRIVATE_MODE=1, ALLOWED_EMAIL_DOMAINS, PLATFORM_IP_ALLOWLIST.
 */
const KEYS = { private_mode: '0', allowed_email_domains: '', platform_ip_allowlist: '' };
// Always reachable, even with an IP allowlist: what external signers, verifiers and payment providers need.
const EXEMPT = [/^\/sign\//, /^\/api\/sign\//, /^\/verify\/?$/, /^\/api\/verify$/, /^\/api\/public-config$/, /^\/api\/billing\/webhooks\//, /^\/healthz$/,
  /^\/css\//, /^\/js\//, /^\/vendor\//, /^\/favicon\.svg$/];

module.exports = function privateMode({ db, getSettings, access, ipOf }) {
  for (const [k, v] of Object.entries(KEYS)) db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(k, v);

  const env = (k) => (process.env[k] || '').trim();
  const isPrivate = () => env('PRIVATE_MODE') === '1' || getSettings().private_mode === '1';
  const domains = () => (env('ALLOWED_EMAIL_DOMAINS') || getSettings().allowed_email_domains || '')
    .split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
  const ipList = () => env('PLATFORM_IP_ALLOWLIST') || getSettings().platform_ip_allowlist || '';

  /** True when the email's domain is allowed (or no domain restriction is set). Sub-domains count. */
  function emailAllowed(email) {
    const list = domains();
    if (!list.length) return true;
    const d = String(email || '').toLowerCase().split('@')[1] || '';
    return list.some((x) => d === x || d.endsWith(`.${x}`));
  }
  function assertEmailAllowed(email, HttpError) {
    if (!emailAllowed(email)) throw new HttpError(403, `Only email addresses at ${domains().map((d) => `@${d}`).join(', ')} can have accounts on this platform.`);
  }

  /** Express middleware: noindex headers in private mode, and the platform-wide IP allowlist. */
  function gate(req, res, next) {
    if (isPrivate()) res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    const list = ipList();
    if (!list || EXEMPT.some((r) => r.test(req.path))) return next();
    if (access.ipAllowed(ipOf(req), list)) return next();
    if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'This platform only accepts connections from approved networks.', code: 'ip_blocked' });
    return res.status(403).type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Access restricted</title><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;background:#f6f8fb;color:#0f172a">
<div style="max-width:440px;padding:32px;text-align:center"><h1 style="font-size:22px">Access restricted</h1><p style="color:#5b6577">This platform is only available from approved office or VPN networks. Connect to your company network and try again.</p></div></body>`);
  }

  function status(req) {
    return {
      private_mode: isPrivate(), private_locked: env('PRIVATE_MODE') === '1',
      allowed_email_domains: domains().join(', '), domains_locked: !!env('ALLOWED_EMAIL_DOMAINS'),
      platform_ip_allowlist: ipList(), ip_locked: !!env('PLATFORM_IP_ALLOWLIST'),
      your_ip: ipOf(req),
    };
  }

  return { isPrivate, emailAllowed, assertEmailAllowed, gate, status, domains, ipList, EXEMPT };
};
