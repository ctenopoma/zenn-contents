---
title: "SCIPを拡張する 〜 プラグイン開発の地図と、自作ヒューリスティクス・自作分枝規則"
emoji: "🔌"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [数理最適化, 混合整数最適化, SCIP, Python, PySCIPOpt]
published: false
---

## この記事について

数理最適化を大学1年レベルから列生成法・分枝価格法まで学ぶ教材、第6部・最新技術と実務運用編の2本目です。目次はこちら。

@[card](https://zenn.dev/ctenopoma/articles/mip-curriculum-toc)

この教材でSCIPを「使う」だけでなく「中に手を入れる」場面が何度かありました。TSPのconstraint handler(3-3)、分枝価格法のプライサー(5-2)。あれらは実は、SCIPの**プラグインアーキテクチャ**という一つの仕組みの別の顔です。

今回はその全体地図を描き、まだ触っていなかった2つ——**自作ヒューリスティクス**と**自作分枝規則**——を実装して、「ソルバーを使う人」から「ソルバーを組み込む人」への一歩を締めくくります。

:::message
コードと数値はすべて手元で実行した実測です。題材は多次元ナップサック(80品・制約10本)です。
:::

## 地図:SCIPの求解ループと差し込み口

SCIPが「Solving Constraint Integer Programs」の名の通りプラグインの集合体であることは、求解ループを描くと一目でわかります。

![プラグインの地図](/images/mip-course-6-2-plugins/fig1_map.png)

中央の縦の流れは、2-2で手作りした分枝限定法そのものです(ノードを選ぶ→LP緩和→分枝)。SCIPはこのループの**各ステップを外部コードに開放**しています。

| プラグイン | 差し込む場所 | 一言で | この教材での登場 |
| ---- | ---- | ---- | ---- |
| **Pricer** | LP緩和を解くとき | 変数(列)を後から作る | 5-2 分枝価格法 |
| **Conshdlr** | 解のチェック時 | 書き切れない制約をコードで表現 | 3-3 TSP |
| **Sepa** | カット分離時 | 分数解を切る不等式を注入 | 4-2(概念のみ) |
| **Heur** | ヒューリスティクス実行時 | 自作の解探しを走らせる | **今回** |
| **Branchrule** | 分枝時 | 分枝変数・分け方を自分で決める | **今回** |

どのプラグインも作り方は同じ型です: **(1) 基底クラスを継承し、(2) 決められたコールバックを実装し、(3) `include◯◯` で登録する**。3-3でやったことの一般形です。

## 実装1:自作ヒューリスティクス(Heur)

6-1で「LNSを外側で自作」しましたが、ヒューリスティクスは**探索木の中に住まわせる**こともできます。ここでは「今のノードのLP解を、1に近い順に貪欲に丸めて容量を守る」という素朴なヒューリスティクスをプラグイン化します。

```python
from pyscipopt import Heur, SCIP_RESULT, SCIP_HEURTIMING

class GreedyRounding(Heur):
    def heurexec(self, heurtiming, nodeinfeasible):
        model = self.model
        # 今のLP解を読む(sol=None は「現在のLP解」の意)
        lpvals = [model.getSolVal(None, xi) for xi in self.x]
        # 1に近い順に、容量を破らない限り採用
        pick = greedy_round(lpvals)
        # 解を作って提出。SCIPが検証して受理/却下を決める
        sol = model.createSol(self)
        for i, xi in enumerate(self.x):
            model.setSolVal(sol, xi, float(pick[i]))
        if model.trySol(sol):
            return {"result": SCIP_RESULT.FOUNDSOL}
        return {"result": SCIP_RESULT.DIDNOTFIND}

m.includeHeur(GreedyRounding(x), "greedyround", "LP解の貪欲丸め+リペア", "g",
              timingmask=SCIP_HEURTIMING.AFTERLPNODE, freq=5)
```

ポイントは3つ。

- `getSolVal(None, var)` で**そのノードのLP解**が読める。深いノードほど変数が固定され、LP解が「ヒント」として濃くなる——ただ丸めるだけでも、探索木の文脈が乗る
- 提出は `trySol`。**検証はSCIPがやる**ので、壊れた解を出しても事故にはならない(却下されるだけ)
- `freq=5` で5深さごとに起動。頻度は性能との相談

実測では、この即席ヒューリスティクスが探索中に**225個の解を採用**させ、問題は最適まで解けました。2-3のログで見た `r` や `L` の行の隣に、自分の名前のヒューリスティクスが並ぶ体験は一度やる価値があります。

## 実装2:自作分枝規則(Branchrule)

2-2の最後に「どの変数で分枝するかは性能を桁で左右する」と予告しました。それを実測する時が来ました。教科書によく載る「**最も分数に近い変数で分枝**(most fractional)」を実装します。

```python
from pyscipopt import Branchrule

class MostFractional(Branchrule):
    def branchexeclp(self, allowaddcons):
        # 分枝候補(LP解が分数の変数)の一覧をもらう
        cands, sols, fracs, ncands, *_ = self.model.getLPBranchCands()
        # 0.5に一番近い候補を選ぶ
        best = max(range(ncands), key=lambda i: min(fracs[i], 1 - fracs[i]))
        self.model.branchVar(cands[best])       # その変数で2分枝
        return {"result": SCIP_RESULT.BRANCHED}

m.includeBranchrule(MostFractional(), "mostfrac", "最分数分枝",
                    priority=10000000, maxdepth=-1, maxbounddist=1.0)
```

`priority` を巨大にするとSCIP既定の規則より優先されます。同じ問題で勝負した結果:

| 分枝規則 | 求解時間 | ノード数 |
| ---- | ---- | ---- |
| **SCIP既定(信頼度分枝)** | **18.1秒** | **39,884** |
| 自作・最分数分枝 | 49.6秒 | 143,562 |

**自作の負けです。2.7倍遅く、木は3.6倍太い。** これは重要な実測です。「0.5に近い変数=一番曖昧だから先に決めるべき」という直感は昔から知られていますが、実験的には**ランダム分枝に毛が生えた程度**であることも知られています。SCIPの既定は、分枝したときの下界改善量を学習・推定する**信頼度分枝(reliability branching)**で、これは数十年の研究の到達点です。

ではBranchruleは無用かというと、逆です。**汎用規則が知らない構造を知っているとき**だけ、自作が勝ちます。その代表例が既に本教材に登場しています——5-2の**Ryan-Foster分枝**です。あれは「変数単位の分枝は列生成と相性が悪い」という構造的事情に対して、「2つの注文が同じパターンに載るか否か」という**問題固有の分枝**を設計したのでした。Branchruleは「賢くやる」ためでなく「**正しくやる**」ために書く場面が多い、というのが実務的な結論です。

@[card](https://zenn.dev/ctenopoma/articles/branch-and-price)

## プラグイン開発の実務メモ

- **段階を意識する**。SCIPは「問題作成→transform→presolve→solving」のステージを持ち、呼べるAPIがステージごとに違います(6-1の `trySol` が事前に呼べなかったのはこれ)。solving中のモデル変更は `freeTransform` か、プラグインのコールバック内から
- **まず既定に勝てるか測る**。今回の分枝実験のように、自作が既定に勝つのは案外難しい。ベンチマークを取ってから本実装へ
- **プラグインの層で守られている**。trySolの検証、カットの妥当性チェックなど、SCIP側に安全網がある。「壊す」心配より「遅くする」心配をする
- 本気の性能が要るならC APIへの移行も視野に(PySCIPOptのコールバックはPython関数呼び出しコストを払う)。ただしプロトタイピングはPythonで十分です

## まとめ

- SCIPは分枝限定ループの各ステップを開放したプラグイン集合体。**Pricer / Conshdlr / Sepa / Heur / Branchrule** で教材の主要トピックが全部つながる
- 自作ヒューリスティクス: LP解を読んで `trySol` で提出、検証はSCIP任せ(実測: 225解を供給)
- 自作分枝規則: 実装は10行、しかし**既定(信頼度分枝)に2.7倍差で負けた**——自作が勝つのは問題構造を知っているとき(Ryan-Fosterが好例)
- ステージ制約と「まず測る」を守れば、プラグインは安全な遊び場

## 次回

次回は**機械学習×MIPの現在地**。learning to branch、MLによる初期解生成、predict-then-optimize——研究最前線のうち「実務で今すぐ効く部分」と「まだ論文の中の部分」を切り分けます。

(公開後にリンクを追記します)
