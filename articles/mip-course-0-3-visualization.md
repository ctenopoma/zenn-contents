---
title: "#3 最適化の解を可視化"
emoji: "📊"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [数理最適化, SCIP, Python, PySCIPOpt, matplotlib]
published: true
---

## この記事について

**MIP**(Mixed Integer Programming)の数理最適化を学ぶ教材の第3回です。教材全体の目次はこちら。

@[card](https://zenn.dev/ctenopoma/articles/mip-curriculum-toc)

## Introdcution

ソルバーの出力は、素のままだと数値の羅列です。

```text
x_佐藤_検品A = 1.0
x_佐藤_棚卸し = 0.0
x_佐藤_検品B = 0.0
...(あと29行)
```

これを眺めて「よし、正しい」と言える人はいません。実務の最適化では、可視化は**必須工程**です。理由は2つ。

- **答え合わせのため。** 制約が守れているか、変な解になっていないかは、目で見るのが一番速い。定式化のバグの大半は図にした瞬間に見つかります
- **説明のため。** シフト表を使うのは店長であり、配送計画を走るのはドライバーです。「最適です」という主張は、相手が読める絵になって初めて通ります

今回は小さな割当問題をSCIPで解き、同じ1つの解を**表(ヒートマップ)・ガントチャート・ネットワーク図**の3通りに描き分けます。この3つがこの教材で全編使い回す可視化の型です。

:::message
コードはすべて手元で実行し、数値・図は実行結果をそのまま貼っています。環境構築は前回の記事を参照してください。
:::

## 題材:倉庫の1日のタスク割当

倉庫の事務所で、4人の担当者に8つのタスクを割り当てます。

- 各タスクには**時間帯**が決まっている(検品Aは9:00〜11:00、など)
- 各タスクは**ちょうど1人**が担当する
- 同じ人は**時間が重なる**タスクを掛け持ちできない
- 担当者ごとに**得意・不得意**がある(適性コスト:小さいほど得意)
- 適性コストの合計を最小にしたい

データはこうです。時間帯と適性コストを1つの表にまとめます。

| タスク | 時間帯 | 佐藤 | 鈴木 | 高橋 | 田中 |
| ---- | ---- | :--: | :--: | :--: | :--: |
| 検品A | 9:00〜11:00 | 2 | 6 | 4 | 5 |
| 棚卸し | 9:30〜12:00 | 5 | 2 | 4 | 3 |
| 検品B | 10:00〜11:30 | 2 | 5 | 3 | 6 |
| 発注 | 11:00〜13:00 | 8 | 3 | 5 | 2 |
| 入荷対応 | 12:00〜14:30 | 4 | 7 | 2 | 5 |
| 検品C | 13:00〜15:00 | 2 | 6 | 4 | 5 |
| 返品処理 | 13:30〜16:00 | 6 | 3 | 5 | 2 |
| 出荷準備 | 15:00〜17:00 | 5 | 6 | 2 | 4 |

数値はすべて適性コスト(小さいほど得意)です。コードにするとこうなります。

```python
workers = ["佐藤", "鈴木", "高橋", "田中"]
# タスク: (開始, 終了)  9時からの経過時間[h]
tasks = {
    "検品A":   (0.0, 2.0),
    "棚卸し":  (0.5, 3.0),
    "検品B":   (1.0, 2.5),
    "発注":    (2.0, 4.0),
    "入荷対応": (3.0, 5.5),
    "検品C":   (4.0, 6.0),
    "返品処理": (4.5, 7.0),
    "出荷準備": (6.0, 8.0),
}
# 適性コスト(小さいほど得意)
cost = {
    "佐藤": {"検品A": 2, "棚卸し": 5, "検品B": 2, "発注": 8, "入荷対応": 4, "検品C": 2, "返品処理": 6, "出荷準備": 5},
    "鈴木": {"検品A": 6, "棚卸し": 2, "検品B": 5, "発注": 3, "入荷対応": 7, "検品C": 6, "返品処理": 3, "出荷準備": 6},
    "高橋": {"検品A": 4, "棚卸し": 4, "検品B": 3, "発注": 5, "入荷対応": 2, "検品C": 4, "返品処理": 5, "出荷準備": 2},
    "田中": {"検品A": 5, "棚卸し": 3, "検品B": 6, "発注": 2, "入荷対応": 5, "検品C": 5, "返品処理": 2, "出荷準備": 4},
}
```

定式化は前回のシフト問題とほぼ同じ形です。

```python
from pyscipopt import Model, quicksum

def overlap(t1, t2):
    s1, e1 = tasks[t1]
    s2, e2 = tasks[t2]
    return s1 < e2 and s2 < e1

task_names = list(tasks)
m = Model("assignment")
x = {(w, t): m.addVar(vtype="B", name=f"x_{w}_{t}")
     for w in workers for t in task_names}

for t in task_names:  # 各タスクはちょうど1人が担当
    m.addCons(quicksum(x[w, t] for w in workers) == 1)
for w in workers:     # 時間が重なる2タスクは同じ人に入れない
    for i, t1 in enumerate(task_names):
        for t2 in task_names[i + 1:]:
            if overlap(t1, t2):
                m.addCons(x[w, t1] + x[w, t2] <= 1)

m.setObjective(quicksum(cost[w][t] * x[w, t]
                        for w in workers for t in task_names), "minimize")
m.optimize()
```

実行結果です。

```text
status: optimal
総コスト: 17
検品A: 佐藤 (コスト2)
棚卸し: 鈴木 (コスト2)
検品B: 高橋 (コスト3)
発注: 田中 (コスト2)
入荷対応: 高橋 (コスト2)
検品C: 佐藤 (コスト2)
返品処理: 田中 (コスト2)
出荷準備: 高橋 (コスト2)
```

ここから、この1つの解を3通りに描きます。まず解を扱いやすい辞書に受けておきます。

```python
assign = {t: w for w in workers for t in task_names
          if m.getVal(x[w, t]) > 0.5}   # 0/1変数は「> 0.5」で判定するのが安全
```

:::message
`m.getVal(x) == 1` と書いてはいけません。ソルバーの返す値は `0.9999999...` のような浮動小数点数のことがあるためです。バイナリ変数の判定は `> 0.5` が定石です。
:::

## 型1:行列の解は「ヒートマップ+採用マーク」

割当問題の解は本質的に**行列**(誰×何)です。行列はヒートマップにして、採用されたマスに印をつけます。

```python
import numpy as np
import matplotlib.pyplot as plt

C = np.array([[cost[w][t] for t in task_names] for w in workers], dtype=float)
fig, ax = plt.subplots(figsize=(8.4, 3.6))
im = ax.imshow(C, cmap="YlOrRd", vmin=1, vmax=9, aspect="auto")
ax.set_xticks(range(len(task_names)), task_names)
ax.set_yticks(range(len(workers)), workers)
for i, w in enumerate(workers):
    for j, t in enumerate(task_names):
        ax.text(j, i, str(cost[w][t]), ha="center", va="center")
        if assign[t] == w:  # 採用されたマスに◯
            ax.add_patch(plt.Circle((j, i), 0.38, fill=False,
                                    color="#1a5fb4", lw=2.2))
fig.colorbar(im, ax=ax, label="コスト(小さいほど得意)")
```

![適性コスト表と採用された割当](/images/mip-course-0-3-visualization/fig1_matrix.png)

この図の読みどころは**検品Bの列**です。最安は佐藤のコスト2なのに、選ばれたのは高橋のコスト3。ソルバーのバグでしょうか?

違います。検品A(9:00〜11:00)と検品B(10:00〜11:30)は時間が重なっていて、検品Aを担当する佐藤は検品Bを掛け持ちできません。**「各列で最小のマスを選ぶ」だけでは済まないのが制約付き最適化**であり、その事情が図から読み取れます。数値の羅列ではまず気づけません。

## 型2:時間がある解は「ガントチャート」

タスクに時間帯があるなら、担当者×時間軸のガントチャートが最強です。

```python
colors = {"佐藤": "#4c72b0", "鈴木": "#dd8452", "高橋": "#55a868", "田中": "#c44e52"}
fig, ax = plt.subplots(figsize=(8.4, 3.2))
for i, w in enumerate(workers):
    for t in task_names:
        if assign[t] == w:
            s, e = tasks[t]
            ax.barh(i, e - s, left=s, height=0.55, color=colors[w])
            ax.text((s + e) / 2, i, t, ha="center", va="center", color="white")
ax.set_yticks(range(len(workers)), workers)
ax.set_xticks(range(0, 9), [f"{9 + h}時" for h in range(0, 9)])
ax.invert_yaxis()
```

![担当者別ガントチャート](/images/mip-course-0-3-visualization/fig2_gantt.png)

ガントチャートは**制約の目視チェック**がそのままできます。「同じ行でバーが重なっていない」=掛け持ち禁止の制約が守られている、が一目でわかります。もし定式化にバグがあってバーが重なれば、この図が最初に教えてくれます。

現場に見せる図もこれです。店長やリーダーが読むのは数式ではなくこの表です。

## 型3:「誰と何がつながるか」は「ネットワーク図」

割当・マッチング・輸送のように「AとBの対応関係」が本体の解は、二部グラフで描けます。

```python
fig, ax = plt.subplots(figsize=(7.6, 4.6))
wy = np.linspace(0.85, 0.15, len(workers))   # 左列: 担当者のy座標
ty = np.linspace(0.95, 0.05, len(task_names)) # 右列: タスクのy座標
for i, w in enumerate(workers):
    ax.scatter(0.12, wy[i], s=1300, color=colors[w], zorder=3)
    ax.text(0.12, wy[i], w, ha="center", va="center", color="white", zorder=4)
for j, t in enumerate(task_names):
    ax.scatter(0.88, ty[j], s=1600, color="#eeeeee", edgecolor="#999999", zorder=3)
    ax.text(0.88, ty[j], t, ha="center", va="center", zorder=4)
for j, t in enumerate(task_names):  # 採用された組だけ線を引く
    i = workers.index(assign[t])
    ax.plot([0.155, 0.845], [wy[i], ty[j]], color=colors[assign[t]], lw=2.2)
ax.axis("off")
```

![二部グラフ](/images/mip-course-0-3-visualization/fig3_network.png)

ネットワーク図は担当者ごとの**負荷の偏り**が直感的に見えます(高橋から3本、鈴木から1本)。第3部の配送問題(TSP)や第5部の車両ルーティングでは、このネットワーク描画が主役になります。

## 3つの型の使い分け

| 型 | 向いている解 | この教材での主な出番 |
| ---- | ---- | ---- |
| ヒートマップ | 行列型の解(誰×何、モノ×場所) | 割当、シフト、制約行列の観察 |
| ガントチャート | 時間軸のある解 | シフト、生産計画、スケジューリング |
| ネットワーク図 | つながりが本体の解 | 輸送、TSP、車両ルーティング、列生成 |

迷ったら「**その解を現場の人に口頭で説明するとき、ホワイトボードに何を描くか**」を考えてください。それがそのままグラフの型になります。

## まとめ

- 可視化は飾りではなく、**答え合わせ**と**説明**のための必須工程
- バイナリ変数の値の判定は `> 0.5` で(浮動小数点対策)
- 型は3つ:行列はヒートマップ、時間はガント、つながりはネットワーク
- 図は定式化のバグ検出器でもある(バーの重なり、線の偏り)

## 次回

準備編はここまで。次回から第1部・線形計画(LP)編です。2製品の生産計画を**方眼紙の上で**解き、「実行可能領域」「等高線」「最適解はなぜ角に来るのか」を絵で理解します。

(公開後にリンクを追記します)
<!-- @[card](https://zenn.dev/ctenopoma/articles/mip-course-1-1-lp-graphical) -->