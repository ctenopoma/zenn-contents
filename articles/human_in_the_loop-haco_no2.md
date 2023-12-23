---
title: "ヒト介入型の強化学習:HACO Vol.2"
emoji: "🎁"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["強化学習", "HumanInTheLoop", "Python"]
published: false
---
## 1. はじめに

 人が介入することで、効率的に強化学習を行う手法である、HACOについて調べてみた。
 @[card](https://decisionforce.github.io/HACO/)

 Vol.1はこちら
 @[card](http://localhost:8000/articles/human_in_the_loop-haco_no1)

### 1.1 Human-in-the-loopとは

 Human-in-the-loopとは、～

:::details 記事一覧

#### Human-in-the-loop について

@[card](http://localhost:8000/articles/human-in-the-loop_survey_no1)
:::

#### 1.2 目次
- [1. はじめに](#1-はじめに)
  - [1.1 Human-in-the-loopとは](#11-human-in-the-loopとは)
    - [Human-in-the-loop について](#human-in-the-loop-について)
    - [1.2 目次](#12-目次)
- [2. HACO:Human-AI Copilot Optimization](#2-hacohuman-ai-copilot-optimization)
  - [2.1 HACOの学習パラダイム](#21-hacoの学習パラダイム)
  - [2.2 目的関数の学習](#22-目的関数の学習)
    - [2.2.1 行動価値関数](#221-行動価値関数)
    - [2.2.2 人の介入の削減](#222-人の介入の削減)
    - [2.2.3 方策の学習](#223-方策の学習)

## 2. HACO:Human-AI Copilot Optimization

### 2.1 HACOの学習パラダイム

本論文では、以下の定義を使用する。

- $a_h$: autonomous agentの行動
- $\pi_n(a_n|s)$: autonomous agentの方策関数
- $a_h$: 人が介入した行動
- $I(s, a_n)$: 人が介入したことを示すBool変数。$\hat a = I(s, a_n)a_h + (1-I(s, a_n)a_n$を満たす。
- $\pi_b(a|s) = \pi_n(a|s)(1-I(s, a_n)) + \pi_h G(s)$

### 2.2 目的関数の学習

３つの要素を含んだ下記に示す目的関数を最大化する。
$\max E[Q(s,a) H ]$

#### 2.2.1 行動価値関数

#### 2.2.2 人の介入の削減

#### 2.2.3 方策の学習
