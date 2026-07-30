---
title: "巡回セールスマン問題 〜 書き切れない制約は「破られたときだけ」足す(遅延制約生成)"
emoji: "🚚"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [数理最適化, 混合整数最適化, TSP, SCIP, PySCIPOpt]
published: false
---

## この記事について

数理最適化を大学1年レベルから列生成法・分枝価格法まで学ぶ教材、第3部・実務の定番問題編の3本目です。目次はこちら。

@[card](https://zenn.dev/ctenopoma/articles/mip-curriculum-toc)

配送先30件を1台の車で回って戻る。総距離最小のルートは?——**巡回セールスマン問題(TSP)**です。配送最適化の核であることに加え、この問題には教材全体の折り返し地点となる構造が潜んでいます。

> **書くべき制約が約5億本あって、事前には書き切れない。**

今回はこれを「**破られた制約だけ後から足す**」という発想(遅延制約生成)で突破します。第5部の列生成法は「**必要な変数だけ後から足す**」手法——今日やることの完全な鏡写しです。ここを体験しておくと、列生成の理解が一段深くなります。

:::message
コードと数値はすべて手元で実行した実測です。配送先30件はランダム配置です。
:::

## 定式化(そして罠)

地点 $i, j$ 間の辺を使うか $x_{ij} \in \{0,1\}$(無向)。まず素直に:

$$\min \sum_{i<j} d_{ij} x_{ij} \quad \text{s.t.} \quad \sum_{j} x_{ij} = 2 \ (\forall i)$$

「各地点にちょうど2本の辺がつながる」(入って出る)。これで解いてみると:

![反復の進行](/images/mip-course-3-3-tsp/fig1_iterations.png)

左端が結果です(反復0)。総距離425.1と申し分なく短いのですが、ルートが**5個の小さなループ**に分裂しています。各地点の次数は確かに2。でも1台の車では走れません。**部分巡回路(subtour)**問題です。

## 制約が指数個ある

分裂を禁止するには、「どの真部分集合 $S$ の中でも閉じたループを作ってはいけない」という**部分巡回路除去制約**が要ります。

$$\sum_{i,j \in S} x_{ij} \le |S| - 1 \quad (\forall S \subsetneq V,\ |S| \ge 3)$$

問題はこの制約の**本数**です。地点の部分集合の数だけあるので、30地点なら約 $2^{29} \approx 5.4$億本。メモリに載せることすら不可能です。

ここで発想を変えます。

> 5.4億本のうち、実際に**破られる**制約はごく一部のはず。
> **だったら、破られたのを見つけたときだけ足せばいい。**

## 方式1:解き直しループ(まず素朴に)

一番わかりやすい実装はこうです。

```python
while True:
    m, x = build_base()            # 次数制約だけのTSPを作る
    for S in found_subtours:       # 過去に見つけた部分巡回路の除去制約を再登録
        m.addCons(quicksum(x[i, j] for i in S for j in S if (i, j) in dist)
                  <= len(S) - 1)
    m.optimize()
    comps = connected_components(solution_edges(m, x))
    if len(comps) == 1:            # ループが1本 → 完成
        break
    found_subtours += comps        # 見つけたループを禁止リストに追加
```

実測ログ:

```text
反復0: 距離=425.1, 巡回路の数=5
反復1: 距離=432.8, 巡回路の数=3
反復2: 距離=442.0, 巡回路の数=3
反復3: 距離=444.7, 巡回路の数=3
反復4: 距離=444.8, 巡回路の数=2
反復5: 距離=445.1, 巡回路の数=1 ← 完成
反復方式: 0.11秒, 追加した除去制約: 16本
```

![反復ごとの推移](/images/mip-course-3-3-tsp/fig2_progress.png)

読みどころが2つあります。

- **追加した制約はたった16本**。5.4億本のうち、本当に必要だったのは0.000003%でした。「ほとんどの制約は寝ている」——遅延生成が成立する理由です
- **距離は反復のたびに伸びる**(425→445)。制約を足すほど問題は窮屈になるので当然ですが、これは各反復の値が真の最適値の**下界**であることを意味します。ループが1本になった瞬間、「445.1、これが最適」と証明付きで終わります

## 方式2:SCIPのconstraint handler(プロの書き方)

解き直しループは分かりやすい反面、毎回ゼロから分枝限定法をやり直すのが無駄です。SCIPには「**探索木の中で整数解の候補が出るたびに私に見せろ。違反があればその場で制約を足す**」という仕組み——**constraint handler(制約ハンドラ)**があります。初めての「SCIPの中身に手を入れる」体験です。

```python
from pyscipopt import Conshdlr, SCIP_RESULT

class SubtourEliminator(Conshdlr):
    def find_subtours(self, sol=None):
        edges = [e for e in dist if self.model.getSolVal(sol, self.x[e]) > 0.5]
        return connected_components(edges)

    # 「この解、本当に実行可能?」とSCIPが聞いてくる
    def conscheck(self, constraints, solution, *args, **kwargs):
        if len(self.find_subtours(solution)) > 1:
            return {"result": SCIP_RESULT.INFEASIBLE}   # ループ分裂 → 却下
        return {"result": SCIP_RESULT.FEASIBLE}

    # LP解の段階で介入し、違反した除去制約をその場で追加
    def consenfolp(self, constraints, nusefulconss, solinfeasible):
        comps = self.find_subtours()
        if len(comps) > 1:
            for S in comps:
                self.model.addCons(
                    quicksum(self.x[i, j] for i in S for j in S if (i, j) in dist)
                    <= len(S) - 1)
            return {"result": SCIP_RESULT.CONSADDED}    # 「制約を足したよ」
        return {"result": SCIP_RESULT.FEASIBLE}

m, x = build_base()
m.includeConshdlr(SubtourEliminator(x), "SEC", "subtour elimination",
                  chckpriority=-10, enfopriority=-10, needscons=False)
m.optimize()
```

つまり「部分巡回路禁止」という**明文化できない制約を、コードとして**SCIPに登録したわけです。SCIPは分枝限定法を1本だけ走らせ、整数解の候補が出るたびに私たちのチェック関数を呼び、却下されたら制約を足して続行します。

```text
conshdlr方式: 0.05秒, obj=445.1, 追加カット=16本, 一致=True
```

同じ最適解に、**1回の探索で**到達しました。今回の規模では速度差はわずかですが、問題が大きくなると「探索木を作り直さない」利点は決定的になります。

:::message
実務のTSP/配送問題を本気で解くなら、この仕組みを極限まで磨いた専用ソルバー(Concorde、OR-ToolsのルーティングAPIなど)が既にあります。今日の価値は「**ソルバーの探索に自分のコードを割り込ませる**」という技の習得にあります。業務固有の「書き切れないルール」(例: ルートの形の制限)は、専用ソルバーには入っていません。conshdlrはそれを注入する口です。
:::

## 「後から足す」という思想

今日の構図を一般化しておきます。

| | 事前に全部書く | 必要になったら足す |
| ---- | ---- | ---- |
| 制約が多すぎる | メモリ爆発 | **遅延制約生成**(今日) |
| 変数が多すぎる | メモリ爆発 | **列生成**(第5部) |

どちらも「**LPの解が教えてくれる**」のがポイントです。遅延制約生成では、今の解が**破っている制約**が次に足すべき制約。列生成では、双対価格(1-4)が示す**被約費用が良い変数**が次に足すべき変数。LPは解くたびに「次に何が要るか」のヒントを吐き出す装置なのです。

## まとめ

- TSPの素直な定式化は**部分巡回路**に分裂する(実測: 5個のループ)
- 除去制約は $2^{29}$ 本あるが、**実際に要ったのは16本**(0.000003%)——破られたときだけ足せばよい
- 解き直しループで原理を掴み、**constraint handler**で「探索木1本のまま」実装する
- 「制約を後から足す」(今日)と「変数を後から足す」(列生成)は同じ思想の裏表

## 次回

次回は**ロットサイジング**(段取り費つき多期間生産計画)。在庫の流れの定式化に加えて、**同じ問題の2つの定式化で解ける規模が桁で変わる**実例——第4部「強い定式化」への直接の布石です。

(公開後にリンクを追記します)
