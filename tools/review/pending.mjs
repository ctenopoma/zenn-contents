#!/usr/bin/env node
/**
 * 未反映の添削 PDF を探して、ページ画像に展開する。
 *
 *   node tools/review/pending.mjs [slug]
 *   node tools/review/pending.mjs [slug] --list   … PDF のパスだけを出す（CI 用）
 *
 * review/<slug>/annotated/*.pdf のうち applied.json に載っていないものが対象。
 * 展開先の .pages/ は .gitignore 済み（PNG をコミットしても意味がないため）。
 *
 * 出力した PNG のパスを Claude が Read して手書きを読む、という流れ。
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REVIEW = path.join(ROOT, 'review');

export function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function loadLedger(slug) {
  const p = path.join(REVIEW, slug, 'applied.json');
  if (!fs.existsSync(p)) return { slug, applied: [] };
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function listSlugs(filter) {
  if (!fs.existsSync(REVIEW)) return [];
  return fs
    .readdirSync(REVIEW, { withFileTypes: true })
    .filter((d) => d.isDirectory() && (!filter || d.name === filter))
    .map((d) => d.name);
}

function rasterize(pdf, outDir) {
  const r = spawnSync(
    'python3',
    [path.join(ROOT, 'tools/review/pdf-to-png.py'), pdf, '--out', outDir, '--scale', '2.0'],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    return [];
  }
  return r.stdout.trim().split('\n').filter(Boolean);
}

function main() {
  const argv = process.argv.slice(2);
  const listOnly = argv.includes('--list');
  const filter = argv.find((a) => !a.startsWith('--'));
  let found = 0;

  for (const slug of listSlugs(filter)) {
    const dir = path.join(REVIEW, slug, 'annotated');
    if (!fs.existsSync(dir)) continue;

    const ledger = loadLedger(slug);
    const done = new Set(ledger.applied.map((a) => a.sha256));
    const pdfs = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.pdf'))
      .map((f) => path.join(dir, f))
      .filter((p) => !done.has(sha256(p)))
      .sort();

    for (const pdf of pdfs) {
      found++;
      if (listOnly) {
        console.log(path.relative(ROOT, pdf));
        continue;
      }
      const outDir = path.join(dir, '.pages', path.basename(pdf, path.extname(pdf)));
      fs.rmSync(outDir, { recursive: true, force: true });
      const pages = rasterize(pdf, outDir);
      console.log(`\n[${slug}] ${path.relative(ROOT, pdf)}`);
      console.log(`  blocks.json : review/${slug}/blocks.json`);
      console.log(`  source      : articles/${slug}.md`);
      console.log(`  pages (${pages.length}):`);
      for (const p of pages) console.log(`    ${path.relative(ROOT, p)}`);
    }
  }

  if (found === 0 && !listOnly) console.log('未反映の添削 PDF はありません。');
}

// record-applied.mjs から関数を import しても main が走らないようにする
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
