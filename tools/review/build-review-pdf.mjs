#!/usr/bin/env node
/**
 * articles/<slug>.md  →  review/<slug>/<slug>-review.pdf + blocks.json
 *
 *   node tools/review/build-review-pdf.mjs <slug|path> [...]
 *   npm run review -- mip-course-6-1-lns
 *
 * PDF は「本文 + 右62mmの余白 + ブロック番号(¶N)」というレイアウトで出力される。
 * iPad の GoodNotes に取り込んで Apple Pencil で添削し、
 * 添削後の PDF を review/<slug>/annotated/ に戻すと tools/review/apply 側で拾える。
 *
 * blocks.json が ¶N ↔ Markdown の行範囲の対応表。これが無いと手書きコメントを
 * 本文のどこに当てればいいか分からなくなるので、PDF と必ずセットでコミットする。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import MarkdownIt from 'markdown-it';
import cjkFriendly from 'markdown-it-cjk-friendly';
import katex from 'katex';
import { chromium } from 'playwright';

import { splitIntoBlocks } from './split-blocks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const MARGIN_MM = { top: 12, bottom: 12, left: 10, right: 10 };

// cjk-friendly を入れないと「文字を**強調**します」のような和文の強調が効かない
// （CommonMark の flanking 規則。Zenn 本体では効くので、無いと偽の指摘を招く）
const md = new MarkdownIt({ html: true, linkify: true, breaks: false }).use(cjkFriendly);

/* ------------------------------------------------------------------ *
 * Chromium の探索
 *  ローカル(mac)・CI・このコンテナで playwright のバージョンとブラウザの
 *  ビルド番号がずれることがあるので、実体を自前で探してから launch する。
 * ------------------------------------------------------------------ */
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;

  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base && fs.existsSync(base)) {
    const dirs = fs
      .readdirSync(base)
      .filter((d) => d.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const d of dirs) {
      for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(base, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(mac)) return mac;
  return undefined; // playwright 同梱のものに任せる
}

/* ------------------------------------------------------------------ *
 * Markdown → HTML
 * ------------------------------------------------------------------ */

const CJK_RE = /[　-ヿ㐀-鿿＀-￯]/;

/**
 * コードと数式を先に HTML 化して退避する。
 * 順番が命：フェンス → インラインコード → $$ → $ の順で抜かないと、
 * インラインコードの正規表現が ``` を食い破ってコードブロックが崩れる。
 */
function protectAndRenderMath(src) {
  const stash = [];
  /** ブロック要素の退避先。html_block として素通しさせるため div にする */
  const keepBlock = (html) => {
    stash.push(html);
    return `\n\n<div data-ktx="${stash.length - 1}"></div>\n\n`;
  };
  const keepInline = (html) => {
    stash.push(html);
    return `@@KTX${stash.length - 1}@@`;
  };

  let out = stashFences(src, keepBlock)
    .replace(/`[^`\n]*`/g, (m) => keepInline(md.renderInline(m)))
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => keepBlock(safeKatex(tex, true)))
    .replace(/(?<!\\)\$([^$\n]+?)(?<!\\)\$/g, (m, tex) =>
      // 和文が混じっていたら数式ではなく「$1,000〜」のような地の文とみなす
      CJK_RE.test(tex) ? m : keepInline(safeKatex(tex, false))
    );

  const restore = (html) =>
    html
      .replace(/<div data-ktx="(\d+)"><\/div>/g, (_, i) => stash[Number(i)])
      .replace(/@@KTX(\d+)@@/g, (_, i) => stash[Number(i)]);

  return { text: out, restore };
}

/** ``` / ~~~ で囲まれた領域を丸ごと退避する。 */
function stashFences(src, keepBlock) {
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^\s*(```|~~~)/);
    if (!m) {
      out.push(lines[i]);
      i++;
      continue;
    }
    const start = i;
    i++;
    while (i < lines.length && !lines[i].trimStart().startsWith(m[1])) i++;
    if (i < lines.length) i++;
    out.push(keepBlock(md.render(lines.slice(start, i).join('\n'))));
  }
  return out.join('\n');
}

function safeKatex(tex, displayMode) {
  try {
    // strict:'ignore' … \text{材料} のような和文混じりの警告を黙らせる（Zenn 側でも表示はされる）
    return katex.renderToString(tex.trim(), {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      output: 'html',
    });
  } catch {
    return `<code>${displayMode ? '$$' : '$'}${tex}${displayMode ? '$$' : '$'}</code>`;
  }
}

/** Zenn 独自記法（::: と @[card]）を素の HTML に落とす。 */
function renderBlockHtml(block) {
  if (block.kind === 'container') {
    const lines = block.text.split('\n');
    const open = lines[0].match(/^(:{3,})([a-zA-Z][\w-]*)\s*(.*)$/);
    const name = open?.[2] ?? 'message';
    const label = [name, open?.[3]].filter(Boolean).join(' ');
    const inner = lines.slice(1, lines[lines.length - 1].trim().startsWith(':::') ? -1 : undefined).join('\n');
    return `<div class="zenn-container name-${name}"><span class="label">:::${label}</span>${renderMarkdown(inner)}</div>`;
  }
  return renderMarkdown(block.text);
}

function renderMarkdown(src) {
  const withCards = src.replace(
    /^@\[([a-zA-Z]+)\]\((\S+)\)\s*$/gm,
    (_, kind, url) => `<div class="zenn-card">@[${kind}] ${url}</div>`
  );
  const { text, restore } = protectAndRenderMath(withCards);
  return restore(md.render(text));
}

/** /images/... を file:// に差し替えて Chromium から読めるようにする。 */
function resolveImages(html) {
  return html.replace(/src="([^"]+)"/g, (m, src) => {
    if (/^(https?:|data:|file:)/.test(src)) return m;
    const abs = path.join(ROOT, src.replace(/^\//, ''));
    return fs.existsSync(abs) ? `src="${pathToFileURL(abs).href}"` : m;
  });
}

/* ------------------------------------------------------------------ */

function gitInfo(file) {
  const run = (args) => {
    try {
      return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch {
      return '';
    }
  };
  return {
    commit: run(['rev-parse', '--short', 'HEAD']),
    branch: run(['rev-parse', '--abbrev-ref', 'HEAD']),
    dirty: run(['status', '--porcelain', '--', file]) !== '',
  };
}

function buildHtml({ slug, meta, blocks, git, generatedAt }) {
  const cssPath = path.join(HERE, 'review.css');
  const katexCss = path.join(ROOT, 'node_modules/katex/dist/katex.min.css');
  const styles = [
    fs.existsSync(katexCss) ? `<link rel="stylesheet" href="${pathToFileURL(katexCss).href}">` : '',
    `<style>${fs.readFileSync(cssPath, 'utf8')}</style>`,
  ].join('\n');

  const body = blocks
    .map(
      (b) => `<section class="block kind-${b.kind}" id="b${b.n}">
  <div class="id">${b.id}</div>
  <div class="body">${resolveImages(renderBlockHtml(b))}</div>
  <div class="scribble"></div>
</section>`
    )
    .join('\n');

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>${slug} review</title>${styles}</head>
<body>
<div class="cover">
  <h1>${meta.emoji ?? '📝'} ${escapeHtml(meta.title ?? slug)}</h1>
  <dl>
    <dt>slug</dt><dd>${slug}</dd>
    <dt>source</dt><dd>articles/${slug}.md</dd>
    <dt>blocks</dt><dd>${blocks.length}</dd>
    <dt>commit</dt><dd>${git.commit || '-'} (${git.branch || '-'})${git.dirty ? ' + 未コミットの変更あり' : ''}</dd>
    <dt>generated</dt><dd>${generatedAt}</dd>
  </dl>
  <div class="legend">
    <h2>手書き添削のお作法</h2>
    <ul>
      <li>各ブロックの左にある <code>¶12</code> がアンカー。コメントは<strong>右の余白に、対象ブロックの高さに揃えて</strong>書く。</li>
      <li>どのブロックか紛らわしいときは、コメント頭に <code>¶12</code> と書くのが確実。</li>
      <li>ページをまたぐ指示や全体講評は、最終ページの余白にまとめて書く。</li>
      <li>記号の目安：<code>取り消し線</code>=削除 / <code>∧</code>=ここに追加 / <code>?</code>=意味が不明 / <code>◯</code>=良い(残す) / <code>→</code>=書き換え案</li>
      <li>この PDF は <code>articles/${slug}.md</code> の commit <code>${git.commit || '-'}</code> 時点のスナップショット。</li>
    </ul>
  </div>
</div>
${body}
</body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/* ------------------------------------------------------------------ */

async function buildOne(browser, slug) {
  const source = path.join(ROOT, 'articles', `${slug}.md`);
  if (!fs.existsSync(source)) throw new Error(`記事が見つかりません: ${source}`);

  const raw = fs.readFileSync(source, 'utf8');
  const { blocks, meta } = splitIntoBlocks(raw);
  const git = gitInfo(`articles/${slug}.md`);
  const generatedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  const outDir = path.join(ROOT, 'review', slug);
  fs.mkdirSync(path.join(outDir, 'annotated'), { recursive: true });

  const html = buildHtml({ slug, meta, blocks, git, generatedAt });
  const htmlPath = path.join(outDir, `${slug}-review.html`);
  fs.writeFileSync(htmlPath, html);

  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  const pdfPath = path.join(outDir, `${slug}-review.pdf`);
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: `${MARGIN_MM.top}mm`,
      bottom: `${MARGIN_MM.bottom}mm`,
      left: `${MARGIN_MM.left}mm`,
      right: `${MARGIN_MM.right}mm`,
    },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;font-size:7pt;color:#888;padding:0 10mm;display:flex;justify-content:space-between;">
      <span>${slug} @ ${git.commit || '-'}</span>
      <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>`,
  });
  await page.close();

  const blocksPath = path.join(outDir, 'blocks.json');
  fs.writeFileSync(
    blocksPath,
    `${JSON.stringify(
      {
        slug,
        sourceFile: `articles/${slug}.md`,
        title: meta.title ?? slug,
        generatedAt,
        git,
        blockCount: blocks.length,
        // text は入れない（差分が汚れるので preview だけ）
        blocks: blocks.map(({ text, ...rest }) => rest),
      },
      null,
      2
    )}\n`
  );

  fs.rmSync(htmlPath, { force: true });
  return { slug, pdfPath, blocksPath, blockCount: blocks.length };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('usage: node tools/review/build-review-pdf.mjs <slug> [<slug>...]');
    process.exit(1);
  }
  const slugs = args.map((a) => path.basename(a).replace(/\.md$/, ''));

  const browser = await chromium.launch({ executablePath: findChromium() });
  try {
    for (const slug of slugs) {
      const r = await buildOne(browser, slug);
      console.log(`✓ ${r.slug}: ${r.blockCount} blocks`);
      console.log(`  ${path.relative(ROOT, r.pdfPath)}`);
      console.log(`  ${path.relative(ROOT, r.blocksPath)}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
