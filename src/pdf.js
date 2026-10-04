const crypto = require('crypto');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// pdf-lib standard fonts only support WinAnsi; replace anything else.
function clean(str) {
  return String(str ?? '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return rgb(0.15, 0.39, 0.92);
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
}

function wrap(text, font, size, maxWidth) {
  const lines = [];
  for (const para of clean(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      const test = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) { lines.push(line); line = word; }
      else line = test;
    }
    lines.push(line);
  }
  return lines;
}

function fmtDate(s) {
  if (!s) return '-';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  return d.toUTCString().replace('GMT', 'UTC');
}

/** Burn field values into the PDF and append a certificate of completion. */
async function finalizeDocument({ originalBytes, doc, recipients, fields, auditRows, brandName, accent, compliance, jurisdictions, chainHead, seal }) {
  const pdf = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();

  for (const f of fields) {
    if (!f.value) continue;
    const page = pages[f.page - 1];
    if (!page) continue;
    const box = page.getCropBox();
    const bx = box.x + f.x * box.width;
    const bw = f.w * box.width;
    const bh = f.h * box.height;
    const by = box.y + box.height - (f.y * box.height) - bh;

    if ((f.type === 'signature' || f.type === 'initials') && f.value.startsWith('data:image/png')) {
      const png = await pdf.embedPng(Buffer.from(f.value.split(',')[1], 'base64'));
      const scale = Math.min(bw / png.width, bh / png.height);
      const w = png.width * scale, h = png.height * scale;
      page.drawImage(png, { x: bx + (bw - w) / 2, y: by + (bh - h) / 2, width: w, height: h });
    } else if (f.type === 'checkbox') {
      if (f.value === 'true') {
        const s = Math.min(bw, bh);
        const ox = bx + (bw - s) / 2, oy = by + (bh - s) / 2;
        page.drawRectangle({ x: ox, y: oy, width: s, height: s, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 0.8 });
        page.drawLine({ start: { x: ox + s * 0.2, y: oy + s * 0.5 }, end: { x: ox + s * 0.42, y: oy + s * 0.25 }, thickness: 1.6, color: rgb(0.1, 0.1, 0.1) });
        page.drawLine({ start: { x: ox + s * 0.42, y: oy + s * 0.25 }, end: { x: ox + s * 0.82, y: oy + s * 0.8 }, thickness: 1.6, color: rgb(0.1, 0.1, 0.1) });
      }
    } else {
      const text = clean(f.value).replace(/\n/g, ' ');
      let size = Math.min(bh * 0.62, 14);
      while (size > 5 && font.widthOfTextAtSize(text, size) > bw - 2) size -= 0.5;
      page.drawText(text, { x: bx + 1, y: by + (bh - size) / 2 + size * 0.22, size, font, color: rgb(0.05, 0.05, 0.2) });
    }
  }

  // ---- Footer stamp on every original page ----
  for (const pg of pages) {
    const box = pg.getCropBox();
    const t = clean(`Electronically signed via ${brandName}  |  Document ID ${doc.uid}  |  Completed ${fmtDate(doc.completed_at)}`);
    pg.drawText(t, { x: box.x + 18, y: box.y + 8, size: 6.5, font, color: rgb(0.45, 0.47, 0.52) });
  }

  // ---- Certificate of completion ----
  const A = hexToRgb(accent);
  const W = 612, H = 792, M = 50;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const newPageIfNeeded = (need) => {
    if (y - need < M) { page = pdf.addPage([W, H]); y = H - M; }
  };
  const text = (t, x, size = 10, f = font, color = rgb(0.15, 0.15, 0.2)) => page.drawText(clean(t), { x, y, size, font: f, color });

  page.drawRectangle({ x: 0, y: H - 90, width: W, height: 90, color: A });
  page.drawText(clean(brandName), { x: M, y: H - 42, size: 12, font: bold, color: rgb(1, 1, 1) });
  page.drawText('Certificate of Completion', { x: M, y: H - 70, size: 20, font: bold, color: rgb(1, 1, 1) });
  y = H - 125;

  const kv = [
    ['Document', doc.title],
    ['Document ID', doc.uid],
    ['Status', 'Completed'],
    ['Pages (original)', String(pages.length)],
    ['Created', fmtDate(doc.created_at)],
    ['Sent', fmtDate(doc.sent_at)],
    ['Completed', fmtDate(doc.completed_at)],
    ['Original SHA-256', doc.original_hash || '-'],
  ];
  for (const [k, v] of kv) {
    text(k, M, 9.5, bold, rgb(0.4, 0.4, 0.45));
    const lines = wrap(v, font, 9.5, W - M - 170);
    for (const ln of lines) { text(ln, 170, 9.5); y -= 13; }
    y -= 3;
  }

  y -= 10;
  text('Recipients', M, 13, bold, A); y -= 20;
  for (const r of recipients) {
    newPageIfNeeded(60);
    let ver = {};
    try { ver = JSON.parse(r.verified_json || '{}'); } catch {}
    const verText = Object.entries(ver).map(([k, v]) => ({ access_code: 'access code', otp: 'one-time code', id_check: `ID check${v.method ? ` (${v.method})` : ''}` }[k] || k)).join(', ') || 'email link';
    page.drawRectangle({ x: M, y: y - 50, width: W - 2 * M, height: 62, color: rgb(0.965, 0.97, 0.98), borderColor: rgb(0.88, 0.89, 0.92), borderWidth: 0.6 });
    text(`${r.name}  <${r.email}>`, M + 10, 10.5, bold); y -= 14;
    text(`Role: ${r.role}   |   Status: ${r.status}   |   IP: ${r.ip || '-'}`, M + 10, 9); y -= 12;
    text(`Viewed: ${fmtDate(r.viewed_at)}   |   ${r.status === 'declined' ? 'Declined' : 'Signed'}: ${fmtDate(r.signed_at)}`, M + 10, 9); y -= 12;
    text(`Identity verified by: ${verText}`, M + 10, 9); y -= 30;
  }

  if (compliance) {
    y -= 6; newPageIfNeeded(120);
    text('Compliance', M, 13, bold, A); y -= 18;
    const rows = [
      ['Jurisdictions', (jurisdictions || []).join(', ') || '-'],
      ['Assurance level', `${compliance.requiredLevelName} (${compliance.requiredLevel})`],
      ['Risk assessment', `${compliance.score}/100 (${compliance.level}) at the time of sending`],
      ['Retention', `${compliance.retentionYears} years`],
      ...(compliance.formalities || []).map((f) => ['Formality', f.text]),
      ['Audit chain head', chainHead || '-'],
    ];
    for (const [k, v] of rows) {
      const lines = wrap(v, font, 9, W - M - 170);
      newPageIfNeeded(13 * lines.length + 4);
      text(k, M, 9, bold, rgb(0.4, 0.4, 0.45));
      for (const ln of lines) { text(ln, 170, 9); y -= 12; }
      y -= 3;
    }
  }

  y -= 6;
  newPageIfNeeded(40);
  text('Audit trail', M, 13, bold, A); y -= 20;
  for (const a of auditRows) {
    const detail = [a.actor, a.details, a.ip ? `IP ${a.ip}` : ''].filter(Boolean).join(' - ');
    const lines = wrap(detail, font, 9, W - 2 * M - 260);
    newPageIfNeeded(14 * lines.length + 6);
    text(fmtDate(a.created_at), M, 8.5, font, rgb(0.4, 0.4, 0.45));
    text(a.action, M + 150, 9, bold);
    for (const ln of lines) { text(ln, M + 260, 9); y -= 12; }
    y -= 4;
  }
  newPageIfNeeded(40);
  y -= 14;
  for (const ln of wrap(`This certificate was generated by ${brandName}. The SHA-256 fingerprint of this final file is recorded by the platform and can be checked on the Verify page.`, font, 8, W - 2 * M)) {
    text(ln, M, 8, font, rgb(0.45, 0.45, 0.5)); y -= 11;
  }

  pdf.setTitle(clean(doc.title));
  pdf.setProducer(clean(brandName));
  if (seal) {
    // Tamper-evident seal over the whole file; readers flag any later change.
    seal.addPlaceholder(pdf, { reason: `Sealed by ${clean(brandName)} after all parties signed (Document ID ${doc.uid})`, location: 'SignFlow server', name: `${clean(brandName)} Document Seal` });
    const unsigned = Buffer.from(await pdf.save({ useObjectStreams: false }));
    const bytes = await seal.sign(unsigned);
    return { bytes, hash: sha256(bytes) };
  }
  const bytes = Buffer.from(await pdf.save());
  return { bytes, hash: sha256(bytes) };
}

/**
 * Render a library template (src/templates-library.js) to PDF with variables filled in.
 * Body text flows over as many pages as needed; signature blocks always start on a fresh final page
 * at fixed positions, so field placement is stable whatever the text length.
 * Returns { bytes, fields, pageCount } where fields use role_index and fractional coordinates.
 */
async function buildContractPdf(def, values = {}, { fillText } = require('./templates-library')) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 64;
  const ink = rgb(0.12, 0.12, 0.18), grey = rgb(0.42, 0.44, 0.5), line = rgb(0.82, 0.84, 0.89);
  const f = (t) => clean(fillText(t, def, values));
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
  const ensure = (h) => { if (y - h < M + 10) newPage(); };

  if (def.letter) {
    page.drawText(f('{{company_name}}'), { x: M, y, size: 13, font: bold, color: ink });
    const d = f('Date: {{letter_date}}');
    page.drawText(d, { x: W - M - font.widthOfTextAtSize(d, 10), y, size: 10, font, color: grey });
    y -= 26;
  }
  page.drawText(f(def.title), { x: M, y, size: 19, font: bold, color: rgb(0.08, 0.1, 0.2) }); y -= 18;
  if (def.subtitle) { page.drawText(f(def.subtitle), { x: M, y, size: 10, font, color: grey }); y -= 12; }
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: line });
  y -= 22;

  for (const raw of def.paras) {
    if (raw.startsWith('kv:')) {
      const [k, v] = f(raw.slice(3)).split('|');
      const lines = wrap(v || '', font, 10.5, W - 2 * M - 170);
      ensure(16 * lines.length);
      page.drawText(k, { x: M + 8, y, size: 10, font: bold, color: grey });
      for (const ln of lines) { page.drawText(ln, { x: M + 170, y, size: 10.5, font, color: ink }); y -= 15; }
      page.drawLine({ start: { x: M, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 0.4, color: line });
      y -= 3;
      continue;
    }
    const heading = raw.startsWith('# '), bullet = raw.startsWith('- ');
    const text = f(heading || bullet ? raw.slice(2) : raw);
    const fnt = heading ? bold : font, size = heading ? 11.5 : 10.5, indent = bullet ? 14 : 0;
    const lines = wrap(text, fnt, size, W - 2 * M - indent);
    if (heading) { y -= 4; ensure(40); }
    lines.forEach((ln, i) => {
      ensure(size + 6);
      if (bullet && i === 0) page.drawText('-', { x: M + 3, y, size, font, color: ink });
      page.drawText(ln, { x: M + indent, y, size, font: fnt, color: ink });
      y -= size + 4.5;
    });
    y -= heading ? 2 : bullet ? 1 : 8;
  }

  // Signature page
  newPage();
  const sigPage = pdf.getPageCount();
  page.drawText('Signatures', { x: M, y, size: 15, font: bold, color: rgb(0.08, 0.1, 0.2) }); y -= 16;
  page.drawText(f(def.title), { x: M, y, size: 9.5, font, color: grey }); y -= 22;
  for (const ln of wrap('By signing below, each party confirms they have read and agree to this document.', font, 10, W - 2 * M)) { page.drawText(ln, { x: M, y, size: 10, font, color: ink }); y -= 14; }
  const fields = [];
  const add = (role, type, x, yTop, w, h, label) => fields.push({ role_index: role, type, page: sigPage, x: x / W, y: (H - yTop) / H, w: w / W, h: h / H, label, required: 1 });
  def.roles.forEach(([heading, extra], i) => {
    const T = 210 + i * 150; // top of signature box in PDF-space distance from top
    const yTop = H - T;
    page.drawText(clean(heading), { x: M, y: yTop + 10, size: 11, font: bold, color: ink });
    const rows = [
      ['signature', M, 0, 230, 42, 'Signature'], ['date', M + 270, 20, 150, 22, 'Date'],
      ['fullname', M, 64, 230, 22, 'Printed name'], ['text', M + 270, 64, 190, 22, extra || 'Designation'],
    ];
    for (const [type, x, dy, w, h, label] of rows) {
      const top = yTop - dy;
      add(i, type, x, top, w, h, type === 'text' ? label : type === 'date' ? 'Date signed' : type === 'fullname' ? 'Full name' : 'Signature');
      page.drawLine({ start: { x, y: top - h - 2 }, end: { x: x + w, y: top - h - 2 }, thickness: 0.7, color: rgb(0.3, 0.3, 0.35) });
      page.drawText(clean(label), { x, y: top - h - 13, size: 8, font, color: grey });
    }
  });
  return { bytes: Buffer.from(await pdf.save()), fields, pageCount: pdf.getPageCount() };
}

module.exports = { finalizeDocument, buildContractPdf, sha256, clean };
