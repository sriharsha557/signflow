# Third-party software

SignFlow is built on open-source packages. All production dependencies use permissive licences that allow commercial use, modification and resale as part of your product, provided you keep their copyright and licence notices (their LICENSE files are inside `node_modules/` in every installation and Docker image).

Things to know:

* **node-forge** is dual-licensed (BSD-3-Clause OR GPL-2.0). SignFlow uses it under **BSD-3-Clause**.
* **Fonts** (Caveat, Dancing Script, Great Vibes under the SIL Open Font License 1.1; Homemade Apple under Apache-2.0) may be used in and bundled with commercial software and documents. The OFL only forbids selling the fonts by themselves.
* **pdf.js** (Apache-2.0) is served to browsers from `/vendor/pdfjs`; keep its LICENSE file.
* Runtime pieces outside `node_modules`: Node.js (MIT), Caddy (Apache-2.0), Docker Engine (Apache-2.0), Debian/Ubuntu base images (various free licences).
* The optional `canvas` package is not installed in production builds.

This list was generated from `npm ls --omit=dev --omit=optional`. Regenerate it after upgrading dependencies, and have counsel review licensing if you redistribute source code to customers.

## MIT (77)

- @signpdf/placeholder-pdf-lib 3.3.0
- @signpdf/signer-p12 3.3.0
- @signpdf/signpdf 3.3.0
- @signpdf/utils 3.3.0
- accepts 2.0.0
- ansi-regex 5.0.1
- ansi-styles 4.3.0
- append-field 1.0.0
- better-sqlite3 13.0.3
- body-parser 2.3.0
- busboy 1.6.0
- bytes 3.1.2
- camelcase 5.3.1
- color-convert 2.0.1
- color-name 1.1.4
- content-disposition 1.1.0
- content-type 2.1.0
- content-type 1.0.5
- cookie 0.7.2
- cookie-parser 1.4.7
- cookie-signature 1.0.6
- cookie-signature 1.2.2
- debug 4.4.3
- decamelize 1.2.0
- depd 2.0.0
- dijkstrajs 1.0.3
- encodeurl 2.0.0
- escape-html 1.0.3
- etag 1.8.1
- express 5.2.1
- finalhandler 2.1.1
- find-up 4.1.0
- forwarded 0.2.0
- fresh 2.0.0
- http-errors 2.0.1
- iconv-lite 0.7.3
- ipaddr.js 1.9.1
- is-promise 4.0.0
- locate-path 5.0.0
- media-typer 0.3.0
- merge-descriptors 2.0.0
- mime-db 1.52.0
- mime-types 3.0.2
- mime-types 2.1.35
- ms 2.1.3
- multer 2.4.0
- negotiator 1.1.0
- node-addon-api 8.9.2
- on-finished 2.4.1
- p-limit 2.3.0
- p-locate 4.1.0
- p-try 2.2.0
- parseurl 1.3.3
- path-exists 4.0.0
- path-to-regexp 8.4.2
- path2d-polyfill 2.0.1
- pdf-lib 1.17.1
- pngjs 5.0.0
- proxy-addr 2.0.8
- qrcode 1.5.4
- range-parser 1.3.0
- raw-body 3.0.2
- require-directory 2.1.1
- router 2.2.0
- safer-buffer 2.1.2
- send 1.2.1
- serve-static 2.2.1
- statuses 2.0.2
- streamsearch 1.1.0
- string-width 4.2.3
- strip-ansi 6.0.1
- type-is 2.1.0
- type-is 1.6.18
- unpipe 1.0.0
- vary 1.1.2
- wrap-ansi 6.2.0
- yargs 15.4.1

## ISC (9)

- cliui 6.0.0
- get-caller-file 2.0.5
- once 1.4.0
- require-main-filename 2.0.0
- set-blocking 2.0.0
- which-module 2.0.1
- wrappy 1.0.2
- y18n 4.0.3
- yargs-parser 18.1.3

## OFL-1.1 (3)

- @fontsource/caveat 5.3.0
- @fontsource/dancing-script 5.3.0
- @fontsource/great-vibes 5.3.0

## Apache-2.0 (2)

- @fontsource/homemade-apple 5.3.0
- pdfjs-dist 3.11.174

## BSD-3-Clause (2)

- bcryptjs 3.0.3
- qs 6.16.0

## (BSD-3-Clause OR GPL-2.0) (1)

- node-forge 1.4.0

## MIT-0 (1)

- nodemailer 10.0.13

