#!/usr/bin/env python3
"""添削済み PDF を 1 ページ 1 枚の PNG にする（Claude が手書きを読むため）。

    python3 tools/review/pdf-to-png.py <pdf> [--out DIR] [--scale 2.0] [--pages 1-4]

Claude の Read ツールは PDF を直接開くのに poppler(pdftoppm) を要求するが、
実行環境に無いことがあるので pypdfium2 で自前にラスタライズする。

    pip install pypdfium2 pillow
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path


def parse_pages(spec: str, total: int) -> list[int]:
    """"1-4,7" のような指定を 0 始まりのページ番号リストにする。"""
    pages: list[int] = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            pages.extend(range(int(a) - 1, int(b)))
        else:
            pages.append(int(part) - 1)
    return [p for p in pages if 0 <= p < total]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--out", type=Path, help="出力先ディレクトリ（既定: <pdf>と同じ場所の pages/）")
    ap.add_argument("--scale", type=float, default=2.0, help="1.0 = 72dpi。手書きを読むなら 2.0 以上")
    ap.add_argument("--pages", help='"1-4,7" 形式。省略時は全ページ')
    args = ap.parse_args()

    try:
        import pypdfium2 as pdfium
    except ImportError:
        print("pypdfium2 が必要です:  pip install pypdfium2 pillow", file=sys.stderr)
        return 1

    if not args.pdf.exists():
        print(f"PDF が見つかりません: {args.pdf}", file=sys.stderr)
        return 1

    out_dir = args.out or args.pdf.parent / "pages"
    out_dir.mkdir(parents=True, exist_ok=True)

    doc = pdfium.PdfDocument(str(args.pdf))
    targets = parse_pages(args.pages, len(doc)) if args.pages else range(len(doc))

    stem = args.pdf.stem
    for i in targets:
        img = doc[i].render(scale=args.scale).to_pil()
        path = out_dir / f"{stem}-p{i + 1:02d}.png"
        img.save(path)
        print(path)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
