/*
 * Public marketing website: Home, Features, Solutions, Templates, Security,
 * Compliance, Pricing, Contact, Terms and Privacy.
 *
 * Shared by the Node server (rendered on the server for fast, search-friendly
 * pages) and the browser prototype. render(path, ctx) returns { title,
 * description, html }; wire(root, ctx, hooks) adds the small interactive bits
 * (price toggles, mobile menu, contact form, in-page navigation).
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ helpers
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const P = {
    sign: 'M3 17c3-1 4-6 6-6s1 5 3 5 3-3 4-3 2 2 5 2M3 21h18',
    check: 'M20 6 9 17l-5-5',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z',
    lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
    file: 'M14 3H6v18h12V7l-4-4zM14 3v4h4M9 13h6M9 17h6',
    users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 1 0 0-6M22 21c0-3-2-5-5-5',
    globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18',
    send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
    pen: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
    key: 'M15 7a4 4 0 1 1-3.9 5H3v3h3v2h3v-2h2.1A4 4 0 0 1 15 7z',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    palette: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5s.8-1.5 1.8-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5zM7.5 11a1 1 0 1 0 0-2M10.5 7.5a1 1 0 1 0 0-2M15 8a1 1 0 1 0 0-2',
    card: 'M2 6h20v12H2zM2 10h20M6 15h4',
    phone: 'M7 2h10v20H7zM11 18h2',
    building: 'M4 21V5l8-3v19M12 21h8V9l-8-3M8 9h0M8 13h0M8 17h0M16 13h0M16 17h0',
    heart: 'M12 21s-8-5-8-11a5 5 0 0 1 8-3 5 5 0 0 1 8 3c0 6-8 11-8 11z',
    home: 'M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6',
    briefcase: 'M3 7h18v13H3zM8 7V4h8v3M3 12h18',
    bank: 'M3 10 12 4l9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18',
    school: 'M2 9l10-5 10 5-10 5-10-5zM6 11v5c3 2 9 2 12 0v-5',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
    finger: 'M12 11v4M8 9a4 4 0 0 1 8 0v3c0 3-1 6-2 8M6 12c0 3 1 6 2 8M17 16c0 2-.5 3.5-1 5',
    layers: 'M12 3 2 8l10 5 10-5-10-5zM2 13l10 5 10-5M2 17l10 5 10-5',
    server: 'M3 4h18v6H3zM3 14h18v6H3zM7 7h0M7 17h0',
    bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0',
    menu: 'M3 6h18M3 12h18M3 18h18',
    x: 'M6 6l12 12M18 6 6 18',
    star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
    zap: 'M13 2 4 14h7l-1 8 9-12h-7z',
    tag: 'M3 12V3h9l9 9-9 9-9-9zM8 8h0',
    whatsapp: 'M4 20l1.5-4A8 8 0 1 1 8 18.5L4 20zM9 9c0 3 3 6 6 6l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2L9 9z',
  };
  const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n] || P.check}"/></svg>`;

  // ------------------------------------------------------------------ content
  const FEATURE_GROUPS = [
    { id: 'send', icon: 'send', title: 'Prepare and send', lead: 'Turn any PDF or template into a signing request in a couple of minutes.', items: [
      ['Upload any PDF', 'Contracts, letters, forms or scanned documents, up to 25 MB.'],
      ['Drag-and-drop fields', 'Signature, initials, full name, email, date signed, company, job title, text and checkbox. Move and resize them on the page.'],
      ['Signers, approvers and CC', 'Color-coded recipients. Approvers sign off, CC recipients get a copy of the signed document.'],
      ['Signing order', 'Everyone at once, or one after another in the order you set.'],
      ['Expiry and personal message', 'Set how long the link stays open and add a note to the email.'],
      ['Reminders, recall and duplicate', 'Nudge people who have not signed, withdraw a request, or reuse a document as a new draft.'],
    ] },
    { id: 'templates', icon: 'file', title: 'Ready-made templates', lead: 'Professionally structured documents with signature fields already placed.', items: [
      ['19 built-in documents', 'NDAs, offer, appointment, appraisal, promotion and relieving letters, agreements, consent forms and more.'],
      ['Fill in once, send', 'Type the candidate, client or tenant details in a short form. They are written straight into the PDF.'],
      ['Your own templates', 'Upload your letterhead documents or save any document as a template for the team.'],
      ['Edit the built-in ones', 'Duplicate a sample and change the wording to match your policies.'],
    ] },
    { id: 'signing', icon: 'pen', title: 'A signing experience people finish', lead: 'No account, no app, no printing.', items: [
      ['Works on any phone', 'Signers open the email link and sign from a phone, tablet or computer.'],
      ['Type, draw or upload', 'Three ways to add a signature. Initials and dates fill themselves in.'],
      ['Guided “Next field”', 'Signers jump from field to field so nothing is missed.'],
      ['Consent and decline', 'Signers agree to sign electronically first, and can decline with a reason.'],
      ['Identity checks', 'Access code, email one-time code or ID check before the document opens.'],
    ] },
    { id: 'output', icon: 'shield', title: 'Signed, sealed and provable', lead: 'Evidence you can hand to a client, auditor or court.', items: [
      ['Signed PDF', 'Every value and signature is written into the PDF itself.'],
      ['Certificate of completion', 'A final page lists every signer, IP address, time, check passed and the document fingerprint.'],
      ['Tamper-evident seal', 'The finished PDF is digitally sealed. PDF readers flag any later change.'],
      ['Public verify page', 'Anyone can upload a signed PDF to confirm it is genuine and unchanged.'],
    ] },
    { id: 'compliance', icon: 'globe', title: 'Compliance checks for 30 countries', lead: 'Know the rules before you press send.', items: [
      ['Country rules built in', 'Governing law, accepted signature types, record-keeping period and excluded documents for 30 countries.'],
      ['Risk score', 'Every document gets a 0–100 score from its type, value and countries involved.'],
      ['Right signature level', 'Simple, advanced or qualified, set automatically from the strictest rule that applies.'],
      ['Formalities checklist', 'Stamp duty, notarisation, witnesses or registration flagged before you send.'],
      ['Blocks what is not allowed', 'Documents that cannot be e-signed in a selected country are stopped, with the reason.'],
    ] },
    { id: 'team', icon: 'users', title: 'Team, roles and access', lead: 'Give every person exactly the access they need.', items: [
      ['Invite your team', 'Secure one-time invitation links. Nobody shares passwords.'],
      ['Six ready roles', 'Owner, Admin, Manager, Member, Viewer and Billing.'],
      ['Custom roles', 'Pick from 15 permissions to build roles like “HR Executive” or “Branch Manager”.'],
      ['Workspace security policy', 'Require two-factor login, restrict sign-in to office IPs, set password length and session time.'],
      ['Activity log', 'Sign-ins, invitations, role changes and policy changes, exportable to CSV.'],
    ] },
    { id: 'brand', icon: 'palette', title: 'Your brand, your words', lead: 'Signers see your company, not ours.', items: [
      ['Your name and logo color', 'On emails, signing pages and certificates.'],
      ['Seven themes', 'Ocean, Emerald, Sunset, Royal, Rose, Graphite and Midnight (dark).'],
      ['Editable emails', 'Change the subject, wording and button text of every email, with a live preview.'],
    ] },
    { id: 'track', icon: 'chart', title: 'Track everything', lead: 'Always know what is waiting and on whom.', items: [
      ['Dashboard', 'Awaiting others, completed, drafts, declined and expired at a glance.'],
      ['Waiting for you', 'Documents that need your own signature, and anything about to expire.'],
      ['Live audit trail', 'Sent, opened, verified, signed, declined and reminded, with time and IP address.'],
    ] },
    { id: 'billing', icon: 'card', title: 'Simple billing', lead: 'Built for Indian and international customers.', items: [
      ['Pay in rupees or dollars', 'UPI, cards and net banking in INR, or international cards in USD.'],
      ['GST tax invoices', 'Add your GSTIN and download a tax invoice for every payment.'],
      ['Monthly or yearly', 'Prepaid plans, two months free on yearly. Upgrade any time.'],
    ] },
  ];

  const SECURITY_GROUPS = [
    { icon: 'file', title: 'Protecting documents', items: [
      ['Encrypted storage', 'Every PDF, signature image and filled-in value is encrypted on the server with AES-256. A copy of the disk or database is unreadable without the separate key.'],
      ['Fingerprint of the original', 'A unique SHA-256 fingerprint is recorded when a document is uploaded, and another for the final signed file. Changing even one character changes it.'],
      ['Tamper-evident seal', 'When the last person signs, the PDF gets a digital seal. Adobe Acrobat and other PDF readers warn anyone who opens a changed copy.'],
      ['Verify page', 'Anyone can upload a signed PDF to confirm it came from us and has not been altered.'],
      ['Audit trail that cannot be rewritten', 'Every action is logged, and each entry is linked to the one before it. The database refuses edits and deletions, and a one-click check confirms the history is intact.'],
      ['Certificate of completion', 'Each signed PDF ends with a page listing signers, IP addresses, times, the compliance result and fingerprints.'],
      ['Retention hold', 'Signed records cannot be deleted until the legal record-keeping period for their country has passed.'],
      ['Role-based access', 'Team members only see, download or delete what their role allows. Checked on the server for every request.'],
    ] },
    { icon: 'pen', title: 'Protecting signatures', items: [
      ['Private signing link per person', 'Each recipient gets their own unique link that expires on the date you set.'],
      ['Identity checks before opening', 'Depending on the document, the signer must enter an access code shared separately, a 6-digit email code (10 minutes, 5 tries) or pass an ID check before seeing anything.'],
      ['Recorded consent', 'Signers agree to sign electronically before they start, and that agreement is logged.'],
      ['Signing order enforced', 'In sequential signing nobody can sign before their turn.'],
      ['Signature tied to the document', 'Each signature is recorded together with the original file’s fingerprint and the signer’s entries, so it cannot be moved to another document.'],
      ['Evidence captured', 'IP address and time of every view, check, signature or decline, including the reason given.'],
      ['Right level for the law', 'Simple, advanced or qualified signatures are required according to the strictest rule of the countries involved.'],
    ] },
    { icon: 'lock', title: 'Protecting accounts', items: [
      ['Two-factor login', 'Authenticator-app codes (Google Authenticator, Microsoft Authenticator, 1Password and others), single-use codes and 10 backup codes. Workspaces can make it mandatory.'],
      ['Strong passwords', 'Stored only as one-way hashes. Common passwords are refused and accounts lock after 5 failed attempts.'],
      ['Session control', 'Idle sign-out, a list of signed-in devices with remote sign-out, and other devices signed out on password change.'],
      ['Office-only access', 'Optionally restrict your workspace to your office or VPN IP addresses.'],
      ['Activity log', 'Sign-ins, invitations, role and policy changes with IP and time, exportable to CSV.'],
      ['Web protections', 'HTTPS everywhere, strict content policy, no embedding in other sites, cross-site request blocking and rate limits.'],
    ] },
  ];

  const SOLUTIONS = [
    { slug: 'hr', icon: 'briefcase', name: 'HR & recruitment', short: 'Offer letters signed the same day.',
      who: 'IT services firms, startups, hospitals, colleges and retail chains hiring every month.',
      pain: 'Offer letters are printed, signed, scanned and emailed back. Candidates take days, documents go missing, and nobody knows who has accepted.',
      how: ['Offer, appointment, internship, appraisal, promotion and relieving letters ready to use', 'HR types the candidate details once and sends within minutes', 'Candidates accept on their phone, and you see the moment they open it', 'Managers send only for their team while HR sees everything'],
      steps: ['Pick “Employment Offer Letter”', 'Fill in name, designation, CTC and joining date', 'HR signs, then the candidate accepts', 'Signed PDF and certificate go to both sides'],
      templates: ['offer_letter', 'appointment_letter', 'appraisal_letter', 'promotion_letter', 'internship_offer', 'experience_letter', 'employee_ip'], plan: 'business' },
    { slug: 'staffing', icon: 'users', name: 'Staffing & manpower agencies', short: 'Hundreds of joining documents, every branch.',
      who: 'Contract staffing, security, housekeeping and facility-management companies.',
      pain: 'Large volumes of joining documents and client contracts across many branches, with records demanded by clients and inspectors.',
      how: ['Branch managers get their own role; head office sees all branches', 'Reusable joining kits as templates', 'Audit trail and certificates for every document when records are requested', 'Activity log of who did what'],
      steps: ['Create a “Branch Manager” role', 'Invite branch managers', 'Send joining documents from templates', 'Head office tracks every branch from one dashboard'],
      templates: ['appointment_letter', 'employee_ip', 'nda_oneway'], plan: 'business' },
    { slug: 'sales', icon: 'zap', name: 'Sales, agencies & consultants', short: 'Close deals while the client is still keen.',
      who: 'Digital agencies, IT vendors, consultants, freelancers, interior designers and event companies.',
      pain: '“Please send the signed copy” slows every deal. Quotes go unanswered and work starts without a signed scope.',
      how: ['Quotation acceptance, consulting, freelance and NDA templates', 'See when the client opened the document', 'Automatic reminders until it is signed', 'Your brand on every email and page'],
      steps: ['Send the quotation for acceptance', 'Client signs from their phone', 'Both sides get the sealed PDF', 'Start the work with a signed scope'],
      templates: ['sales_order', 'consulting', 'freelance', 'nda_mutual', 'mou'], plan: 'starter' },
    { slug: 'real-estate', icon: 'home', name: 'Real estate & rentals', short: 'Owner, tenant and broker sign from anywhere.',
      who: 'Rental brokers, co-living and PG operators, property managers.',
      pain: 'Owners and tenants live in different cities, and agreements are renewed every 11 months.',
      how: ['Rental agreement template with all key terms', 'Owner, tenant and broker sign in a set order', 'IP addresses and times recorded as evidence', 'Stamp duty and registration flagged by the compliance check'],
      steps: ['Fill in rent, deposit and dates', 'Owner signs first, then tenant', 'Broker countersigns', 'Everyone receives the sealed agreement'],
      templates: ['rental'], plan: 'starter', note: 'Stamp duty and, for longer leases, registration still apply in India. Sale deeds of property cannot be signed electronically.' },
    { slug: 'healthcare', icon: 'heart', name: 'Healthcare & clinics', short: 'Consent forms signed at the front desk.',
      who: 'Hospitals, dental and IVF clinics, diagnostic labs, physiotherapy and wellness centres.',
      pain: 'Paper consent forms are hard to find later, and patient data needs careful handling.',
      how: ['Patient consent form signed on a tablet', 'Files encrypted and kept for the required period', 'Retention hold stops accidental deletion', 'Role-based access for doctors and front-desk staff'],
      steps: ['Front desk opens the consent form', 'Patient reads and signs on a tablet', 'Doctor countersigns', 'Record is stored encrypted'],
      templates: ['patient_consent', 'media_consent'], plan: 'business' },
    { slug: 'finance', icon: 'bank', name: 'Lending & finance', short: 'Strong proof of who signed.',
      who: 'NBFCs, microfinance institutions, cooperatives and chit funds.',
      pain: 'Loan paperwork across branches, and a need to prove exactly who signed and when.',
      how: ['Loan agreement template', 'Email one-time codes and ID checks for borrowers', 'Higher-value loans automatically require stronger checks', 'Sealed PDFs and an audit trail that cannot be edited'],
      steps: ['Enter loan amount, rate and tenure', 'Borrower verifies identity', 'Borrower and guarantor sign', 'Sealed agreement with certificate'],
      templates: ['loan'], plan: 'enterprise', note: 'Regulated lenders often need Aadhaar eSign or a certificate-based signature. This is available on Enterprise with a connected trust service provider.' },
    { slug: 'corporate', icon: 'building', name: 'Companies, CAs & CSs', short: 'Board papers and client engagements.',
      who: 'Chartered accountant and company secretary firms, and the companies they serve.',
      pain: 'Collecting director signatures and client engagement letters across many companies.',
      how: ['Board resolution, MoU and NDA templates', 'One workspace per client company', 'Directors sign from wherever they are', 'Certificates ready for your records'],
      steps: ['Draft the board resolution', 'Chairperson and director sign', 'Certified copy downloaded', 'Filed with the minutes'],
      templates: ['board_resolution', 'mou', 'nda_mutual'], plan: 'business' },
    { slug: 'education', icon: 'school', name: 'Schools & colleges', short: 'Parents sign from a link.',
      who: 'Schools, colleges, coaching institutes and ed-tech companies.',
      pain: 'Admission forms, fee agreements and photo consent collected on paper from hundreds of parents.',
      how: ['Photo & media consent and custom admission forms', 'Parents sign from a link shared on email or WhatsApp, no app needed', 'Faculty offer letters from the HR templates', 'Track who has not signed yet and send reminders'],
      steps: ['Upload your admission form once', 'Save it as a template', 'Send to each parent', 'Download signed forms'],
      templates: ['media_consent', 'offer_letter'], plan: 'starter' },
    { slug: 'cross-border', icon: 'globe', name: 'International business', short: 'Signing across borders, done right.',
      who: 'Exporters, IT outsourcing firms and companies with remote teams abroad.',
      pain: 'Every country has different rules on what can be signed electronically and how.',
      how: ['Rules for 30 countries built in', 'Warns when a document needs a stronger signature or a notary in the other country', 'Pricing in USD for international clients', 'Certificates that show the compliance result'],
      steps: ['Select the countries involved', 'See the risk score and required checks', 'Send with the right signature level', 'Keep records for the right period'],
      templates: ['vendor', 'consulting', 'nda_mutual'], plan: 'business' },
    { slug: 'enterprise', icon: 'server', name: 'Enterprise & private deployment', short: 'Your data on your own servers.',
      who: 'Banks, government contractors, law firms, large hospitals and companies that need data to stay in-house.',
      pain: 'Policies that rule out shared cloud tools, and a need for their own branding and keys.',
      how: ['Installed on your own server or private cloud', 'Fully rebranded with your name and theme', 'You control the encryption keys', 'Connect your identity-verification and trust service providers'],
      steps: ['Talk to us about your requirements', 'We install it on your infrastructure', 'Your IT team controls access and keys', 'Annual support and updates'],
      templates: [], plan: 'enterprise' },
  ];

  const FAQ = [
    ['Are electronic signatures legally valid?', 'In most countries, yes, for most business documents. In India they are recognised under the Information Technology Act, 2000. Some documents, such as wills and property sale deeds, still need wet ink, a notary or registration. We check this for each document before it is sent.'],
    ['Do signers need an account?', 'No. They open the link in their email and sign on any device.'],
    ['How do signers prove who they are?', 'Depending on your plan and the document’s risk, signers enter a one-time code sent to their email, an access code you share separately, or pass an ID check before the document opens.'],
    ['Where is my data stored and who can see it?', 'Files are encrypted at rest with AES-256 and every signed PDF is sealed so tampering is detectable. Only people you give access to can see your documents. Enterprise customers can run the platform on their own servers.'],
    ['Can I use my own documents?', 'Yes. Upload any PDF, place fields and send. Save it as a template to reuse it.'],
    ['Can I cancel any time?', 'Yes. Plans are prepaid monthly or yearly and simply end if you do not renew. You keep access to everything you have signed.'],
    ['Do you issue GST invoices?', 'Yes. Add your GSTIN in billing details and every payment produces a tax invoice you can download.'],
    ['What happens after the free trial?', 'You choose a plan. If you do not, your workspace moves to the Free plan and your signed documents stay available.'],
  ];

  const LEVEL_TEXT = { SES: 'Simple electronic signature', AES: 'Advanced electronic signature', QES: 'Qualified / certificate-based signature' };
  const MODEL_TEXT = { open: 'Open: any electronic signature works unless the document type is excluded', tiered: 'Tiered: stronger signature types carry more legal weight and are required for some documents', restrictive: 'Restrictive: only certificate-based digital signatures have full legal effect' };
  const MODEL_SHORT = { open: 'Open', tiered: 'Tiered', restrictive: 'Restrictive' };

  // ------------------------------------------------------------------ building blocks
  function money(n, cur) {
    const v = Number(n) || 0;
    const s = v.toLocaleString(cur === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: v % 1 ? 2 : 0, minimumFractionDigits: v % 1 ? 2 : 0 });
    return (cur === 'INR' ? '₹' : '$') + s;
  }
  const lim = (n, unit) => (Number(n) < 0 ? `Unlimited ${unit}` : `${n} ${unit}`);

  function ctxDefaults(c) {
    return Object.assign({ base: '', brand: 'SignFlow', trialDays: 14, taxRate: 18, taxLabel: 'GST', currency: 'INR', plans: [], features: {}, templates: { LIBRARY: [] }, rules: { JURISDICTIONS: [] }, contact: {}, signinUrl: '/app#/login', registerUrl: '/app#/register', verifyUrl: '/verify', legal: {} }, c);
  }

  function link(c, path, label, cls = '') { return `<a href="${esc(c.base + path)}" data-nav="${esc(path)}" class="${cls}">${label}</a>`; }
  function cta(c, kind, label, cls = "", plan) {
    const href = kind === 'signin' ? c.signinUrl : c.registerUrl + (plan ? `?plan=${encodeURIComponent(plan)}` : '');
    return `<a href="${esc(href)}" data-act="${kind}" ${plan ? `data-plan="${esc(plan)}"` : ''} class="${cls}">${label}</a>`;
  }
  const NAV = [['/features', 'Features'], ['/solutions', 'Solutions'], ['/templates', 'Templates'], ['/security', 'Security'], ['/compliance', 'Compliance'], ['/pricing', 'Pricing']];

  function header(c, active) {
    return `<header class="s-nav"><div class="s-wrap s-navin">
      ${link(c, '/', `<span class="s-logo">${ic('sign')}</span><span>${esc(c.brand)}</span>`, 's-brand')}
      <nav class="s-links" id="s-links">${NAV.map(([p, l]) => link(c, p, l, active === p ? 'on' : '')).join('')}${link(c, '/contact', 'Contact', active === '/contact' ? 'on s-only-m' : 's-only-m')}</nav>
      <span class="s-grow"></span>
      ${cta(c, 'signin', 'Sign in', 's-btn s-ghost s-hide-xs')}${cta(c, 'register', 'Start free trial', 's-btn s-pri')}
      <button class="s-btn s-ghost s-menu" type="button" id="s-menu" aria-label="Menu" aria-expanded="false">${ic('menu')}</button>
    </div></header>`;
  }
  function footer(c) {
    const ct = c.contact || {};
    const col = (t, items) => `<div><h4>${t}</h4>${items.join('')}</div>`;
    return `<footer class="s-foot"><div class="s-wrap">
      <div class="s-fgrid">
        <div class="s-fabout">${link(c, '/', `<span class="s-logo">${ic('sign')}</span><span>${esc(c.brand)}</span>`, 's-brand')}
          <p>Electronic signatures with built-in compliance for 30 countries, sealed PDFs and an audit trail you can show anyone.</p>
          ${ct.email ? `<p><a href="mailto:${esc(ct.email)}">${ic('mail')} ${esc(ct.email)}</a></p>` : ''}${ct.phone ? `<p><a href="tel:${esc(ct.phone.replace(/\s/g, ''))}">${ic('phone')} ${esc(ct.phone)}</a></p>` : ''}</div>
        ${col('Product', [link(c, '/features', 'Features'), link(c, '/templates', 'Templates'), link(c, '/pricing', 'Pricing'), `<a href="${esc(c.verifyUrl)}">Verify a document</a>`])}
        ${col('Solutions', SOLUTIONS.slice(0, 5).map((s) => link(c, `/solutions/${s.slug}`, esc(s.name))))}
        ${col('Trust', [link(c, '/security', 'Security'), link(c, '/compliance', 'Compliance'), link(c, '/privacy', 'Privacy policy'), link(c, '/terms', 'Terms of service')])}
        ${col('Company', [link(c, '/contact', 'Contact us'), link(c, '/contact?topic=demo', 'Book a demo'), cta(c, 'signin', 'Sign in'), cta(c, 'register', 'Start free trial')])}
      </div>
      <div class="s-fbot"><span>© ${new Date().getFullYear()} ${esc(ct.company || c.brand)}. All rights reserved.</span>${ct.address ? `<span>${esc(ct.address)}</span>` : ''}</div>
    </div></footer>`;
  }
  const head = (eyebrow, title, lead, extra = '') => `<section class="s-phead"><div class="s-wrap">${eyebrow ? `<div class="s-eyebrow">${eyebrow}</div>` : ''}<h1>${title}</h1>${lead ? `<p class="s-lead">${lead}</p>` : ''}${extra}</div></section>`;
  const ctaBand = (c, title = 'Start signing in minutes', text) => `<section class="s-band"><div class="s-wrap s-bandin"><div><h2>${title}</h2><p>${text || `${c.trialDays}-day free trial of every paid feature. No card needed.`}</p></div><div class="s-row">${cta(c, 'register', 'Start free trial', 's-btn s-white s-lg')}${link(c, '/contact?topic=demo', 'Book a demo', 's-btn s-outline-w s-lg')}</div></div></section>`;
  const cardGrid = (items, cls = '') => `<div class="s-grid ${cls}">${items.join('')}</div>`;
  const fcard = (icon, title, text, more = '') => `<div class="s-card"><span class="s-ic">${ic(icon)}</span><h3>${title}</h3><p>${text}</p>${more}</div>`;

  function mockDoc(c) {
    return `<div class="s-mock" aria-hidden="true"><div class="s-mtop"><span></span><span></span><span></span><b>Offer of Employment</b></div>
      <div class="s-mdoc"><div class="s-mh">Offer of Employment</div><div class="s-ms">Private &amp; confidential</div>
        <p>Dear Priya Sharma,</p><p>We are pleased to offer you the position of <u>Product Designer</u> at Acme Studio Pvt. Ltd.</p>
        <div class="s-kv"><span>Annual CTC</span><b>₹ 14,40,000</b></div><div class="s-kv"><span>Date of joining</span><b>01 Nov 2026</b></div>
        <div class="s-sigs"><div class="s-sig done"><i>R. Menon</i><small>For the Company · signed</small></div><div class="s-sig"><span>${ic('pen')} Sign here</span><small>Priya Sharma</small></div></div></div>
      <div class="s-mfoot"><span class="s-pill ok">${ic('shield')} Sealed</span><span class="s-pill">${ic('globe')} India · Low risk</span><span class="s-pill">${ic('clock')} Audit trail intact</span></div></div>`;
  }

  function planCards(c, opts = {}) {
    const show = (cur, iv) => (cur === c.currency && iv === 'year' ? '' : ' hidden');
    return `<div class="s-plans">${c.plans.map((p) => {
      const prices = ['INR', 'USD'].flatMap((cur) => ['month', 'year'].map((iv) => {
        const price = Number(p[`price_${cur.toLowerCase()}_${iv}`]) || 0;
        const mo = iv === 'year' ? price / 12 : price;
        return `<div class="s-price" data-k="${cur}-${iv}"${show(cur, iv)}>${price ? `<b>${money(Math.round(mo), cur)}</b><small> / month</small><div class="s-bill">${iv === 'year' ? `${money(price, cur)} billed yearly` : 'billed monthly'}</div>` : '<b>Free</b><div class="s-bill">forever</div>'}</div>`;
      })).join('');
      const extra = (p.features || []).filter((f) => !['compliance', 'sealed', 'templates_library'].includes(f)).map((f) => `<li>${ic('check')}${esc(c.features[f] || f)}</li>`).join('');
      return `<div class="s-plan ${p.highlight ? 'hl' : ''}">${p.highlight ? '<span class="s-tag">Most popular</span>' : ''}<h3>${esc(p.name)}</h3><p class="s-muted">${esc(p.tagline || '')}</p>${prices}
        ${cta(c, 'register', Number(p.price_inr_month) || Number(p.price_usd_month) ? 'Start free trial' : 'Get started', `s-btn ${p.highlight ? 's-pri' : ''} s-block`, p.id)}
        <ul><li>${ic('check')}${lim(p.docs_per_month, 'documents / month')}</li><li>${ic('check')}${Number(p.users) < 0 ? 'Unlimited users' : `${p.users} user${Number(p.users) === 1 ? '' : 's'}`}</li><li>${ic('check')}${Number(p.templates) < 0 ? 'Unlimited' : p.templates} custom templates</li>
        <li>${ic('check')}30-country compliance checks</li><li>${ic('check')}Sealed PDFs &amp; audit trail</li>${opts.short ? '' : extra}</ul></div>`;
    }).join('')}</div>`;
  }
  function priceToggles(c) {
    return `<div class="s-toggles"><div class="s-seg" data-tg="iv"><button type="button" data-v="month">Monthly</button><button type="button" data-v="year" class="on">Yearly <em>2 months free</em></button></div>
      <div class="s-seg" data-tg="cur"><button type="button" data-v="INR" class="${c.currency === 'INR' ? 'on' : ''}">₹ INR</button><button type="button" data-v="USD" class="${c.currency === 'USD' ? 'on' : ''}">$ USD</button></div></div>`;
  }
  const taxNote = (c) => `<p class="s-muted s-center s-small" data-taxnote>${c.currency === 'INR' ? `Prices exclude ${c.taxRate}% ${esc(c.taxLabel)}. ` : ''}Every paid plan starts with a ${c.trialDays}-day free trial.</p>`;
  const faq = (items) => `<div class="s-faq">${items.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>`;
  const tplByKey = (c, k) => (c.templates.LIBRARY || []).find((t) => t.key === k);

  // ------------------------------------------------------------------ pages
  const PAGES = {};

  PAGES['/'] = (c) => {
    const J = c.rules.JURISDICTIONS || [];
    const LIB = c.templates.LIBRARY || [];
    return { title: `${c.brand} — Electronic signatures with built-in compliance`, description: `Send offer letters, NDAs and contracts for legally valid e-signature. ${LIB.length} ready-made templates, compliance checks for ${J.length} countries, sealed PDFs and GST invoices.`, html: `
    <section class="s-hero"><div class="s-wrap s-heroin">
      <div><div class="s-eyebrow">${ic('shield')} E-signatures with compliance built in</div>
        <h1>Get documents signed the right way, in every country you work in.</h1>
        <p class="s-lead">${esc(c.brand)} sends offer letters, NDAs and contracts for e-signature, checks each one against local e-signature law before it goes out, and seals the signed PDF so nobody can change it.</p>
        <div class="s-row">${cta(c, 'register', `Start your ${c.trialDays}-day free trial`, 's-btn s-pri s-lg')}${link(c, '/features', `See all features ${ic('arrow')}`, 's-btn s-lg')}</div>
        <div class="s-ticks"><span>${ic('check')} No card needed</span><span>${ic('check')} Signers need no account</span><span>${ic('check')} GST invoices</span></div></div>
      ${mockDoc(c)}</div></section>
    <section class="s-stats"><div class="s-wrap s-statsin">
      ${[[LIB.length, 'ready-made documents'], [J.length, 'countries’ e-signature rules'], ['AES-256', 'encryption at rest'], ['3', 'signature levels: SES, AES, QES']].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('')}</div></section>
    <section class="s-sec"><div class="s-wrap">
      <div class="s-shead"><h2>How it works</h2><p>From draft to sealed PDF in four steps.</p></div>
      <div class="s-steps">${[['file', 'Upload or pick a template', 'Any PDF, or one of our ready-made letters and agreements.'], ['pen', 'Add fields and people', 'Drag signature fields onto the page and choose the signing order.'], ['globe', 'Check and send', 'Country rules set the signature level and identity checks automatically.'], ['shield', 'Signed and sealed', 'Everyone gets a sealed PDF with a certificate of completion.']].map(([i, t, d], n) => `<div class="s-step"><span class="s-num">${n + 1}</span><span class="s-ic">${ic(i)}</span><h3>${t}</h3><p>${d}</p></div>`).join('')}</div></div></section>
    <section class="s-sec s-alt"><div class="s-wrap">
      <div class="s-shead"><h2>Everything you need to run signatures</h2><p>One platform for sending, signing, proving and staying compliant.</p></div>
      ${cardGrid(FEATURE_GROUPS.slice(0, 8).map((g) => fcard(g.icon, esc(g.title), esc(g.lead), `<ul class="s-mini">${g.items.slice(0, 3).map(([t]) => `<li>${ic('check')}${esc(t)}</li>`).join('')}</ul>`)), 's-g4')}
      <div class="s-center s-mt">${link(c, '/features', `Explore all features ${ic('arrow')}`, 's-btn')}</div></div></section>
    <section class="s-sec"><div class="s-wrap">
      <div class="s-shead"><h2>Built for the way your business signs</h2><p>Teams in every industry use ${esc(c.brand)} to stop chasing paper.</p></div>
      ${cardGrid(SOLUTIONS.map((s) => `<a class="s-card s-link" href="${esc(c.base)}/solutions/${s.slug}" data-nav="/solutions/${s.slug}"><span class="s-ic">${ic(s.icon)}</span><h3>${esc(s.name)}</h3><p>${esc(s.short)}</p><span class="s-more">Learn more ${ic('arrow')}</span></a>`), 's-g5')}</div></section>
    <section class="s-sec s-dark"><div class="s-wrap">
      <div class="s-shead"><h2>Protection you can show an auditor</h2><p>Security for documents, signatures and accounts at every step.</p></div>
      ${cardGrid([['lock', 'Encrypted storage', 'AES-256 encryption for every file, signature and field value.'], ['shield', 'Tamper-evident seal', 'Signed PDFs are sealed. Any later change is flagged by PDF readers.'], ['clock', 'Unalterable audit trail', 'Each event is chained to the previous one; edits and deletions are refused.'], ['finger', 'Signer verification', 'Access codes, email one-time codes and ID checks before the document opens.'], ['key', 'Two-factor login', 'Authenticator-app codes and backup codes, mandatory if you choose.'], ['users', 'Roles and permissions', 'Six ready roles plus custom roles from 15 permissions.']].map(([i, t, d]) => fcard(i, t, d)), 's-g3')}
      <div class="s-center s-mt">${link(c, '/security', `How we protect your documents ${ic('arrow')}`, 's-btn s-white')}</div></div></section>
    <section class="s-sec"><div class="s-wrap s-split">
      <div><div class="s-eyebrow">${ic('file')} ${LIB.length} templates</div><h2>Ready-made documents, ready to send</h2><p class="s-lead">Fill in a few details and send. Every template has its signature fields already in place.</p>
        <div class="s-chips">${LIB.slice(0, 12).map((t) => link(c, `/templates/${t.key}`, esc(t.name), 's-chip')).join('')}</div>
        <div class="s-mt">${link(c, '/templates', `Browse all templates ${ic('arrow')}`, 's-btn')}</div></div>
      <div><div class="s-eyebrow">${ic('globe')} ${J.length} countries</div><h2>Compliance checked before you press send</h2><p class="s-lead">Rules for ${J.length} countries decide the signature level, identity checks and formalities such as stamp duty or notarisation.</p>
        <div class="s-chips">${J.map((j) => `<span class="s-chip s-code" title="${esc(j.name)}">${esc(j.code)}</span>`).join('')}</div>
        <div class="s-mt">${link(c, '/compliance', `See country rules ${ic('arrow')}`, 's-btn')}</div></div></div></section>
    <section class="s-sec s-alt" id="pricing"><div class="s-wrap">
      <div class="s-shead"><h2>Simple, honest pricing</h2><p>Start free. Upgrade when your team grows.</p></div>
      ${priceToggles(c)}${planCards(c, { short: true })}${taxNote(c)}
      <div class="s-center s-mt">${link(c, '/pricing', `Compare plans in detail ${ic('arrow')}`, 's-btn')}</div></div></section>
    <section class="s-sec"><div class="s-wrap">
      <div class="s-shead"><h2>Why teams choose ${esc(c.brand)}</h2></div>
      <div class="s-why">${[['Priced in rupees', 'Pay by UPI, card or net banking, with GST invoices. USD for international customers.'], ['Indian document formats', 'Offer, appraisal and relieving letters, rental and loan agreements, board resolutions.'], ['Compliance before you send', 'Country rules, risk score and formalities checked on every document.'], ['Your brand everywhere', 'Signers see your company name and colors on emails, pages and certificates.'], ['Proof that stands up', 'Sealed PDF, certificate of completion and an audit trail nobody can edit.'], ['Private deployment', 'Enterprise customers can run it on their own servers with their own keys.']].map(([t, d]) => `<div>${ic('check')}<div><b>${t}</b><p>${d}</p></div></div>`).join('')}</div></div></section>
    <section class="s-sec s-alt"><div class="s-wrap s-narrow"><div class="s-shead"><h2>Questions</h2></div>${faq(FAQ)}</div></section>
    ${ctaBand(c)}` };
  };

  PAGES['/features'] = (c) => ({ title: `Features — ${c.brand}`, description: 'Prepare, send, sign, seal and prove: every feature of the platform, from templates and signing order to compliance checks, roles and GST billing.', html: `
    ${head('Features', 'Everything you need, from first draft to sealed PDF', `${esc(c.brand)} covers the whole signing journey: preparing documents, collecting signatures, proving who signed, and keeping you compliant.`,
      `<div class="s-jump">${FEATURE_GROUPS.map((g) => `<a href="#f-${g.id}" data-anchor="f-${g.id}">${ic(g.icon)}${esc(g.title)}</a>`).join('')}</div>`)}
    ${FEATURE_GROUPS.map((g, i) => `<section class="s-sec ${i % 2 ? 's-alt' : ''}" id="f-${g.id}"><div class="s-wrap s-fsplit">
      <div><span class="s-ic s-ic-lg">${ic(g.icon)}</span><h2>${esc(g.title)}</h2><p class="s-lead">${esc(g.lead)}</p></div>
      <div class="s-flist">${g.items.map(([t, d]) => `<div>${ic('check')}<div><b>${esc(t)}</b><p>${esc(d)}</p></div></div>`).join('')}</div></div></section>`).join('')}
    ${ctaBand(c, 'Try every feature free', `Your ${c.trialDays}-day trial includes the Business plan. No card needed.`)}` });

  PAGES['/solutions'] = (c) => ({ title: `Solutions — ${c.brand}`, description: 'How HR teams, agencies, clinics, lenders, property managers and enterprises use electronic signatures.', html: `
    ${head('Solutions', 'Built for the way your business signs', 'Pick your industry to see the documents, workflow and plan that fit.')}
    <section class="s-sec"><div class="s-wrap">${cardGrid(SOLUTIONS.map((s) => `<a class="s-card s-link s-sol" href="${esc(c.base)}/solutions/${s.slug}" data-nav="/solutions/${s.slug}"><span class="s-ic">${ic(s.icon)}</span><h3>${esc(s.name)}</h3><p><b>${esc(s.short)}</b></p><p>${esc(s.pain)}</p><span class="s-more">See how ${ic('arrow')}</span></a>`), 's-g2')}</div></section>
    ${ctaBand(c, 'Not sure where to start?', 'Tell us how your team signs today and we will set up your first template with you.')}` });

  function solutionPage(c, s) {
    const tpls = s.templates.map((k) => tplByKey(c, k)).filter(Boolean);
    const plan = c.plans.find((p) => p.id === s.plan);
    return { title: `${s.name} — ${c.brand}`, description: `${s.short} ${s.pain}`, html: `
    ${head(`${link(c, '/solutions', 'Solutions')} / ${esc(s.name)}`, esc(s.short), esc(s.pain), `<div class="s-row s-mt">${cta(c, 'register', 'Start free trial', 's-btn s-pri s-lg', s.plan)}${link(c, `/contact?topic=${s.slug}`, 'Talk to us', 's-btn s-lg')}</div>`)}
    <section class="s-sec"><div class="s-wrap s-fsplit">
      <div><span class="s-ic s-ic-lg">${ic(s.icon)}</span><h2>Who it is for</h2><p class="s-lead">${esc(s.who)}</p>${plan ? `<div class="s-note">${ic('star')}<div><b>Recommended plan: ${esc(plan.name)}</b><p>${esc(plan.tagline || '')}</p></div></div>` : ''}${s.note ? `<div class="s-note warn">${ic('bell')}<div><b>Good to know</b><p>${esc(s.note)}</p></div></div>` : ''}</div>
      <div><h3 class="s-h3">How ${esc(c.brand)} helps</h3><div class="s-flist">${s.how.map((t) => `<div>${ic('check')}<div><b>${esc(t)}</b></div></div>`).join('')}</div></div></div></section>
    <section class="s-sec s-alt"><div class="s-wrap"><div class="s-shead"><h2>The workflow</h2></div>
      <div class="s-steps">${s.steps.map((t, n) => `<div class="s-step"><span class="s-num">${n + 1}</span><h3>${esc(t)}</h3></div>`).join('')}</div></div></section>
    ${tpls.length ? `<section class="s-sec"><div class="s-wrap"><div class="s-shead"><h2>Templates for this</h2><p>Open one to read the full text.</p></div>${cardGrid(tpls.map((t) => `<a class="s-card s-link" href="${esc(c.base)}/templates/${t.key}" data-nav="/templates/${t.key}"><span class="s-ic">${ic('file')}</span><h3>${esc(t.name)}</h3><p>${esc(t.description)}</p><span class="s-more">Preview ${ic('arrow')}</span></a>`), 's-g3')}</div></section>` : ''}
    <section class="s-sec s-alt"><div class="s-wrap"><div class="s-shead"><h2>Other industries</h2></div><div class="s-chips s-center">${SOLUTIONS.filter((x) => x !== s).map((x) => link(c, `/solutions/${x.slug}`, `${ic(x.icon)} ${esc(x.name)}`, 's-chip')).join('')}</div></div></section>
    ${ctaBand(c)}` };
  }

  PAGES['/templates'] = (c) => {
    const LIB = c.templates.LIBRARY || [];
    const cats = [...new Set(LIB.map((t) => t.category))];
    return { title: `Document templates — ${c.brand}`, description: `${LIB.length} ready-made documents for e-signature: NDAs, offer, appointment and appraisal letters, agreements and consent forms.`, html: `
    ${head('Templates', `${LIB.length} ready-made documents`, 'Fill in a few details, and the text and signature fields are ready. Use them as they are or adapt the wording to your policies.',
      `<div class="s-jump">${cats.map((k) => `<a href="#c-${k.replace(/\W+/g, '-').toLowerCase()}" data-anchor="c-${k.replace(/\W+/g, '-').toLowerCase()}">${esc(k)}</a>`).join('')}</div>`)}
    ${cats.map((k, i) => `<section class="s-sec ${i % 2 ? 's-alt' : ''}" id="c-${k.replace(/\W+/g, '-').toLowerCase()}"><div class="s-wrap"><h2 class="s-h2l">${esc(k)}</h2>
      ${cardGrid(LIB.filter((t) => t.category === k).map((t) => `<a class="s-card s-link" href="${esc(c.base)}/templates/${t.key}" data-nav="/templates/${t.key}"><span class="s-ic">${ic('file')}</span><h3>${esc(t.name)}</h3><p>${esc(t.description)}</p><p class="s-muted s-small">${(t.roles || []).length} signer${(t.roles || []).length === 1 ? '' : 's'} · ${(t.vars || []).length} details to fill in</p><span class="s-more">Preview ${ic('arrow')}</span></a>`), 's-g3')}</div></section>`).join('')}
    <section class="s-sec"><div class="s-wrap s-narrow s-center"><h2>Have your own documents?</h2><p class="s-lead">Upload any PDF, place the fields once and save it as a template for your whole team.</p></div></section>
    ${ctaBand(c)}` };
  };

  function templatePage(c, t) {
    const T = c.templates;
    const vals = T.exampleValues ? T.exampleValues(t) : {};
    const fill = (s) => (T.fillText ? T.fillText(s, t, vals) : s);
    const body = (t.paras || []).map((p) => {
      if (p.startsWith('# ')) return `<h4>${esc(fill(p.slice(2)))}</h4>`;
      if (p.startsWith('- ')) return `<p class="s-li">• ${esc(fill(p.slice(2)))}</p>`;
      if (p.startsWith('kv:')) { const [k, v] = fill(p.slice(3)).split('|'); return `<div class="s-kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`; }
      return `<p>${esc(fill(p))}</p>`;
    }).join('');
    const related = (c.templates.LIBRARY || []).filter((x) => x.category === t.category && x.key !== t.key).slice(0, 3);
    return { title: `${t.name} template — ${c.brand}`, description: t.description, html: `
    ${head(`${link(c, '/templates', 'Templates')} / ${esc(t.category)}`, esc(t.name), esc(t.description), `<div class="s-row s-mt">${cta(c, 'register', 'Use this template free', 's-btn s-pri s-lg')}</div>`)}
    <section class="s-sec"><div class="s-wrap s-tsplit">
      <div class="s-paper"><div class="s-mh">${esc(fill(t.title || t.name))}</div>${t.subtitle ? `<div class="s-ms">${esc(fill(t.subtitle))}</div>` : ''}${body}
        <div class="s-sigs">${(t.roles || []).map(([r]) => `<div class="s-sig"><span>${ic('pen')} Signature</span><small>${esc(r)}</small></div>`).join('')}</div>
        <p class="s-muted s-small s-center">Sample text with example details. Have documents reviewed for your jurisdiction before relying on them.</p></div>
      <aside class="s-side"><div class="s-card"><h3>Details you fill in</h3><ul class="s-mini">${(t.vars || []).map(([, l]) => `<li>${ic('check')}${esc(l)}</li>`).join('')}</ul></div>
        <div class="s-card"><h3>Who signs</h3><ul class="s-mini">${(t.roles || []).map(([r]) => `<li>${ic('pen')}${esc(r)}</li>`).join('')}</ul></div>
        <div class="s-card"><h3>Included automatically</h3><ul class="s-mini"><li>${ic('globe')}Compliance check</li><li>${ic('shield')}Sealed PDF</li><li>${ic('file')}Certificate of completion</li></ul></div></aside></div></section>
    ${related.length ? `<section class="s-sec s-alt"><div class="s-wrap"><div class="s-shead"><h2>More ${esc(t.category)} templates</h2></div>${cardGrid(related.map((x) => `<a class="s-card s-link" href="${esc(c.base)}/templates/${x.key}" data-nav="/templates/${x.key}"><span class="s-ic">${ic('file')}</span><h3>${esc(x.name)}</h3><p>${esc(x.description)}</p></a>`), 's-g3')}</div></section>` : ''}
    ${ctaBand(c)}` };
  }

  PAGES['/security'] = (c) => ({ title: `Security — ${c.brand}`, description: 'How documents, signatures and accounts are protected: AES-256 encryption, sealed PDFs, an unalterable audit trail, signer verification and two-factor login.', html: `
    ${head('Security', 'How we protect your documents and signatures', 'Every layer is designed so you can prove what was signed, by whom and when, and so nobody can quietly change it afterwards.',
      `<div class="s-jump">${SECURITY_GROUPS.map((g, i) => `<a href="#sg-${i}" data-anchor="sg-${i}">${ic(g.icon)}${esc(g.title)}</a>`).join('')}<a href="${esc(c.verifyUrl)}">${ic('eye')}Verify a document</a></div>`)}
    ${SECURITY_GROUPS.map((g, i) => `<section class="s-sec ${i % 2 ? 's-alt' : ''}" id="sg-${i}"><div class="s-wrap"><div class="s-shead s-left"><span class="s-ic s-ic-lg">${ic(g.icon)}</span><h2>${esc(g.title)}</h2></div>
      ${cardGrid(g.items.map(([t, d], n) => `<div class="s-card"><span class="s-num">${n + 1}</span><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`), 's-g2')}</div></section>`).join('')}
    <section class="s-sec s-dark"><div class="s-wrap s-fsplit"><div><h2>Check any signed document yourself</h2><p class="s-lead">Upload a signed PDF to confirm it came from ${esc(c.brand)} and has not been changed since it was sealed.</p></div><div class="s-center"><a class="s-btn s-white s-lg" href="${esc(c.verifyUrl)}">${ic('shield')} Verify a document</a></div></div></section>
    <section class="s-sec"><div class="s-wrap s-narrow"><div class="s-shead"><h2>Good to know</h2></div><div class="s-flist">
      <div>${ic('finger')}<div><b>ID checks</b><p>Government ID verification uses a connected identity-verification provider and is available on Business and Enterprise plans.</p></div></div>
      <div>${ic('key')}<div><b>Qualified and certificate-based signatures</b><p>Where the law requires them (for example Aadhaar eSign in India or qualified signatures in the EU), they are provided through a licensed trust service provider on the Enterprise plan.</p></div></div>
      <div>${ic('users')}<div><b>Your part</b><p>Turn on two-factor login, give people the lowest role they need, and remove access when someone leaves. We give you the tools; the activity log shows they are being used.</p></div></div>
      <div>${ic('mail')}<div><b>Report a security issue</b><p>${c.contact?.email ? `Write to <a href="mailto:${esc(c.contact.email)}">${esc(c.contact.email)}</a>.` : 'Use the contact page.'} We investigate every report.</p></div></div></div></div></section>
    ${ctaBand(c)}` });

  PAGES['/compliance'] = (c) => {
    const R = c.rules; const J = R.JURISDICTIONS || [];
    const cat = (k) => R.CATEGORIES?.[k]?.label || k;
    const req = (v) => (LEVEL_TEXT[v] ? `${LEVEL_TEXT[v]} required` : R.FORMALITY_TEXT?.[v] || v);
    const regions = [...new Set(J.map((j) => j.region))];
    return { title: `E-signature compliance in ${J.length} countries — ${c.brand}`, description: `Electronic signature laws, signature levels, record-keeping and excluded documents for ${J.length} countries, checked automatically before you send.`, html: `
    ${head('Compliance', `E-signature rules for ${J.length} countries`, 'Before a document is sent, we check the countries involved, the type of document and its value. Here is what we check against.')}
    <section class="s-sec"><div class="s-wrap">
      <div class="s-steps">${[['globe', 'Blocks what is not allowed', 'If a document type cannot be e-signed in a selected country, sending is stopped with the reason.'], ['shield', 'Sets the signature level', 'Simple, advanced or qualified, from the strictest rule that applies.'], ['chart', 'Scores the risk', '0–100 from document type, value, legal model and cross-border signing. Higher risk means stronger signer checks.'], ['file', 'Lists the formalities', 'Stamp duty, notarisation, witnesses or registration, plus how long to keep the record.']].map(([i, t, d], n) => `<div class="s-step"><span class="s-num">${n + 1}</span><span class="s-ic">${ic(i)}</span><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
      <div class="s-grid s-g3 s-mt">${Object.entries(LEVEL_TEXT).map(([k, v]) => `<div class="s-card"><span class="s-badge">${k}</span><h3>${esc(v)}</h3><p>${esc(R.LEVELS?.[k]?.how || '')}</p></div>`).join('')}</div></div></section>
    <section class="s-sec s-alt"><div class="s-wrap">
      <div class="s-shead s-left"><h2>Country by country</h2><p>Open a country for details. Rules reviewed ${esc(R.RULES_REVIEWED || '')}.</p></div>
      <div class="s-jump">${regions.map((r) => `<a href="#r-${r.replace(/\W+/g, '-').toLowerCase()}" data-anchor="r-${r.replace(/\W+/g, '-').toLowerCase()}">${esc(r)}</a>`).join('')}</div>
      ${regions.map((r) => `<h3 class="s-h3 s-mt" id="r-${r.replace(/\W+/g, '-').toLowerCase()}">${esc(r)}</h3><div class="s-countries">${J.filter((j) => j.region === r).map((j) => `<details class="s-country"><summary><span class="s-code">${esc(j.code)}</span><b>${esc(j.name)}</b><span class="s-model m-${j.model}">${MODEL_SHORT[j.model] || esc(j.model)}</span><span class="s-muted s-small s-hide-xs">Keep ${j.retention} yrs</span></summary>
        <dl><dt>Law</dt><dd>${esc(j.law)}</dd><dt>Approach</dt><dd>${esc(MODEL_TEXT[j.model] || j.model)}</dd><dt>Privacy law</dt><dd>${esc(j.privacy)}</dd><dt>Keep records</dt><dd>${j.retention} years</dd>
        ${(j.excluded || []).length ? `<dt>Cannot be e-signed</dt><dd>${j.excluded.map((x) => esc(cat(x))).join('; ')}</dd>` : ''}
        ${Object.keys(j.requires || {}).length ? `<dt>Extra requirements</dt><dd>${Object.entries(j.requires).map(([k, v]) => `${esc(cat(k))}: ${esc(req(v))}`).join('<br>')}</dd>` : ''}
        ${j.notes ? `<dt>Notes</dt><dd>${esc(j.notes)}</dd>` : ''}</dl></details>`).join('')}</div>`).join('')}
      <p class="s-muted s-small s-mt">This summary is operational guidance, not legal advice. Laws change; confirm requirements for your documents with a lawyer.</p></div></section>
    ${ctaBand(c)}` };
  };

  PAGES['/pricing'] = (c) => {
    const rows = [['Documents per month', (p) => (Number(p.docs_per_month) < 0 ? 'Unlimited' : p.docs_per_month)], ['Users', (p) => (Number(p.users) < 0 ? 'Unlimited' : p.users)], ['Custom templates', (p) => (Number(p.templates) < 0 ? 'Unlimited' : p.templates)],
      ...Object.entries(c.features).map(([k, l]) => [l, (p) => ((p.features || []).includes(k) ? ic('check', 's-yes') : '<span class="s-no">–</span>')])];
    return { title: `Pricing — ${c.brand}`, description: `Plans from Free to Enterprise, in INR or USD, with a ${c.trialDays}-day free trial and GST invoices.`, html: `
    ${head('Pricing', 'Simple plans that grow with you', `Start with a ${c.trialDays}-day free trial of every paid feature. No card needed.`)}
    <section class="s-sec"><div class="s-wrap">${priceToggles(c)}${planCards(c)}${taxNote(c)}</div></section>
    <section class="s-sec s-alt"><div class="s-wrap"><div class="s-shead"><h2>Compare plans</h2></div>
      <div class="s-tw"><table class="s-cmp"><thead><tr><th></th>${c.plans.map((p) => `<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${rows.map(([l, f]) => `<tr><td>${esc(l)}</td>${c.plans.map((p) => `<td>${f(p)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div></section>
    <section class="s-sec"><div class="s-wrap s-fsplit"><div><span class="s-ic s-ic-lg">${ic('server')}</span><h2>Need more?</h2><p class="s-lead">High volume, private deployment on your own servers, your own brand, Aadhaar eSign or a qualified trust provider, and priority support.</p></div>
      <div class="s-center">${link(c, '/contact?topic=enterprise', 'Talk to sales', 's-btn s-pri s-lg')}</div></div></section>
    <section class="s-sec s-alt"><div class="s-wrap s-narrow"><div class="s-shead"><h2>Billing questions</h2></div>${faq([
      ['How does the free trial work?', `You get the ${c.plans.find((p) => p.highlight)?.name || 'Business'} plan free for ${c.trialDays} days. Choose a plan any time; if you do not, you move to Free and keep your signed documents.`],
      ['How can I pay?', 'UPI, cards and net banking in rupees, or international cards in US dollars.'],
      ['What counts as a document?', 'Each document you send for signature in a billing period, however many people sign it. Drafts and templates do not count.'],
      ['Can I change plans?', 'Yes. Upgrade any time. Paying again for the same plan extends your period.'],
      ['Do prices include tax?', c.currency === 'INR' ? `Prices exclude ${c.taxRate}% ${c.taxLabel}, which is shown on your invoice.` : 'Applicable taxes are shown on your invoice.'],
      ['What happens if I stop paying?', 'After a short grace period your workspace moves to the Free plan. Nothing you have signed is deleted.']])}</div></section>
    ${ctaBand(c)}` };
  };

  PAGES['/contact'] = (c, q) => {
    const ct = c.contact || {};
    const topic = q.topic || '';
    const topics = [['demo', 'Book a demo'], ['sales', 'Pricing and plans'], ['enterprise', 'Enterprise or private deployment'], ['support', 'Help with my account'], ['partner', 'Partner or reseller'], ['other', 'Something else']];
    const sel = topics.some(([k]) => k === topic) ? topic : SOLUTIONS.some((s) => s.slug === topic) ? 'demo' : 'demo';
    return { title: `Contact — ${c.brand}`, description: 'Book a demo, ask about pricing or get help.', html: `
    ${head('Contact', 'Talk to us', 'Book a demo, ask about plans, or tell us what you need. We reply within one business day.')}
    <section class="s-sec"><div class="s-wrap s-tsplit">
      <form class="s-card s-form" id="s-contact" novalidate>
        <div class="s-f2"><label>Your name<input name="name" required maxlength="100" autocomplete="name"></label><label>Work email<input name="email" type="email" required maxlength="160" autocomplete="email"></label></div>
        <div class="s-f2"><label>Company<input name="company" maxlength="120" autocomplete="organization"></label><label>Phone<input name="phone" maxlength="30" autocomplete="tel"></label></div>
        <div class="s-f2"><label>What can we help with?<select name="topic">${topics.map(([k, l]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Team size<select name="size">${['Just me', '2–10', '11–50', '51–200', '200+'].map((x) => `<option>${x}</option>`).join('')}</select></label></div>
        <label>Message<textarea name="message" rows="5" maxlength="2000" placeholder="Tell us about the documents you sign today">${SOLUTIONS.find((s) => s.slug === topic) ? esc(`I'm interested in ${SOLUTIONS.find((s) => s.slug === topic).name}.`) : ''}</textarea></label>
        <label class="s-hp" aria-hidden="true">Leave empty<input name="website" tabindex="-1" autocomplete="off"></label>
        <button class="s-btn s-pri s-lg" type="submit">Send message</button><p class="s-small s-muted" data-msg></p></form>
      <aside class="s-side">
        <div class="s-card"><h3>${ic('zap')} Fastest way to see it</h3><p>Start a free trial and send yourself a document. It takes two minutes.</p>${cta(c, 'register', 'Start free trial', 's-btn s-pri s-block')}</div>
        ${ct.email || ct.phone || ct.address || ct.whatsapp ? `<div class="s-card"><h3>Reach us directly</h3><ul class="s-mini">${ct.email ? `<li>${ic('mail')}<a href="mailto:${esc(ct.email)}">${esc(ct.email)}</a></li>` : ''}${ct.phone ? `<li>${ic('phone')}<a href="tel:${esc(ct.phone.replace(/\s/g, ''))}">${esc(ct.phone)}</a></li>` : ''}${ct.whatsapp ? `<li>${ic('whatsapp')}<a href="https://wa.me/${esc(ct.whatsapp.replace(/\D/g, ''))}" rel="noopener" target="_blank">WhatsApp</a></li>` : ''}${ct.address ? `<li>${ic('building')}${esc(ct.address)}</li>` : ''}</ul></div>` : ''}
        <div class="s-card"><h3>Already a customer?</h3><p>Sign in to manage your documents and billing.</p>${cta(c, 'signin', 'Sign in', 's-btn s-block')}</div></aside></div></section>` };
  };

  const DEFAULT_LEGAL = {
    terms: `## About these terms
These terms apply to your use of {{brand}}, an electronic signature service provided by {{company}} ("we", "us"). By creating an account you agree to them on behalf of yourself and the organisation you represent.

## Your account
You must give accurate information, keep your password and two-factor codes secret, and tell us promptly about any unauthorised use. You are responsible for the people you invite to your workspace and the roles you give them.

## Using the service
You may use the service to prepare, send and sign documents for lawful purposes. You must not upload unlawful content, send documents to people without a legitimate reason, try to break or overload the service, or resell it without our written permission.

## Your documents
You own the documents and data you upload. You give us permission to store, process and transmit them only to provide the service. You are responsible for deciding whether an electronic signature is appropriate for a particular document and jurisdiction; our compliance checks are guidance, not legal advice.

## Plans, payment and renewal
Paid plans are prepaid for a month or a year at the prices shown when you pay, plus applicable taxes. Plans do not renew automatically unless stated at checkout. If a plan ends, your workspace moves to the Free plan after a grace period and your signed documents remain available.

## Availability and support
We work to keep the service available and secure but cannot promise it will be uninterrupted. We may change features from time to time and will give notice of material changes.

## Liability
To the extent permitted by law, our total liability for any claim is limited to the fees you paid us in the 12 months before the claim, and we are not liable for indirect or consequential losses.

## Ending your use
You may stop using the service at any time. We may suspend accounts that breach these terms. You can download your signed documents before closing your account.

## Governing law
These terms are governed by the laws of India, and the courts at {{city}} have jurisdiction.

## Contact
Questions about these terms: {{email}}.`,
    privacy: `## Who we are
{{brand}} is provided by {{company}}. This policy explains what personal data we process and why.

## What we collect
Account details (name, email, company, password hash), billing details (billing email, address, GSTIN; card and UPI details are handled by our payment provider), documents you upload and their contents, and signing evidence (names, emails, IP addresses, device information, times and verification results).

## Why we use it
To provide the e-signature service, prove who signed what and when, secure accounts, send service emails, issue invoices, meet legal obligations and respond to support requests. We do not sell personal data.

## Signers
When you send a document, you decide who receives it. We process signers' data on your behalf to deliver and record the signature.

## Security
Documents, signatures and field values are encrypted at rest with AES-256. Signed PDFs are sealed, and the audit trail cannot be edited. Access is limited by roles and protected by two-factor login.

## How long we keep it
Signed records are kept for the record-keeping period that applies to the document, or longer if you choose. Other account data is kept while your account is active and for a limited time afterwards.

## Sharing
We share data only with service providers who help us run the service (hosting, email delivery, payments, identity verification where you enable it), under confidentiality obligations, or where the law requires.

## Your rights
You can access, correct or delete your personal data, subject to records we must keep by law. Under India's Digital Personal Data Protection Act, 2023 and other applicable laws you may also withdraw consent and raise a grievance. Contact {{email}}.

## Changes
We will post changes to this policy here and tell account owners about significant changes.`,
  };
  function legalText(c, kind) {
    const ct = c.contact || {};
    const raw = (c.legal && c.legal[kind]) || DEFAULT_LEGAL[kind];
    const txt = raw.replace(/\{\{brand\}\}/g, c.brand).replace(/\{\{company\}\}/g, ct.company || c.brand).replace(/\{\{email\}\}/g, ct.email || 'the contact page').replace(/\{\{city\}\}/g, ct.city || 'Hyderabad');
    return txt.split(/\n{2,}/).map((b) => (b.startsWith('## ') ? `<h2>${esc(b.slice(3).split('\n')[0])}</h2>${b.split('\n').slice(1).map((l) => `<p>${esc(l)}</p>`).join('')}` : b.split('\n').map((l) => `<p>${esc(l)}</p>`).join(''))).join('');
  }
  PAGES['/terms'] = (c) => ({ title: `Terms of service — ${c.brand}`, description: `Terms for using ${c.brand}.`, html: `${head('Legal', 'Terms of service', '')}<section class="s-sec"><div class="s-wrap s-narrow s-legal">${legalText(c, 'terms')}</div></section>` });
  PAGES['/privacy'] = (c) => ({ title: `Privacy policy — ${c.brand}`, description: `How ${c.brand} handles personal data.`, html: `${head('Legal', 'Privacy policy', '')}<section class="s-sec"><div class="s-wrap s-narrow s-legal">${legalText(c, 'privacy')}</div></section>` });

  PAGES['/404'] = (c) => ({ title: `Page not found — ${c.brand}`, description: '', html: `${head('404', 'We could not find that page', 'It may have moved. Try one of these instead.', `<div class="s-row s-mt">${link(c, '/', 'Home', 's-btn s-pri')}${link(c, '/features', 'Features', 's-btn')}${link(c, '/pricing', 'Pricing', 's-btn')}${cta(c, 'signin', 'Sign in', 's-btn')}</div>`)}` });

  // ------------------------------------------------------------------ public API
  const ROUTES = ['/', '/features', '/solutions', '/templates', '/security', '/compliance', '/pricing', '/contact', '/terms', '/privacy'];
  function paths(ctx) {
    const c = ctxDefaults(ctx);
    return [...ROUTES, ...SOLUTIONS.map((s) => `/solutions/${s.slug}`), ...(c.templates.LIBRARY || []).map((t) => `/templates/${t.key}`)];
  }
  /** Returns null when the path is not a website page. */
  function render(fullPath, ctx) {
    const c = ctxDefaults(ctx);
    const [pth, qs] = String(fullPath || '/').split('?');
    const p = (pth.replace(/\/+$/, '') || '/');
    const q = Object.fromEntries(String(qs || '').split('&').filter(Boolean).map((kv) => kv.split('=').map((x) => decodeURIComponent(x.replace(/\+/g, ' ')))));
    let page = null, active = p;
    if (PAGES[p]) page = PAGES[p](c, q);
    else if (p.startsWith('/solutions/')) { const s = SOLUTIONS.find((x) => x.slug === p.slice(11)); if (s) { page = solutionPage(c, s); active = '/solutions'; } }
    else if (p.startsWith('/templates/')) { const t = tplByKey(c, p.slice(11)); if (t) { page = templatePage(c, t); active = '/templates'; } }
    if (!page) return null;
    return { title: page.title, description: page.description, html: `<div class="sf-site">${header(c, active)}<main id="s-main">${page.html}</main>${footer(c)}</div>` };
  }

  /** Interactivity. hooks: { onNav(path), onAction(kind, plan), onContact(data) -> Promise<string> } */
  function wire(rootEl, ctx, hooks = {}) {
    const c = ctxDefaults(ctx);
    const $$ = (s) => Array.from(rootEl.querySelectorAll(s));
    const state = { cur: c.currency, iv: 'year' };
    const drawPrices = () => {
      $$('.s-price').forEach((el) => { el.hidden = el.dataset.k !== `${state.cur}-${state.iv}`; });
      $$('[data-tg="cur"] button').forEach((b) => b.classList.toggle('on', b.dataset.v === state.cur));
      $$('[data-tg="iv"] button').forEach((b) => b.classList.toggle('on', b.dataset.v === state.iv));
      $$('[data-taxnote]').forEach((el) => { el.textContent = `${state.cur === 'INR' ? `Prices exclude ${c.taxRate}% ${c.taxLabel}. ` : ''}Every paid plan starts with a ${c.trialDays}-day free trial.`; });
    };
    $$('[data-tg] button').forEach((b) => b.addEventListener('click', () => { state[b.parentElement.dataset.tg] = b.dataset.v; drawPrices(); }));
    const menu = rootEl.querySelector('#s-menu'), links = rootEl.querySelector('#s-links');
    if (menu && links) menu.addEventListener('click', () => { const open = links.classList.toggle('open'); menu.setAttribute('aria-expanded', String(open)); });
    $$('[data-anchor]').forEach((a) => a.addEventListener('click', (e) => { const t = rootEl.querySelector(`#${a.dataset.anchor}`); if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }));
    if (hooks.onNav) $$('[data-nav]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); hooks.onNav(a.dataset.nav); }));
    if (hooks.onAction) $$('[data-act]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); hooks.onAction(a.dataset.act, a.dataset.plan || null); }));
    const form = rootEl.querySelector('#s-contact');
    if (form) form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = form.querySelector('[data-msg]');
      const data = Object.fromEntries(new FormData(form));
      if (!String(data.name || '').trim() || !/^\S+@\S+\.\S+$/.test(String(data.email || ''))) { msg.textContent = 'Please enter your name and a valid email address.'; msg.className = 's-small s-err'; return; }
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        const out = hooks.onContact ? await hooks.onContact(data) : 'Thanks. We will be in touch.';
        form.innerHTML = `<div class="s-done">${ic('check')}<h3>Message sent</h3><p>${esc(out || 'Thanks. We will be in touch within one business day.')}</p></div>`;
      } catch (err) { msg.textContent = err.message || 'Could not send. Please try again.'; msg.className = 's-small s-err'; btn.disabled = false; }
    });
    drawPrices();
  }

  /** Minimal page shown instead of the website when the platform is private. */
  function renderPrivate(ctx) {
    const c = ctxDefaults(ctx);
    return { title: `${c.brand} — private workspace`, description: '', html: `<div class="sf-site s-private"><main class="s-pmain"><div class="s-pcard">
      <span class="s-logo s-logo-lg">${ic('lock')}</span><h1>${esc(c.brand)}</h1>
      <p class="s-muted">This is a private workspace. Sign in with the account your administrator gave you.</p>
      ${cta(c, 'signin', 'Sign in', 's-btn s-pri s-lg s-block')}
      <p class="s-small s-muted">Received a document to sign? Use the link in your email. You don't need an account.</p>
      <p class="s-small"><a href="${esc(c.verifyUrl)}" class="s-link-u">Verify a signed document</a></p></div></main></div>` };
  }

  const api = { render, renderPrivate, wire, paths, SOLUTIONS, FEATURE_GROUPS, SECURITY_GROUPS, DEFAULT_LEGAL, icon: ic };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SFSite = api;
})(typeof window !== 'undefined' ? window : globalThis);
