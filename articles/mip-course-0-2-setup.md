---
title: "#2 SCIP + PySCIPOpt 環境構築"
emoji: "🔧"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [数理最適化, SCIP, Python, PySCIPOpt, 環境構築]
published: true
---

## この記事について

**MIP**(Mixed Integer Programming)の数理最適化を学ぶ教材の第2回です。教材全体の目次はこちら。

@[card](https://zenn.dev/ctenopoma/articles/mip-curriculum-toc)

## Introduction

今回はセットアップ回です。ゴールは1つだけ。

**手元のPythonで、SCIPが1問解けること。**

5分で終わらせて次に進みましょう。

## 前提

- Python 3.9以降(この記事はPython 3.11で確認)
- pipが使えること

以前は「SCIP本体を公式サイトからダウンロードしてインストールし、PATHを通してからPySCIPOptを入れる」という手順が必要でしたが**今は不要です。** PySCIPOpt 4.3.0以降、PyPIのパッケージにSCIP本体が同梱されているため、pip一発で完結します。

## インストール

### pip の場合

```bash
pip install pyscipopt
```

これだけです。SCIP本体込みでダウンロードサイズは17MBほどでした。

### uv でプロジェクトを作る場合(おすすめ)

この教材のコードを1つのプロジェクトとして管理するなら、uvが手軽です。

```bash
uv init mip-course
cd mip-course
uv add pyscipopt matplotlib numpy
```

`matplotlib` と `numpy` は次回以降の可視化で使うので、ここで一緒に入れておくのがおすすめです。

## 動作確認

次のコードを `hello_scip.py` として保存して実行してください。内容は「小さな線形計画を1問解いてバージョンと答えを表示する」だけです。

```python
import pyscipopt
print("PySCIPOpt:", pyscipopt.__version__)

from pyscipopt import Model

m = Model("hello-scip")
x = m.addVar("x", ub=4)          # 0 <= x <= 4
y = m.addVar("y", ub=3)          # 0 <= y <= 3
m.addCons(x + y <= 5)
m.setObjective(3*x + 2*y, "maximize")
m.hideOutput()
m.optimize()

print("SCIP:", m.version())
print("status:", m.getStatus())
print("objective:", m.getObjVal())
print("x =", m.getVal(x), ", y =", m.getVal(y))
```

手元での実行結果です。

```text
PySCIPOpt: 6.2.1
SCIP: 10.0
status: optimal
objective: 14.0
x = 4.0 , y = 1.0
```

`status: optimal` が出れば環境構築は完了です。バージョンが多少違っても、この教材の範囲では問題ありません。

:::message
答えの意味も一応確認しておきます。3x + 2y を最大にしたいので、係数の大きい x を上限の4まで使い(3×4=12)、残った枠 x+y≦5 の分だけ y=1(2×1=2)、合計14。直感どおりの答えです。この「なぜその答えになるのか」を絵で理解するのが次々回(1-1)のテーマです。
:::

## ライセンスについて

- **SCIP** はバージョン8.0.3以降、**Apache 2.0ライセンス**です。かつては学術利用限定(ZIB Academic License)だったため「SCIPは商用不可」という古い情報が残っていますが、最新版は商用利用を含めて無償で使えます
- **PySCIPOpt** はMITライセンスです

ただし8.0.2以前のSCIPは有償のままなので注意してください。いずれにせよ、業務で使う際はその時点の公式のライセンス文書を確認してください。

@[card](https://www.scipopt.org/)

## つまずきやすいポイント

| 症状 | 原因と対処 |
| ---- | ---- |
| `import pyscipopt` で共有ライブラリのエラー | 別途インストールしたSCIPと同梱版が衝突している可能性。環境変数 `SCIPOPTDIR` や `LD_LIBRARY_PATH` にSCIP関連の設定が残っていたら外す |
| 古い記事の手順でSCIP本体を入れようとしている | 不要。`pip install pyscipopt` だけでよい |
| Apple Silicon (M1/M2/M3) で入らない | 近年のバージョンはarm64のwheelが提供済み。まず `pip install -U pip` してから再試行 |
| 会社のプロキシ配下でダウンロードできない | pipのプロキシ設定(`--proxy`)か、社内ミラーの利用を検討 |

## 次回

道具は揃いました。次回は「解を**見る**道具立て」。小さな割当問題を解いて、その解を表・ガントチャート・ネットワーク図に描き分けます。この教材で全編使い回す可視化の型を作る回です。

@[card](https://zenn.dev/ctenopoma/articles/mip-course-0-3-visualization)
