---
description: 記事の添削用PDF（GoodNotes用）を生成してpushする
argument-hint: <記事のslug>（省略時は直近の変更から推測）
allowed-tools: Bash(node tools/review/*), Bash(npm run review*), Bash(git *), Read, Glob
---

iPad の GoodNotes で添削するための PDF を作る。

対象記事: $ARGUMENTS

手順:

1. slug が指定されていなければ、`git status --porcelain articles/` と直近のコミットから
   対象記事を推測し、複数候補があれば聞く。
2. `npm run review -- <slug>` を実行する。
   - `review/<slug>/<slug>-review.pdf` … GoodNotes に取り込む本体
   - `review/<slug>/blocks.json` … ¶N ↔ Markdown 行範囲の対応表
   - 依存が入っていない場合は `npm install` を先に走らせる。
3. 生成物をコミットして push する（`git push -u origin <現在のブランチ>`）。
   コミットメッセージは `review: <slug> の添削用PDFを生成` の形。
4. 最後に、iPad 側でやることを 3 行以内で伝える:
   - Working Copy で pull → `review/<slug>/<slug>-review.pdf` を GoodNotes で開く
   - 右の余白に手書きで添削する
   - 書き出した PDF を `review/<slug>/annotated/` に置いて commit & push

注意:
- PDF は「その時点の Markdown のスナップショット」。生成後に本文を書き換えると ¶N がずれるので、
  添削待ちのあいだは本文をいじらない。いじったら PDF を作り直す。
