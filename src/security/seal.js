/*
 * Tamper-evident PDF seal (PAdES-style PKCS#7 detached signature over the whole file).
 * Any change to the signed PDF afterwards is flagged by Adobe Acrobat and other PDF readers.
 *
 * Certificate source, in order:
 *   SEAL_P12_PATH + SEAL_P12_PASSWORD env  -> use your CA-issued or qualified seal certificate (recommended for production)
 *   DATA_DIR/keys/seal.p12                 -> auto-generated self-signed certificate (integrity only; readers show "issuer unknown")
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const forge = require('node-forge');
const { pdflibAddPlaceholder } = require('@signpdf/placeholder-pdf-lib');
const signpdf = require('@signpdf/signpdf').default;
const { P12Signer } = require('@signpdf/signer-p12');

let P12 = null, PASS = null, INFO = null;

function init(dataDir, orgName = 'SignFlow') {
  if (process.env.SEAL_P12_PATH) {
    P12 = fs.readFileSync(process.env.SEAL_P12_PATH);
    PASS = process.env.SEAL_P12_PASSWORD || '';
  } else {
    const dir = path.join(dataDir, 'keys');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const f = path.join(dir, 'seal.p12'), pf = path.join(dir, 'seal.pass');
    if (!fs.existsSync(f)) {
      PASS = crypto.randomBytes(18).toString('base64');
      const keys = forge.pki.rsa.generateKeyPair(2048);
      const cert = forge.pki.createCertificate();
      cert.publicKey = keys.publicKey;
      cert.serialNumber = '01' + crypto.randomBytes(8).toString('hex');
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date(Date.now() + 10 * 365 * 864e5);
      const attrs = [{ name: 'commonName', value: `${orgName} Document Seal` }, { name: 'organizationName', value: orgName }];
      cert.setSubject(attrs); cert.setIssuer(attrs);
      cert.setExtensions([{ name: 'keyUsage', digitalSignature: true, nonRepudiation: true }]);
      cert.sign(keys.privateKey, forge.md.sha256.create());
      const der = forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], PASS, { algorithm: '3des' })).getBytes();
      fs.writeFileSync(f, Buffer.from(der, 'binary'), { mode: 0o600 });
      fs.writeFileSync(pf, PASS, { mode: 0o600 });
      console.warn('[security] Generated a self-signed document seal certificate. For trusted seals set SEAL_P12_PATH to a CA-issued certificate.');
    }
    P12 = fs.readFileSync(f);
    PASS = fs.readFileSync(pf, 'utf8');
  }
  // Read certificate details for the admin screen.
  const asn = forge.asn1.fromDer(P12.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn, PASS);
  const bag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag][0];
  const c = bag.cert;
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes();
  INFO = {
    subject: c.subject.attributes.map((a) => `${a.shortName}=${a.value}`).join(', '),
    issuer: c.issuer.attributes.map((a) => `${a.shortName}=${a.value}`).join(', '),
    selfSigned: c.subject.hash === c.issuer.hash,
    validFrom: c.validity.notBefore.toISOString(), validTo: c.validity.notAfter.toISOString(),
    fingerprint: crypto.createHash('sha256').update(Buffer.from(der, 'binary')).digest('hex').match(/../g).join(':').toUpperCase(),
    source: process.env.SEAL_P12_PATH ? 'Configured certificate (SEAL_P12_PATH)' : 'Self-signed (auto-generated)',
  };
}

/** Add a signature placeholder to a pdf-lib document (call before save). */
function addPlaceholder(pdfDoc, { reason, location, name }) {
  pdflibAddPlaceholder({ pdfDoc, reason, contactInfo: '', name, location, signatureLength: 16384 });
}
/** Sign saved PDF bytes (must have been saved with useObjectStreams:false). */
async function sign(bytes) { return Buffer.from(await signpdf.sign(bytes, new P12Signer(P12, { passphrase: PASS }))); }

module.exports = { init, addPlaceholder, sign, info: () => INFO };
