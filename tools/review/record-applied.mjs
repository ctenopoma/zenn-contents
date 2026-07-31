#!/usr/bin/env node
/**
 * 添削 PDF を「反映済み」として台帳に記録する。
 *
 *   node tools/review/record-applied.mjs <annotated.pdf> "反映メモ"
 *
 * 同じ PDF を次のセッションで二重に反映してしまう事故を防ぐためのもの。
 * 記録先は review/<slug>/applied.json。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLedger, sha256 } from './pending.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const [pdfArg, ...noteParts] = process.argv.slice(2);
if (!pdfArg) {
  console.error('usage: node tools/review/record-applied.mjs <annotated.pdf> "反映メモ"');
  process.exit(1);
}

const pdf = path.resolve(ROOT, pdfArg);
if (!fs.existsSync(pdf)) {
  console.error(`PDF が見つかりません: ${pdf}`);
  process.exit(1);
}

// review/<slug>/annotated/xxx.pdf という配置を前提に slug を割り出す
const slug = path.basename(path.dirname(path.dirname(pdf)));
const ledgerPath = path.join(ROOT, 'review', slug, 'applied.json');

let commit = '';
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
} catch {
  /* git 情報が取れなくても記録自体は残す */
}

const ledger = loadLedger(slug);
ledger.slug = slug;
ledger.applied.push({
  file: path.relative(path.join(ROOT, 'review', slug), pdf),
  sha256: sha256(pdf),
  appliedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  baseCommit: commit,
  note: noteParts.join(' '),
});

fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
console.log(`✓ 記録しました: ${path.relative(ROOT, ledgerPath)} (${ledger.applied.length} 件目)`);
