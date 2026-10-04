/*
 * SignFlow compliance rules & risk engine.
 * Shared by the server (enforcement) and the browser (live preview). No dependencies.
 *
 * IMPORTANT: This is an operational rules library, not legal advice. Laws change and
 * many have sector- or state-level variations. Review with qualified counsel for each
 * jurisdiction you operate in, and update RULES_REVIEWED when you do.
 */
(function (root) {
  const RULES_REVIEWED = '2026-10-02';

  // Signature assurance levels the platform understands (eIDAS vocabulary, mapped worldwide).
  const LEVELS = {
    SES: { rank: 1, name: 'Simple electronic signature', how: 'Email link, intent to sign, e-sign consent and a full audit trail.' },
    AES: { rank: 2, name: 'Advanced electronic signature', how: 'Signer uniquely identified (OTP + ID verification), signature bound to the document hash and sealed so any later change is detectable.' },
    QES: { rank: 3, name: 'Qualified / certificate-based signature', how: 'Signed with a certificate from an accredited trust service provider (e.g. EU QTSP, Aadhaar eSign/DSC in India, ICP-Brasil, e-Mudhra, UAE Pass).' },
  };

  // Document categories and their inherent risk (0-100 scale contribution).
  const CATEGORIES = {
    nda: { label: 'NDA / confidentiality', base: 5 },
    commercial: { label: 'Commercial contract / service agreement', base: 10 },
    sales: { label: 'Sales order / quote / invoice approval', base: 8 },
    hr_offer: { label: 'Employment offer or contract', base: 18 },
    hr_termination: { label: 'Employment termination / settlement', base: 35 },
    consumer: { label: 'Consumer agreement / disclosure', base: 25 },
    lease: { label: 'Residential or commercial lease', base: 25 },
    real_estate: { label: 'Sale or transfer of real property', base: 60 },
    loan: { label: 'Loan, credit or guarantee', base: 45 },
    negotiable: { label: 'Promissory note / bill of exchange', base: 60 },
    poa: { label: 'Power of attorney', base: 55 },
    corporate: { label: 'Board / shareholder resolution', base: 25 },
    healthcare: { label: 'Healthcare / patient consent', base: 35 },
    government: { label: 'Government or court filing', base: 45 },
    will: { label: 'Will, codicil or testamentary trust', base: 100 },
    trust: { label: 'Trust deed', base: 70 },
    family: { label: 'Family law (marriage, divorce, adoption)', base: 90 },
  };

  const VALUE_BANDS = [
    { id: 'lt10k', label: 'Under US$10k', add: 0 },
    { id: '10k_100k', label: 'US$10k – 100k', add: 8 },
    { id: '100k_1m', label: 'US$100k – 1M', add: 15 },
    { id: 'gt1m', label: 'Over US$1M', add: 25 },
  ];

  // How each verification control lowers residual risk.
  const CONTROLS = {
    email: { label: 'Email link verification', reduce: 0 },
    access_code: { label: 'Access code shared out-of-band', reduce: 6 },
    otp: { label: 'One-time passcode (email/SMS)', reduce: 12 },
    id_check: { label: 'Government ID verification', reduce: 20 },
    qes: { label: 'Qualified certificate (via trust provider)', reduce: 30 },
  };

  /*
   * Jurisdictions. model: open (any e-signature works unless excluded), tiered (higher tiers
   * carry stronger legal presumptions / are required for some acts), restrictive (only
   * certificate-based signatures equal handwriting).
   * excluded: categories that cannot be validly e-signed (use wet ink / notary).
   * requires: per-category minimum level or formality: 'AES' | 'QES' | 'notary' | 'witness' | 'consumer_consent' | 'stamp_duty' | 'registration'.
   */
  const J = [
    { code: 'US', name: 'United States', region: 'Americas', model: 'open', law: 'ESIGN Act (2000) + UETA (49 states) / NY ESRA', privacy: 'State privacy laws (CCPA/CPRA etc.), HIPAA, GLBA', retention: 7,
      excluded: ['will', 'family'], requires: { consumer: 'consumer_consent', real_estate: 'notary', government: 'AES' },
      notes: 'Consumer disclosures need prior ESIGN §101(c) consent. Deeds for recording usually need notarisation (remote online notarisation is allowed in most states). Court orders, utility-cutoff, foreclosure and recall notices are excluded. FDA-regulated records need 21 CFR Part 11 controls.' },
    { code: 'CA', name: 'Canada', region: 'Americas', model: 'open', law: 'PIPEDA Part 2 + provincial Electronic Commerce Acts; Québec IT Framework Act', privacy: 'PIPEDA, Québec Law 25', retention: 7,
      excluded: ['will', 'family'], requires: { real_estate: 'registration', poa: 'witness', negotiable: 'AES' },
      notes: 'Wills, powers of attorney for personal care and some land transfers are excluded or need witnessing under provincial law. Québec requires French-language versions of standard-form contracts.' },
    { code: 'MX', name: 'Mexico', region: 'Americas', model: 'tiered', law: 'Commercial Code (Arts. 89–114) + Ley de Firma Electrónica Avanzada', privacy: 'LFPDPPP', retention: 10,
      excluded: ['will', 'family'], requires: { real_estate: 'notary', government: 'QES', poa: 'notary' },
      notes: 'Government and tax filings use the SAT e.firma (advanced signature). NOM-151 data conservation certificates strengthen evidence for commercial messages.' },
    { code: 'BR', name: 'Brazil', region: 'Americas', model: 'tiered', law: 'MP 2.200-2/2001 (ICP-Brasil) + Law 14.063/2020', privacy: 'LGPD', retention: 10,
      excluded: ['will', 'family'], requires: { real_estate: 'QES', government: 'QES', negotiable: 'AES' },
      notes: 'ICP-Brasil certificates give a legal presumption of authenticity. Property transfers require registry procedures; public bodies may require qualified signatures.' },
    { code: 'AR', name: 'Argentina', region: 'Americas', model: 'restrictive', law: 'Digital Signature Law 25.506 + Civil and Commercial Code', privacy: 'Law 25.326', retention: 10,
      excluded: ['will', 'family', 'real_estate'], requires: { poa: 'notary', negotiable: 'QES', government: 'QES' },
      notes: 'Only a "firma digital" (licensed certificate) is presumed equal to handwriting; a plain "firma electrónica" must be proven by the party relying on it. Acts needing a public deed are excluded.' },
    { code: 'CL', name: 'Chile', region: 'Americas', model: 'tiered', law: 'Law 19.799 on Electronic Documents', privacy: 'Law 19.628 (Law 21.719 reform)', retention: 6,
      excluded: ['will', 'family', 'real_estate'], requires: { government: 'QES', poa: 'notary' },
      notes: 'Advanced electronic signature is needed for public instruments; acts requiring personal appearance are excluded.' },
    { code: 'GB', name: 'United Kingdom', region: 'Europe', model: 'open', law: 'Electronic Communications Act 2000 + UK eIDAS', privacy: 'UK GDPR, DPA 2018, Data (Use and Access) Act 2025', retention: 6,
      excluded: ['will'], requires: { real_estate: 'witness', poa: 'witness', trust: 'witness' },
      notes: 'Deeds need a witness physically present (HM Land Registry accepts e-signed deeds under its own procedure). Wills still need wet-ink signatures and two witnesses.' },
    { code: 'EU', name: 'European Union (general)', region: 'Europe', model: 'tiered', law: 'eIDAS Regulation 910/2014 as amended by 2024/1183 (eIDAS 2)', privacy: 'GDPR', retention: 10,
      excluded: ['will', 'family'], requires: { real_estate: 'notary', poa: 'QES', negotiable: 'QES' },
      notes: 'A QES has the effect of a handwritten signature in every member state. Formal requirements (notarial deeds, family law, succession) are set nationally. EUDI wallets are being rolled out from 2026.' },
    { code: 'DE', name: 'Germany', region: 'Europe', model: 'tiered', law: 'eIDAS + BGB §126a (electronic form)', privacy: 'GDPR, BDSG', retention: 10,
      excluded: ['will', 'family', 'real_estate'], requires: { hr_termination: 'excluded_wet_ink', hr_offer: 'QES', loan: 'QES', poa: 'QES' },
      notes: 'Where the law requires written form (§126 BGB), only a QES replaces it. Employment terminations (§623 BGB) and personal guarantees (§766 BGB) must be wet ink; real estate needs a notarial deed (§311b BGB).' },
    { code: 'FR', name: 'France', region: 'Europe', model: 'tiered', law: 'Civil Code arts. 1366–1367 + Décret 2017-1416', privacy: 'GDPR, Loi Informatique et Libertés', retention: 10,
      excluded: ['will', 'family'], requires: { real_estate: 'notary', loan: 'AES' },
      notes: 'A QES is presumed reliable; other levels must be proven. Notarial acts can be electronic but only via a notary.' },
    { code: 'CH', name: 'Switzerland', region: 'Europe', model: 'tiered', law: 'ZertES + Code of Obligations art. 14 para. 2bis', privacy: 'revised FADP (nFADP)', retention: 10,
      excluded: ['will', 'family', 'real_estate'], requires: { hr_offer: 'AES', loan: 'QES', poa: 'QES' },
      notes: 'Only a qualified electronic signature with qualified time stamp equals a handwritten signature where written form is required.' },
    { code: 'TR', name: 'Türkiye', region: 'Europe', model: 'restrictive', law: 'Electronic Signature Law No. 5070', privacy: 'KVKK (Law 6698)', retention: 10,
      excluded: ['will', 'family', 'real_estate', 'loan'], requires: { poa: 'notary', negotiable: 'QES', commercial: 'AES' },
      notes: 'Only a "secure electronic signature" equals handwriting. Transactions needing an official form or special ceremony, and guarantee agreements, cannot be signed electronically.' },
    { code: 'RU', name: 'Russia', region: 'Europe', model: 'tiered', law: 'Federal Law 63-FZ on Electronic Signature', privacy: 'Federal Law 152-FZ (data localisation)', retention: 5,
      excluded: ['will', 'family'], requires: { real_estate: 'QES', government: 'QES', poa: 'QES' },
      notes: 'Simple, unqualified and qualified enhanced signatures. Personal data of Russian citizens must be stored on servers in Russia.' },
    { code: 'AE', name: 'United Arab Emirates', region: 'Middle East & Africa', model: 'tiered', law: 'Federal Decree-Law 46/2021 on Electronic Transactions and Trust Services', privacy: 'PDPL (Federal Decree-Law 45/2021); DIFC/ADGM regimes', retention: 5,
      excluded: ['will', 'family'], requires: { real_estate: 'QES', negotiable: 'QES', poa: 'notary', government: 'QES' },
      notes: 'Three tiers: electronic, qualified and approved (UAE Pass / approved trust service provider) signatures. Personal-status matters and notarised acts follow specific procedures.' },
    { code: 'SA', name: 'Saudi Arabia', region: 'Middle East & Africa', model: 'tiered', law: 'Electronic Transactions Law (Royal Decree M/18)', privacy: 'PDPL', retention: 10,
      excluded: ['will', 'family', 'real_estate'], requires: { government: 'QES', poa: 'notary' },
      notes: 'Personal-status matters and real-estate title deeds are excluded. Certificate-based signatures from licensed providers carry the strongest evidential weight.' },
    { code: 'IL', name: 'Israel', region: 'Middle East & Africa', model: 'tiered', law: 'Electronic Signature Law 5761-2001', privacy: 'Protection of Privacy Law (Amendment 13)', retention: 7,
      excluded: ['will', 'family', 'real_estate'], requires: { poa: 'notary', government: 'QES' },
      notes: 'Electronic, secure and certified signatures; only a certified signature carries the statutory presumption.' },
    { code: 'ZA', name: 'South Africa', region: 'Middle East & Africa', model: 'tiered', law: 'Electronic Communications and Transactions Act 25 of 2002', privacy: 'POPIA', retention: 5,
      excluded: ['will', 'real_estate', 'negotiable'], requires: { lease: 'AES', poa: 'witness', government: 'AES' },
      notes: 'Wills, alienation of immovable property, long-term leases over 20 years and bills of exchange are excluded. Where a law demands a signature, an accredited advanced electronic signature is required.' },
    { code: 'NG', name: 'Nigeria', region: 'Middle East & Africa', model: 'open', law: 'Evidence Act 2011 (s.93) + Cybercrimes Act 2015 (s.17)', privacy: 'Nigeria Data Protection Act 2023', retention: 6,
      excluded: ['will', 'family', 'real_estate', 'poa', 'negotiable'], requires: { government: 'AES' },
      notes: 'Wills, death certificates, birth and marriage records, powers of attorney, land documents and negotiable instruments are excluded under the Cybercrimes Act.' },
    { code: 'KE', name: 'Kenya', region: 'Middle East & Africa', model: 'tiered', law: 'Kenya Information and Communications Act + Business Laws (Amendment) Act 2020', privacy: 'Data Protection Act 2019', retention: 7,
      excluded: ['will', 'family'], requires: { real_estate: 'AES', poa: 'AES', government: 'AES' },
      notes: 'Advanced electronic signatures are recognised for documents that previously required attestation, including some land transactions.' },
    { code: 'IN', name: 'India', region: 'Asia-Pacific', model: 'tiered', law: 'Information Technology Act 2000 (Second Schedule) + Bharatiya Sakshya Adhiniyam 2023', privacy: 'Digital Personal Data Protection Act 2023', retention: 8,
      excluded: ['will', 'trust', 'family'], requires: { real_estate: 'registration', poa: 'QES', negotiable: 'QES', loan: 'stamp_duty', lease: 'stamp_duty', commercial: 'stamp_duty', hr_offer: 'stamp_duty' },
      notes: 'Only Aadhaar eSign or a DSC from a licensed CA gets the IT Act presumption. Wills and trusts remain excluded (First Schedule); the 2022 amendment opened promissory notes, bills of exchange and powers of attorney in favour of RBI/SEBI/IRDAI/PFRDA/NHB-regulated entities. Conveyances must be registered with the sub-registrar, and most agreements need e-stamping before signing.' },
    { code: 'CN', name: 'China', region: 'Asia-Pacific', model: 'tiered', law: 'Electronic Signature Law (2004, amended 2019)', privacy: 'PIPL, Data Security Law (localisation and cross-border transfer rules)', retention: 10,
      excluded: ['will', 'family'], requires: { real_estate: 'QES', loan: 'QES', government: 'QES' },
      notes: 'A "reliable" electronic signature equals handwriting. Marriage, adoption and inheritance matters and utility service terminations are excluded. Personal data leaving China needs a PIPL transfer mechanism.' },
    { code: 'JP', name: 'Japan', region: 'Asia-Pacific', model: 'tiered', law: 'Act on Electronic Signatures and Certification Business (2000)', privacy: 'APPI', retention: 7,
      excluded: ['will', 'family'], requires: { real_estate: 'AES', government: 'QES' },
      notes: 'Ministry guidance (2020) confirms cloud signatures can satisfy the Act when the signer is reliably identified. Some notarial deeds (e.g. certain fixed-term land leases) still need paper.' },
    { code: 'KR', name: 'South Korea', region: 'Asia-Pacific', model: 'open', law: 'Digital Signature Act (amended 2020) + Framework Act on Electronic Documents', privacy: 'PIPA', retention: 5,
      excluded: ['will', 'family'], requires: { government: 'AES', real_estate: 'AES' },
      notes: 'The 2020 amendment ended the accredited-certificate monopoly, so private e-signature services are recognised.' },
    { code: 'SG', name: 'Singapore', region: 'Asia-Pacific', model: 'tiered', law: 'Electronic Transactions Act 2010 (amended 2021)', privacy: 'PDPA 2012', retention: 5,
      excluded: ['will', 'trust', 'poa', 'real_estate'], requires: { negotiable: 'AES', government: 'AES' },
      notes: 'Wills, powers of attorney, trusts and sales or dispositions of immovable property are excluded. Since 2021, electronic transferable records (MLETR) are recognised.' },
    { code: 'MY', name: 'Malaysia', region: 'Asia-Pacific', model: 'tiered', law: 'Electronic Commerce Act 2006 + Digital Signature Act 1997', privacy: 'PDPA 2010 (amended 2024)', retention: 7,
      excluded: ['will', 'trust', 'poa', 'negotiable'], requires: { real_estate: 'QES', government: 'QES' },
      notes: 'Powers of attorney, wills, trusts and negotiable instruments are excluded from the E-Commerce Act.' },
    { code: 'ID', name: 'Indonesia', region: 'Asia-Pacific', model: 'tiered', law: 'ITE Law (Law 11/2008, amended 2016 and 2024) + GR 71/2019', privacy: 'PDP Law 27/2022', retention: 10,
      excluded: ['will', 'family', 'real_estate'], requires: { loan: 'QES', government: 'QES', commercial: 'AES' },
      notes: 'Certified electronic signatures (from a Kominfo-registered provider) carry greater evidential weight. Notarial deeds for land remain paper-based.' },
    { code: 'PH', name: 'Philippines', region: 'Asia-Pacific', model: 'open', law: 'E-Commerce Act (RA 8792) + Rules on Electronic Evidence', privacy: 'Data Privacy Act 2012', retention: 10,
      excluded: ['will', 'family'], requires: { real_estate: 'notary', poa: 'notary' },
      notes: 'Documents that must be notarised still need a notary (remote notarisation is limited).' },
    { code: 'HK', name: 'Hong Kong SAR', region: 'Asia-Pacific', model: 'tiered', law: 'Electronic Transactions Ordinance (Cap. 553)', privacy: 'PDPO', retention: 7,
      excluded: ['will', 'trust', 'poa', 'real_estate', 'negotiable'], requires: { government: 'QES' },
      notes: 'Schedule 1 excludes wills, trusts, powers of attorney, deeds, negotiable instruments and immovable-property instruments.' },
    { code: 'AU', name: 'Australia', region: 'Asia-Pacific', model: 'open', law: 'Electronic Transactions Act 1999 (Cth) + state ETAs; Corporations Act s.127', privacy: 'Privacy Act 1988 (2024 amendments)', retention: 7,
      excluded: ['will'], requires: { real_estate: 'registration', poa: 'witness' },
      notes: 'Companies can execute documents electronically under s.127. Land dealings and powers of attorney follow state rules (witnessing, PEXA for land).' },
    { code: 'NZ', name: 'New Zealand', region: 'Asia-Pacific', model: 'open', law: 'Contract and Commercial Law Act 2017, Part 4', privacy: 'Privacy Act 2020', retention: 7,
      excluded: ['will', 'poa'], requires: { real_estate: 'registration', government: 'AES' },
      notes: 'Wills, enduring powers of attorney, affidavits and statutory declarations are excluded.' },
  ];

  const byCode = Object.fromEntries(J.map((j) => [j.code, j]));
  const MODEL_ADD = { open: 0, tiered: 5, restrictive: 12 };
  const FORMALITY_TEXT = {
    notary: 'Notarisation required (in person or remote online notary where allowed)',
    witness: 'An independent witness must attest the signature',
    registration: 'Must be registered with the land/sub-registrar after signing',
    consumer_consent: 'Collect ESIGN consumer consent and disclosures before signing',
    stamp_duty: 'Pay stamp duty (e-stamp) before execution',
    excluded_wet_ink: 'Must be signed in wet ink — electronic signature not valid',
  };

  /**
   * assess({ jurisdictions:[codes], category, value, controls:[ids], crossBorder })
   * Returns { score, level, blocked, reasons[], requiredLevel, requiredControls[], formalities[], retentionYears, perJurisdiction[] }
   */
  function assess(input) {
    const codes = (input.jurisdictions || []).filter((c) => byCode[c]);
    const cat = CATEGORIES[input.category] || CATEGORIES.commercial;
    const catId = CATEGORIES[input.category] ? input.category : 'commercial';
    const band = VALUE_BANDS.find((b) => b.id === input.value) || VALUE_BANDS[0];
    const controls = new Set(input.controls || ['email']);
    const reasons = [];
    const formalities = [];
    const perJurisdiction = [];
    let blocked = false;
    let requiredRank = LEVELS.SES.rank;
    let modelAdd = 0;
    let retentionYears = 5;

    for (const code of codes) {
      const j = byCode[code];
      modelAdd = Math.max(modelAdd, MODEL_ADD[j.model] || 0);
      retentionYears = Math.max(retentionYears, j.retention || 5);
      const req = j.requires[catId];
      const row = { code, name: j.name, status: 'ok', text: 'Electronic signature accepted' };
      if (j.excluded.includes(catId) || req === 'excluded_wet_ink') {
        blocked = true; row.status = 'blocked';
        row.text = `${cat.label} cannot be signed electronically under ${j.law.split(' + ')[0]}`;
        reasons.push(`${j.name}: ${row.text}.`);
      } else if (req === 'AES' || req === 'QES') {
        requiredRank = Math.max(requiredRank, LEVELS[req].rank);
        row.status = 'level'; row.text = `Requires at least ${LEVELS[req].name.toLowerCase()} (${req})`;
      } else if (req) {
        row.status = 'formality'; row.text = FORMALITY_TEXT[req];
        formalities.push({ code, req, text: `${j.name}: ${FORMALITY_TEXT[req]}` });
        if (req === 'notary' || req === 'witness' || req === 'registration') requiredRank = Math.max(requiredRank, LEVELS.AES.rank);
      }
      if (j.model === 'restrictive' && !blocked) { requiredRank = Math.max(requiredRank, LEVELS.AES.rank); row.text += row.status === 'ok' ? ' (advanced signature required; a licensed digital signature is recommended because only it is presumed valid)' : ''; if (row.status === 'ok') row.status = 'level'; }
      perJurisdiction.push(row);
    }

    let raw = cat.base + band.add + modelAdd + (input.crossBorder || codes.length > 1 ? 8 : 0);
    // Strongest control counts in full, each additional one at half weight.
    const reduce = [...controls].map((c) => CONTROLS[c]?.reduce || 0).sort((a, b) => b - a).reduce((s, v, i) => s + (i ? v * 0.5 : v), 0);
    const inherent = Math.min(100, raw);
    const score = Math.max(0, Math.min(100, Math.round(inherent - reduce)));

    // Risk-based minimums on top of the legal minimum.
    if (inherent >= 60) requiredRank = Math.max(requiredRank, LEVELS.AES.rank);
    const requiredLevel = Object.keys(LEVELS).find((k) => LEVELS[k].rank === requiredRank);

    const requiredControls = ['email'];
    if (inherent >= 25 || requiredRank >= 2) requiredControls.push('otp');
    if (inherent >= 50 || requiredRank >= 2) requiredControls.push('id_check');
    if (requiredRank >= 3) requiredControls.push('qes');

    const missing = requiredControls.filter((c) => !controls.has(c));
    const level = blocked ? 'blocked' : score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
    if (!blocked && missing.length) reasons.push(`Add: ${missing.map((m) => CONTROLS[m].label).join(', ')}.`);

    return {
      score: blocked ? 100 : score, inherent, level, blocked, canSend: !blocked && missing.length === 0,
      reasons, requiredLevel, requiredLevelName: LEVELS[requiredLevel].name, requiredControls, missingControls: missing,
      formalities, retentionYears, perJurisdiction, reviewed: RULES_REVIEWED,
    };
  }

  const api = { RULES_REVIEWED, LEVELS, CATEGORIES, VALUE_BANDS, CONTROLS, JURISDICTIONS: J, byCode, assess, FORMALITY_TEXT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SFCompliance = api;
})(typeof window !== 'undefined' ? window : globalThis);
