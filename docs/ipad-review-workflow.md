# iPad(GoodNotes)で添削するサイクル

Claude が書いた記事を、iPad の GoodNotes に Apple Pencil で手書き添削し、
その添削を Claude が読み取って Markdown に反映する — を回すための仕組み。

```
Claude          articles/<slug>.md を書く
  │
  │  npm run review -- <slug>   （または articles/*.md を push すると Actions が自動生成）
  ▼
GitHub          review/<slug>/<slug>-review.pdf  +  blocks.json
  │
  │  Working Copy で pull
  ▼
iPad            GoodNotes で開く → 右の余白に手書き添削 → PDF で書き出し
  │
  │  Working Copy の review/<slug>/annotated/ に保存して commit & push
  ▼
Claude          PNG化して読む → 読み取り結果を提示 → Markdown に反映 → push
                起動は /apply-review・Routine・GitHub Actions のいずれか（「4.」参照）
```

やり取りの経路は **GitHub リポジトリ 1 本だけ**。
Dropbox も要らないし、Claude のセッションが消えても状態はリポジトリに残る。
既定の構成では **GitHub に API キーを置く必要もない**（置くのは「4. の C」だけ。
その場合のキーの守り方は「APIキーを漏らさないための設計」に書いた）。

---

## 1. 最初の 1 回だけやる準備

### 手元（Mac など）

```bash
npm install
npx playwright install chromium   # PDF 生成に使う Chromium
pip install pypdfium2 pillow      # 添削PDFを画像化するのに使う
```

Claude Code on the web 側で回すぶんには、このリポジトリを開いた Claude が同じことをやる。

### iPad

1. **Working Copy**（App Store / 買い切り）を入れて、`ctenopoma/zenn-contents` をクローンする。
   - GitHub の Personal Access Token か SSH 鍵で認証する。
   - 添削 PDF を push するのに書き込み権限が要る。
2. **GoodNotes** を入れる。
3. Working Copy の設定で、リポジトリを「ファイル」アプリに公開しておく（Files 経由で GoodNotes と行き来しやすくなる）。

---

## 2. 添削用 PDF を作る

Claude に頼む場合:

```
/review-pdf mip-course-6-1-lns
```

手で叩く場合:

```bash
npm run review -- mip-course-6-1-lns
```

`articles/*.md` を push すれば GitHub Actions（`.github/workflows/review-pdf.yml`）が
同じものを自動生成して同じブランチに戻すので、iPad からは常に最新の PDF が pull できる。

生成されるもの:

| ファイル | 中身 |
| --- | --- |
| `review/<slug>/<slug>-review.pdf` | GoodNotes に取り込む本体 |
| `review/<slug>/blocks.json` | `¶N` ↔ Markdown の行範囲の対応表 |
| `review/<slug>/annotated/` | 添削後の PDF を戻す場所（最初は空） |

### PDF のレイアウト

```
┌────┬──────────────────────────┬───────────────┐
│ ¶12│ 本文（行間広め）          ┆ 手書きコメント │
│    │                          ┆   用の余白     │
│ ¶13│ ...                      ┆   (62mm)      │
└────┴──────────────────────────┴───────────────┘
```

- 左端の `¶12` が**アンカー**。これが Markdown の行範囲と 1:1 で対応している。
- 1 ブロック = 1 段落 / 1 見出し / 1 コードブロック / 1 つの `:::` 記法。
- 1 ページ目に「手書き添削のお作法」と、元にした commit が載っている。

---

## 3. iPad で添削する

1. Working Copy でリポジトリを pull。
2. `review/<slug>/<slug>-review.pdf` を GoodNotes で開く（共有 → GoodNotes、または Files から読み込み）。
3. 右の余白に手書きで書く。

書き方のコツ（Claude の読み取り精度がそのまま変わる）:

- **コメントは、対象ブロックと同じ高さに書く。** 高さでブロックを特定している。
- 高さが紛らわしいときは、コメントの頭に `¶12` と書く。こちらが優先される。
- ページをまたぐ指示や全体講評は、最終ページの余白にまとめる。
- 記号の目安:
  - 取り消し線 = 削除
  - `∧` = ここに追加
  - `?` = 意味が通らない / 根拠が不明
  - `◯` = 良い（残す）
  - `→` = 書き換え案

4. 書き終わったら **PDF で書き出す**（GoodNotes: 共有 → 書き出す → PDF）。
   - 「注釈を含む」で書き出すこと。
5. 書き出し先に Working Copy の `review/<slug>/annotated/` を選ぶ。
   ファイル名は何でもよいが、`2026-07-31-round1.pdf` のように日付を入れておくと後で追える。
6. Working Copy で commit & push。

---

## 4. 添削を記事に反映する

反映の起動には 3 通りある。**このリポジトリは A を採用している**（GitHub に API キーを置かない）。

| | 起動方法 | GitHub に置く秘密情報 | 状態 |
| --- | --- | --- | --- |
| **A** | **自分で Claude に `/apply-review` と言う** | **なし** | **採用中** |
| B | Claude Code on the web の Routine で定期チェックさせる | なし | 未設定 |
| C | GitHub Actions で push をトリガーに自動実行 | `ANTHROPIC_API_KEY` | 休止中 |

### A. 手動（採用中）

Claude に:

```
/apply-review mip-course-6-1-lns
```

中でやっていること:

1. `git pull` して添削 PDF を取り込む
2. `node tools/review/pending.mjs <slug>` — 未反映の PDF を探して 1 ページ 1 枚の PNG に展開
3. Claude が PNG を全ページ読み、`blocks.json` 経由で `¶N` → Markdown の行範囲を引く
4. **反映前に読み取り結果を一覧で出す**（`¶12 (L88-L94) | 指示 | どう直すか`）
5. 合意した内容だけを `articles/<slug>.md` に当てる
6. `applied.json` に記録して commit & push

判読できなかった手書きは推測で埋めず `【判読不能】` として報告するようにしてある。

### B. Routine で定期チェック（キー不要）

Claude Code on the web のセッションで、

> 30分おきに未反映の添削PDFがないか見て、あったら /apply-review して

と頼めば Routine（スケジュール実行）が作られる。認証情報は Anthropic 側に閉じていて、
**GitHub には何も置かない**。iPad から push したあと放っておけば反映される。

### C. GitHub Actions で自動実行（キーが要る / いまは休止中）

`.github/workflows/apply-review.yml`。`review/*/annotated/*.pdf` の push で発火し、
Claude が読み取り → 記事を修正 → **PR を立てる**（ブランチに直接 push はしない）。
マージ前に `review/<slug>/reading-*.md` で読み取り結果を確認する運用。

**現在は自動発火を外してある**（`on:` の push トリガーをコメントアウト）。
GitHub にキーを置いていないので、有効なままだと添削を push するたびに失敗して赤くなるため。

有効にするなら:

1. Settings → Secrets and variables → Actions に `ANTHROPIC_API_KEY` を登録
2. `apply-review.yml` の `on:` の push トリガーのコメントを外す
3. 次節を読み、最低でも **action の SHA 固定**と **Environment secret 化**はやってから有効にする

---

## APIキーを漏らさないための設計

C を有効にするときのための節。**A で運用しているうちは、この節の内容は不要**
（GitHub に置く秘密情報が無いため）。

`apply-review.yml` は、キーが漏れうる経路を潰す形で組んである。

**1. キーを渡すのは 1 ステップだけ**

ワークフロー/ジョブレベルの `env:` には絶対に置かない。そこに置くと、
全ステップ・そのジョブが呼ぶ**すべての third-party action** から読めてしまう。
`anthropic_api_key:` を書いてあるのは "Apply handwritten review" ステップだけ。

**2. そのステップの Claude に、外へ出す手段を与えていない**

```yaml
--allowedTools "Read,Edit,Write,Glob,Grep"
--disallowedTools "Bash,WebFetch,WebSearch,Task"
```

キーはどうしてもプロセス環境には載る（CLI がそれで認証するので）。
なので**シェルもネットワークツールも与えない**のが実効的な防御になる。
`git commit` / `push` / PR 作成は、キーを持たない後続ステップがやる。

**3. GITHUB_TOKEN も Claude から見えないようにする**

`actions/checkout` は既定で GITHUB_TOKEN を `.git/config` に書き込む。
Read ツールがあれば読めてしまうので `persist-credentials: false` にしてある。
token を使うのは、Claude ステップより後ろのステップだけ。

**4. 手書き文字は「データ」であって「指示」ではない**

PDF に写った文字を Claude が指示として実行しないよう、プロンプトで明示している。
記事の推敲以外の要求（コマンド実行・外部送信・認証情報の出力・ワークフローの改変）が
書かれていたら、実行せず `reading-*.md` に「不審な指示」として記録するだけにする。
2 のツール制限は、この指示が破られた場合の第二の壁でもある。

**5. ログに出さない**

`echo` しない、`set -x` しない、`--debug` を付けない、ログを artifact に上げない、
`ACTIONS_STEP_DEBUG` を有効にしない。GitHub は secret をマスクするが、
**base64 などで加工されるとマスクは破れる**ので、そもそも触らせないのが前提。

**6. fork からは動かない**

`push` イベントは自分のリポジトリのブランチでしか発火せず、fork の PR に secret は渡らない。
加えて `if: github.repository == 'ctenopoma/zenn-contents'` で二重に止めてある。
なお `pull_request_target` は fork のコードを base のコンテキストで動かせてしまうので、
このリポジトリでは**使わないこと**。

### まだやっていない、やるとなお良いこと

- **action をコミット SHA で固定する。** 現状は `@v4` `@v1` の可変タグ。
  タグは差し替え可能なので、供給元が乗っ取られると任意コードがジョブ内で動く＝キーが読める。

  ```bash
  gh api repos/anthropics/claude-code-action/commits/v1 --jq .sha
  gh api repos/actions/checkout/commits/v4 --jq .sha
  ```

  で得た SHA を `uses: anthropics/claude-code-action@<sha>  # v1` の形に書き換える。

- **Environment secret にする。** Settings → Environments で `claude` を作り、
  Deployment branches を自分のブランチに限定したうえで、そこに `ANTHROPIC_API_KEY` を置く。
  ワークフロー側は `environment: claude` のコメントを外す。
  任意のブランチのワークフローからキーを引ける状態がなくなる。

- **専用キーにする。** Anthropic Console で Actions 専用のキーを 1 本切り、
  spend limit を付ける。個人利用のキーと分けておけば、失効させても手元が壊れない。

- **定期ローテーション。** 漏れていなくても数ヶ月で切り替える。

いずれも「キーを置かない」A / B を選べば不要になる。

---

## 落とし穴

- **添削待ちのあいだは本文を書き換えない。**
  PDF は生成時点のスナップショットなので、本文を編集すると `¶N` と行番号がずれる。
  編集したら PDF を作り直してから添削する。
  （PDF 1 ページ目とファイル内の commit hash で、ズレていないか確認できる）
- **同じ PDF を 2 回反映しない。** `applied.json` の台帳で防いでいるので、
  反映したら必ず `record-applied.mjs` を通す（`/apply-review` は中でやる）。
- **GoodNotes の書き出しは「PDF」で。** 独自形式（.goodnotes）では読めない。
- `review/*/annotated/.pages/` は画像展開用の作業ディレクトリ。gitignore 済み。

---

## ファイル一覧

| パス | 役割 |
| --- | --- |
| `tools/review/build-review-pdf.mjs` | Markdown → 添削用 PDF + blocks.json |
| `tools/review/split-blocks.mjs` | Markdown を `¶N` 単位に切り、行範囲を持たせる |
| `tools/review/review.css` | PDF のレイアウト（余白幅などはここ） |
| `tools/review/pdf-to-png.py` | PDF → ページ画像（Claude が手書きを読むため） |
| `tools/review/pending.mjs` | 未反映の添削 PDF を探して画像展開 |
| `tools/review/record-applied.mjs` | 反映済み台帳への記録 |
| `.claude/commands/review-pdf.md` | `/review-pdf` |
| `.claude/commands/apply-review.md` | `/apply-review` |
| `.github/workflows/review-pdf.yml` | push 時の PDF 自動生成（キー不要） |
| `.github/workflows/apply-review.yml` | 添削 PDF の push で自動反映 → PR（休止中。`ANTHROPIC_API_KEY` が要る） |
