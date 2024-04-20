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

![](/img/flet_tutorial/image.png)

### 時系列データのグラフ表示

例題として、経路追従アルゴリズムにおける車両の位置と、参照点を示す時系列データを描画する方法を考えます。

まずは、すべての時間帯を表示するプログラムを作成しました。

``` code: flet_tutorial.py
    import numpy as np
    import math
    import matplotlib.pyplot as plt
    import pandas as pd
    from flet.matplotlib_chart import MatplotlibChart

    def main(page: ft.Page):

        fig = plt.figure()
        ax = fig.add_subplot(111)
        path_plot(ax)

        page.add(MatplotlibChart(fig, expand=True))

    def path_plot(ax):
        course = pd.read_csv("introduction/data/course.csv", index_col=None)
        cx = course.x
        cy = course.y

        state = pd.read_csv("introduction/data/state.csv", index_col=None)
        x = state.sx
        y = state.sy
        v = state.sv
        time = state.time

        ax.plot(cx, cy, ".b", label="course")
        ax.plot(x, y, "-r", label="trajectory")
        ax.legend()
        ax.set_xlabel("x[m]")
        ax.set_ylabel("y[m]")
        ax.axis("equal")
        ax.grid(True)
        
        return ax

    if __name__ == '__main__':
        ft.app(target=main)
```

![](/img/flet_tutorial/image2.png)

時系列データは、下記を参照して作成しました。

https://myenigma.hatenablog.com/entry/2017/06/05/111007

データの形式は次の通り

:::details データ形式

    ``` csv: course.csv
        x,y
        0,0
        -,-
        49.5,67.3
    ```

    x:コース参照点のx座標
    y:コース参照点のy座標

    ``` csv: course.csv
        time,sx,sy,sv,tx,ty
        0.0,-0.0,-3.0,0.0,0.0,0.0
        -,-,-,-,-,-
        38.8,48.8,65.3,2.8,49.5,67.3
    ```

    time: 時間
    sx: 該当時間における車体のx座標
    sy: 該当時間における車体のy座標
    sv: 該当時間における車体の速度
    tx: 該当時間における参照点のx座標
    ty: 該当時間における参照点のy座標

:::

### slider barをつける

slider barをつけてみました。
これで時間を操作するつもり。

``` code: flet_tutorial.py
    def main(page: ft.Page):

        fig = plt.figure()
        ax = fig.add_subplot(111)
        time = path_plot(ax)

        page.add(MatplotlibChart(fig, expand=True))

        def slider_changed(e):
            t.value = f"time {e.control.value}[sec]"
            page.update()

        unit_time = ((max(time)) - min(time))/len(time)
        print(min(time))
        print(max(time))
        print(len(time))
        print(unit_time)

        t = ft.Text()
        page.add(
            ft.Text("time"),
            ft.Slider(min=min(time), max=max(time), divisions=unit_time, label="{value}[sec]", on_change=slider_changed), t)
```

![](/img/flet_tutorial/image3.png)

### 時間で更新

slider barの更新に合わせて描画を更新する。
