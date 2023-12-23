---
title: "pythonで最速でGUIを作る(導入)"
emoji: "📚"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["flet", "python", "GUI"]
published: false
---

## 目的

今回の目的は、**pythonで最速でGUI環境を構築する**こと。
想定する使い方は以下の２つ。

- **分析したデータを表示するためのGUI**
  →　複数の時系列データを時間を推移させながら各時刻での状態を表示したい。例えば移動する物体の位置、向き、速度などを絵とグラフで分かりやすく、時間を操作しながら。

- **pythonプログラムで開発したアプリの実行画面としてのGUI**
  →　pythonで開発したアプリケーションを非プログラマに配布するときは、実行環境を埋め込んでBatで実行してもらっているが、GUIがあったほうが恰好が良い＆操作性UP

c#やjavascriptsで開発するのが良いのは分かるが、いかんせん学習コストがかかる。javascriptsに手を出して挫折すること数回、一向にGUIをパパっと作るレベルには到達しませんでした。

そこで、pythonで**ある程度のGUI**をぱぱっと、**最速**で、**学習コスト最小**で開発する方法を勉強してみたいと思います。

## 環境

今回はGUI開発ライブラリとして**Flet**を使用する。
理由は、とにかくpythonユーザにとっつきやすい記法であったため。
plotlyでも良いけど、あれはあれで覚えることが多くて、その割に操作性が良くない気がして不採用。

https://flet.dev/

簡単に実行環境を以下に記載。

- python: 3.10-64
- flet: 0.17.0

## 要件定義

導入するためのチュートリアルとして、以下の２つの要件を満たすGUIを作成してみます。

1. 複数の時系列データについて、各時刻における状態が表示できること。
2. 上記の各時刻をバーで制御できること

## 開発

### チュートリアル

fletのチュートリアルを実行。

``` code: flet_tutorial.py
    import flet as ft

    def main(page: ft.Page):
        t = ft.Text(value="Hello, world!", color="green")
        page.controls.append(t)
        page.update()

    ft.app(target=main)
```

![実行結果](/img/flet_tutorial/image.png)

