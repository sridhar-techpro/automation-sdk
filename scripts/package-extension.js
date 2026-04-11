#!/usr/bin/env node
/**
 * Post-build packaging script for the Chrome Extension.
 *
 * After `tsc -p extension/tsconfig.json` compiles .ts → extension/dist/,
 * this script:
 *   1. Copies all static files (manifest.json, HTML pages) into dist/
 *   2. Strips the `export {};` sentinel that TypeScript emits for
 *      non-background scripts (popup.js, content-script.js).
 *      Background service workers keep it — they run as real ES modules.
 *
 * Result: extension/dist/ is a complete, loadable Chrome Extension package.
 */

const fs   = require('fs');
const path = require('path');

const EXT  = path.join(__dirname, '..', 'extension');
const DIST = path.join(EXT, 'dist');

// ── 1. Ensure dist exists ─────────────────────────────────────────────────────
fs.mkdirSync(DIST,                          { recursive: true });
fs.mkdirSync(path.join(DIST, 'side-panel'), { recursive: true });

// ── 2. Copy static files into dist ───────────────────────────────────────────
const STATIC = [
  ['manifest.json',           'manifest.json'],
  ['popup.html',              'popup.html'],
  ['side-panel/index.html',   'side-panel/index.html'],
];

for (const [src, dest] of STATIC) {
  const srcPath  = path.join(EXT,  src);
  const destPath = path.join(DIST, dest);
  if (!fs.existsSync(srcPath)) {
    console.warn(`[package-extension] WARNING: ${src} not found — skipping`);
    continue;
  }
  fs.copyFileSync(srcPath, destPath);
  console.log(`[package-extension] Copied  ${src} → dist/${dest}`);
}

// ── 3. Strip `export {};` from plain scripts (not background.js) ─────────────
//    TypeScript emits this sentinel when a file uses `import type`.
//    Plain <script> tags and content-script injection don't support ES modules.
const STRIP_FILES = ['popup.js', 'content-script.js', 'side-panel/index.js'];

for (const relPath of STRIP_FILES) {
  const filePath = path.join(DIST, relPath);
  if (!fs.existsSync(filePath)) continue;

  const original = fs.readFileSync(filePath, 'utf8');
  const stripped = original.replace(/\nexport \{\};?\s*$/m, '\n').trimEnd() + '\n';

  if (stripped !== original) {
    fs.writeFileSync(filePath, stripped, 'utf8');
    console.log(`[package-extension] Stripped export {} from ${relPath}`);
  }
}

console.log('[package-extension] Done — extension/dist/ is ready to load.');
