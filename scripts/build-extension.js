#!/usr/bin/env node
/**
 * Extension build script using esbuild.
 *
 * Bundles all TypeScript entry points into self-contained JS files so that
 * Chrome's ES module service worker can load them without needing bare-specifier
 * resolution (which requires explicit .js extensions in plain tsc output).
 *
 * Entries:
 *   background.ts      → dist/background.js      (ESM — service worker)
 *   content-script.ts  → dist/content-script.js  (IIFE — injected into pages)
 *   side-panel/index.ts→ dist/side-panel/index.js (IIFE — panel UI)
 *
 * Static files (manifest, HTML, prompt .md files) are copied separately.
 */

const esbuild = require('esbuild');
const fs      = require('fs');
const path    = require('path');

const EXT  = path.join(__dirname, '..', 'extension');
const DIST = path.join(EXT, 'dist');

// ── 1. Ensure output directories exist ───────────────────────────────────────
fs.mkdirSync(path.join(DIST, 'side-panel'), { recursive: true });
fs.mkdirSync(path.join(DIST, 'prompts'),    { recursive: true });

// ── 2. Bundle JS entry points with esbuild ───────────────────────────────────
const sharedOptions = {
  bundle:    true,
  platform:  'browser',
  target:    'chrome112',
  tsconfig:  path.join(EXT, 'tsconfig.json'),
  logLevel:  'info',
  sourcemap: false,
};

const entryPoints = [
  {
    entryPoints: [path.join(EXT, 'background.ts')],
    outfile:     path.join(DIST, 'background.js'),
    format:      'esm',   // service worker with "type": "module"
  },
  {
    entryPoints: [path.join(EXT, 'content-script.ts')],
    outfile:     path.join(DIST, 'content-script.js'),
    format:      'iife',  // injected into page context
  },
  {
    entryPoints: [path.join(EXT, 'side-panel', 'index.ts')],
    outfile:     path.join(DIST, 'side-panel', 'index.js'),
    format:      'iife',  // loaded via <script> tag in HTML
  },
];

Promise.all(entryPoints.map((ep) => esbuild.build({ ...sharedOptions, ...ep })))
  .then(() => {
    // ── 3. Copy static files ─────────────────────────────────────────────────
    const statics = [
      ['manifest.json',              'manifest.json'],
      ['side-panel/index.html',      'side-panel/index.html'],
      ['prompts/prompt-planner.md',  'prompts/prompt-planner.md'],
      ['prompts/prompt-extractor.md','prompts/prompt-extractor.md'],
      ['prompts/prompt-reasoner.md', 'prompts/prompt-reasoner.md'],
    ];

    for (const [src, dest] of statics) {
      const srcPath  = path.join(EXT,  src);
      const destPath = path.join(DIST, dest);
      if (!fs.existsSync(srcPath)) {
        console.warn(`[build-extension] WARNING: ${src} not found — skipping`);
        continue;
      }
      fs.copyFileSync(srcPath, destPath);
      console.log(`[build-extension] Copied ${src} → dist/${dest}`);
    }

    console.log('[build-extension] Done — extension/dist/ is ready to load in Chrome.');
  })
  .catch((err) => {
    console.error('[build-extension] Build failed:', err);
    process.exit(1);
  });
