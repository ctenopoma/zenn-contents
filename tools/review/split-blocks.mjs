import { createHash } from 'node:crypto';

/**
 * Zenn 記事の Markdown を「添削の単位」に切り分ける。
 *
 * 1ブロック = 1段落 / 1見出し / 1コードブロック / 1リスト / 1つの ::: 記法。
 * 各ブロックには ¶1, ¶2 ... の通し番号が振られ、元ファイルの行範囲を保持する。
 * この行範囲が、手書き添削 → Markdown 修正のアンカーになる。
 */

const FENCE_RE = /^(```|~~~)/;
const CONTAINER_OPEN_RE = /^(:{3,})([a-zA-Z][\w-]*)/;
const HEADING_RE = /^#{1,6}\s/;

/** front matter を切り出す。戻り値の bodyStartLine は 1 始まり。 */
export function splitFrontMatter(source) {
  const lines = source.split('\n');
  if (lines[0]?.trim() !== '---') {
    return { frontMatter: '', body: source, bodyStartLine: 1 };
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      return {
        frontMatter: lines.slice(1, i).join('\n'),
        body: lines.slice(i + 1).join('\n'),
        bodyStartLine: i + 2,
      };
    }
  }
  return { frontMatter: '', body: source, bodyStartLine: 1 };
}

/** front matter から title / emoji などを雑に拾う（YAMLパーサは入れない）。 */
export function parseFrontMatter(frontMatter) {
  const meta = {};
  for (const line of frontMatter.split('\n')) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m) continue;
    meta[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return meta;
}

function kindOf(text) {
  if (FENCE_RE.test(text)) return 'code';
  if (CONTAINER_OPEN_RE.test(text)) return 'container';
  if (HEADING_RE.test(text)) return 'heading';
  if (/^\s*(?:[-*+]\s|\d+[.)]\s)/.test(text)) return 'list';
  if (/^\s*>/.test(text)) return 'quote';
  if (/^\s*\|/.test(text)) return 'table';
  if (/^\s*!\[/.test(text)) return 'image';
  return 'paragraph';
}

function preview(text, max = 60) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * @param {string} source 記事全文（front matter 込み）
 * @returns {{blocks: Array, meta: Object, bodyStartLine: number}}
 */
export function splitIntoBlocks(source) {
  const { frontMatter, body, bodyStartLine } = splitFrontMatter(source);
  const lines = body.split('\n');
  const blocks = [];

  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === '') {
      i++;
      continue;
    }

    const start = i;
    const fence = lines[i].match(FENCE_RE);
    const container = lines[i].match(CONTAINER_OPEN_RE);

    if (fence) {
      // 閉じフェンスまでを丸ごと1ブロックにする
      const marker = fence[1];
      i++;
      while (i < lines.length && !lines[i].startsWith(marker)) i++;
      if (i < lines.length) i++;
    } else if (container) {
      // :::message / ::::details など。同じコロン数の閉じ行までを1ブロックにする
      const marker = container[1];
      i++;
      let depth = 1;
      while (i < lines.length && depth > 0) {
        if (lines[i].trim() === marker) depth--;
        else if (new RegExp(`^${marker}[a-zA-Z]`).test(lines[i])) depth++;
        i++;
      }
    } else {
      // 空行までを1ブロック。ただし見出しは常に単独ブロックにする
      if (HEADING_RE.test(lines[i])) {
        i++;
      } else {
        while (i < lines.length && lines[i].trim() !== '' && !FENCE_RE.test(lines[i])) {
          if (i > start && HEADING_RE.test(lines[i])) break;
          i++;
        }
      }
    }

    const text = lines.slice(start, i).join('\n');
    blocks.push({
      id: `¶${blocks.length + 1}`,
      n: blocks.length + 1,
      kind: kindOf(text),
      // 元ファイル上の 1 始まり行番号（front matter を含めた絶対位置）
      startLine: bodyStartLine + start,
      endLine: bodyStartLine + i - 1,
      hash: createHash('sha1').update(text).digest('hex').slice(0, 8),
      preview: preview(text),
      text,
    });
  }

  return { blocks, meta: parseFrontMatter(frontMatter), bodyStartLine };
}
