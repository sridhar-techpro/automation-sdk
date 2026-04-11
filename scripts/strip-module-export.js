#!/usr/bin/env node
/**
 * Post-build script: strips the TypeScript-emitted `export {};` sentinel
 * from popup.js and content-script.js.
 *
 * Background service workers (background.js) legitimately use ES module
 * syntax and are declared as `"type": "module"` in the manifest, so they
 * are left untouched.
 *
 * Popup and content-script files are loaded as plain <script> or injected
 * as content scripts — neither context supports `export {}`.
 */
const fs = require('fs');
const path = require('path');

const EXTENSION_DIR = path.join(__dirname, '..', 'extension');
const FILES_TO_STRIP = ['popup.js', 'content-script.js'];

for (const filename of FILES_TO_STRIP) {
  const filePath = path.join(EXTENSION_DIR, filename);
  if (!fs.existsSync(filePath)) continue;

  const original = fs.readFileSync(filePath, 'utf8');
  // Remove the `export {};` line TypeScript emits when there are no real exports
  const stripped = original.replace(/\nexport \{\};?\s*$/m, '');

  if (stripped !== original) {
    fs.writeFileSync(filePath, stripped, 'utf8');
    console.log(`[strip-module-export] Removed export {} from ${filename}`);
  }
}
