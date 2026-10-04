const nodemailer = require('nodemailer');
const { db, getSettings } = require('./db');

const THEME_ACCENTS = {
  ocean: '#2563eb', emerald: '#059669', sunset: '#ea580c', royal: '#7c3aed', midnight: '#6366f1', graphite: '#18181b', rose: '#e11d48',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fill(str, vars) {
  return String(str || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] ?? ''));
}

function renderEmail(key, vars, overrideTpl) {
  const tpl = overrideTpl || db.prepare('SELECT * FROM email_templates WHERE key = ?').get(key);
  const s = getSettings();
  const accent = THEME_ACCENTS[s.theme] || THEME_ACCENTS.ocean;
  const allVars = { brand_name: s.brand_name, ...vars };
  const escVars = Object.fromEntries(Object.entries(allVars).map(([k, v]) => [k, esc(v)]));
  const subject = fill(tpl.subject, allVars);
  const bodyHtml = fill(esc(tpl.body), escVars)
    .split(/\n{2,}/).filter((p) => p.trim()).map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`).join('');
  const button = vars.action_link && tpl.button
    ? `<p style="margin:26px 0"><a href="${esc(vars.action_link)}" style="background:${accent};color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:600;display:inline-block">${esc(fill(tpl.button, allVars))}</a></p>
       <p style="font-size:12px;color:#6b7280;word-break:break-all">Or paste this link in your browser:<br>${esc(vars.action_link)}</p>` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 12px"><tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <tr><td style="background:${accent};padding:18px 28px;color:#fff;font-size:18px;font-weight:700">${esc(s.brand_name)}</td></tr>
    <tr><td style="padding:28px;color:#111827;font-size:15px;line-height:1.55">${bodyHtml}${button}</td></tr>
    <tr><td style="padding:16px 28px;border-top:1px solid #f0f0f0;color:#9ca3af;font-size:12px">Sent via ${esc(s.brand_name)} &middot; Secure electronic signatures</td></tr>
  </table></td></tr></table></body></html>`;
  return { subject, html };
}

function transport() {
  const s = getSettings();
  if (!s.smtp_host) return null;
  return nodemailer.createTransport({
    host: s.smtp_host,
    port: Number(s.smtp_port) || 587,
    secure: s.smtp_secure === '1',
    auth: s.smtp_user ? { user: s.smtp_user, pass: s.smtp_pass } : undefined,
  });
}

async function sendEmail(to, key, vars) {
  const { subject, html } = renderEmail(key, vars);
  const s = getSettings();
  const t = transport();
  let status = 'logged', error = null;
  if (t) {
    try {
      await t.sendMail({ from: s.smtp_from || s.smtp_user, to, subject, html });
      status = 'sent';
    } catch (e) { status = 'failed'; error = e.message; console.error('Email failed:', e.message); }
  } else {
    console.log(`[mail:no-smtp] To ${to} | ${subject} | ${vars.action_link || ''}`);
  }
  db.prepare('INSERT INTO emails (to_email, subject, html, link, status, error) VALUES (?, ?, ?, ?, ?, ?)').run(to, subject, html, vars.action_link || null, status, error);
  return status;
}

module.exports = { sendEmail, renderEmail, THEME_ACCENTS };
