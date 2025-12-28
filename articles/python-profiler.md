---
title: "Pythonの処理時間を調べる"
emoji: "📑"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [Python,cProfile,viztracer,pyspy]
published: true
---

## 前段のお話

前回の記事で、Rust製のPythonライブラリの作り方について調査した。
結果的には、再帰的な処理にてRustの方が1,007,605倍速い結果になった。
自作ライブラリ達をRustに置き換えるにあたり、ボトルネックになっている処理を調べる必要がある。

```cmd
Fibonacci(35):
  Rust:   0.000001s
  Python: 0.725476s
  Speedup: 1007605.9x
```

@[card](https://zenn.dev/ctenopoma/articles/rust-python-ai)

## Pythonプロファイラ

簡単に調べてみたところ、以下の5つが候補に挙がった。
1つ目は公式のプロファイラらしい。

@[card](https://docs.python.org/ja/3.13/library/profile.html)
@[card](https://github.com/plasma-umass/scalene)
@[card](https://github.com/P403n1x87/austin)
@[card](https://github.com/gaogaotiantian/viztracer)
@[card](https://github.com/benfred/py-spy)

## 基準のプログラム

いろいろな原因で遅くなるプログラムを作成したい。
以下の観点で評価用プログラムを作成します。

### シングルプロセス用の評価

1. **関数呼び出しの「回数」と「深さ」**
**検証内容**: 小さな処理を100万回呼ぶループや、深い再帰（フィボナッチ等）を実行。

2. **「CPU時間」と「待ち時間」の区別**
実際に計算している時間と、何もせず待っている時間を区別できるかを評価します。
**検証内容**: time.sleep() やネットワーク通信（I/O）を混ぜた処理を実行。

3. **ライブラリ内部の「透過性」**
自分が書いたコード以外の、標準ライブラリや外部パッケージ（NumPy, Pandas等）の中身をどこまで追えるかを評価します。
**検証内容**: json.loads() や pandas.read_csv() などの標準的なライブラリ関数を実行。

4. **行単位（ラインバイライン）の特定精度**
関数単位ではなく、「その関数の何行目が遅いのか」を特定できるかを評価します。
**検証内容**: 1つの関数の中に、軽い処理（a = 1）と重い処理（sum(range(10**7))）を混在させる。

5. **リソース消費（メモリとCPU）の同時観測**
処理時間だけでなく、その時のメモリ使用量などをセットで確認できるかを評価します。
**検証内容**: 巨大なリストを作成しながら計算を行う処理を実行。

:::details シングルプロセス評価プログラム

```python:eval_single_process.py
import time
import json
import hashlib
import numpy as np  # もしインストールされていなければ pip install numpy

# --- 1. 再帰呼び出し（深さと回数） ---
def pattern_recursion(n):
    """関数呼び出しのオーバーヘッドを評価。プロファイラ自体の負荷が出やすい。"""
    if n <= 1:
        return n
    return pattern_recursion(n - 1) + pattern_recursion(n - 2)

# --- 2. 重いループ処理（CPUバウンド） ---
def pattern_heavy_loop(iterations=10**6):
    """単純なループの累積時間を評価。行単位の特定精度を確認する。"""
    result = 0
    for i in range(iterations):
        # この1行がボトルネックとして検出されるべき
        result += hashlib.md5(str(i).encode()).hexdigest().count('a')
    return result

# --- 3. I/O待ち（Wall time vs CPU time） ---
def pattern_io_bound():
    """CPUを使わずに停止している時間を評価。"""
    print("I/O bound task started...")
    time.sleep(1.5)  # 1.5秒間、CPUは動かない
    return "Finished"

# --- 4. ライブラリ呼び出し（透過性） ---
def pattern_library_call():
    """標準・外部ライブラリの中身がどれだけ見えるかを評価。"""
    data = {f"key_{i}": i for i in range(10000)}
    json_str = json.dumps(data)
    # NumPyなどの重いライブラリ処理
    array = np.random.rand(1000, 1000)
    return np.dot(array, array)

# --- 5. メモリ確保（リソース相関） ---
def pattern_memory_allocation():
    """メモリ確保による遅延を評価。"""
    # 巨大なリストを作成してメモリを消費させる
    large_list = [list(range(100)) for _ in range(100000)]
    return len(large_list)

def main():
    print("--- Start Profiling Test ---")
    
    print("Running: Recursion...")
    pattern_recursion(25)  # 数値はマシンスペックに合わせて調整
    
    print("Running: Heavy Loop...")
    pattern_heavy_loop()
    
    print("Running: I/O Bound...")
    pattern_io_bound()
    
    print("Running: Library Call...")
    pattern_library_call()
    
    print("Running: Memory Allocation...")
    pattern_memory_allocation()
    
    print("--- End Profiling Test ---")

if __name__ == "__main__":
    main()
```

:::

### 分散並列処理用の評価

1. **プロセスを跨いだ追跡能力（Distributed Tracing）**
Rayはメインのプログラムから離れたWorkerプロセスでタスクを実行します。
**評価内容**: メインプロセス（Driver）だけでなく、遠隔で動いている @ray.remote 関数の内部まで計測できているか。

2. **オーバーヘッドの許容性**
並列処理は「個々のタスクが軽量」であることが多いため、プロファイラの負荷が致命的になりやすいです。
**評価内容**: プロファイラを有効にした際、Rayのタスクスケジューリングやプロセス間通信（IPC）が極端に遅延しないか。

3. **通信・シリアライズ時間の可視化**
Ray特有のコストとして、データの「シリアライズ（Pickle等）」と「Object Storeへの転送」があります。
**評価内容**: 純粋な「計算時間」と、データの受け渡しにかかった「通信・待機時間」を区別して表示できるか。

4. **タイムラインの可視化と並行性の把握**
複数のタスクが「いつ、どのCPUで」動いていたかを時系列で見る必要があります。
**評価内容**: 複数のWorkerの稼働状況を横並び（ガントチャート形式）で表示できるか。

5. **集約レポートの分かりやすさ**
Rayでは数百のタスクが並列に走るため、個別のデータを見ても全体像が掴めません。
**評価内容**: 同一の関数（@ray.remote）を何百回も呼んだ際、それらを統計的にまとめて表示できるか。

:::details 分散並列処理評価プログラム

```python eval_multi_process.py
import ray
import time
import hashlib
import numpy as np
import json

# Rayの初期化（ローカル環境でシミュレート）
# ダッシュボードを有効にすると、プロファイリングの全体像が見やすくなります
ray.init(include_dashboard=True)

# --- 評価ポイント1: 並列実行されるタスク（CPUバウンド） ---
@ray.remote
def parallel_heavy_loop(iterations=5*10**5):
    """各WorkerでのCPU計算時間を評価"""
    result = 0
    for i in range(iterations):
        result += hashlib.md5(str(i).encode()).hexdigest().count('a')
    return result

# --- 評価ポイント2: 分散環境でのI/O待ち（アイドル時間） ---
@ray.remote
def parallel_io_bound(duration=1.0):
    """Workerが『何もせず待っている時間』をプロファイラがどう扱うか"""
    time.sleep(duration)
    return "Done"

# --- 評価ポイント3: 巨大データの受け渡し（シリアライズ負荷） ---
@ray.remote
def process_large_data(data):
    """
    Object Storeからのデータ読み出し（デシリアライズ）コストを評価。
    関数の中身は軽いが、データの受け渡しに時間がかかるケース。
    """
    return len(data)

def main():
    print("--- Ray Distributed Profiling Test ---")
    start_time = time.time()

    # A. 大量の小さいタスクを投げる（スケジューリング・オーバーヘッドの評価）
    # プロファイラが「タスクの生成コスト」を捉えられるか
    print("Submitting many small tasks...")
    futures_small = [parallel_heavy_loop.remote(10**4) for _ in range(20)]
    
    # B. 重いタスクを並列実行（並列効率とCPU使用率の評価）
    print("Running heavy parallel tasks...")
    futures_heavy = [parallel_heavy_loop.remote() for _ in range(4)]

    # C. I/O待ちを含むタスク（Wall-clock timeの可視化評価）
    print("Running I/O bound tasks...")
    futures_io = [parallel_io_bound.remote() for _ in range(4)]

    # D. 巨大データの転送（通信・シリアライズコストの評価）
    print("Testing data transfer overhead...")
    large_data = np.random.rand(10**7) # 約80MB
    data_id = ray.put(large_data) # Object Storeへ配置
    futures_data = [process_large_data.remote(data_id) for _ in range(4)]

    # 全タスクの結果を回収
    results = ray.get(futures_small + futures_heavy + futures_io + futures_data)
    
    end_time = time.time()
    print(f"Total execution time: {end_time - start_time:.2f}s")
    print("--- End Test ---")

if __name__ == "__main__":
    main()
```

:::

## Rustでの置き換え基準

### Rustに置き換えることで高速化が予想される原因

基本的には 「CPUバウンドな処理」 かつ 「Pythonの動的性質が足かせになっている処理」 が対象。

- 高頻度ループと計算密度 (CPUバウンド)
- 再帰呼び出しと細かい関数の多用
- 巨大なデータのコピーとメモリ管理
- マルチスレッドによる並列化（GILの回避）

### Rust化する意味が薄いもの

- I/Oバウンド（待ち時間）
- すでに最適化済みのライブラリ呼び出し

### Rustに置き換えるべきと判断基準

1. tottime（純粋な実行時間）の割合が高い
2. ncalls（呼び出し回数）が極端に多い
3. GILによる「並列化の頭打ち」が見える
4. メモリ使用量の「スパイク（急増）」と遅延
5. アルゴリズムの複雑性（O-記法）

## 実行

以下の環境で評価を実行しました。

- OS: Windows11
- Python: 3.12

### 素で実行

time関数で簡単に計測。これが最も簡易的なプロファイラですね。

#### single process

|#|プロセス|時間(seconds)|
|--|---|---|
|1.| Recursion took| 0.011 |
|2.| Heavy Loop took| 1.219 |
|3.| I/O Bound took| 1.500|
|4.| Library Call took |0.153 |
|5.| Memory Allocation took| 0.210|

#### multi process

|#|プロセス|時間(seconds)|
|--|---|---|
|1.| Submit heavy tasks took | 0.000 |
|2.| Submit I/O tasks took | 0.002 |
|3.| Create data took |  0.192|
|4.| Put data took |0.050 |
|5.| Submit data tasks took |0.010|

### cProfile

cProfileで計測して、snakevizで描画してみます。

```cmd
uv run python -m cProfile -o profile.stats eval_single_process.py
uvx snakeviz profile.stats 
```

うーん。。見ずらい。
直感的にどの関数に時間がかかっているかわからないです。

![alt text](/images/python-profiler/cprofile.png)

### Scalene

windowsは公式サポート外らしい。
Linux環境は用意できるが、普段Windowsで開発するので候補外。。

### Austin

これもうまくいかない。。
windows対応とありますが、何かがダメみたい。

```cmd
uv tool install austin-python
uv tool install austin-web
uv run austin -o profile.austin python single_process.py
uvx austin-web profile.austin
----------------------------------------------
austin-web: Austin did not start properly
```

### viztracer

時系列的な関数の動作感を見るにはこれで十分なかんじ。
CPUなどの計算資源の利用率などは見れません。
(CPU使用率は見れるらしいのですが、うまく表示できなかった)

```cmd
uv add --dev viztracer
uv run python -m viztracer eval_single_process.py
vizviewer result.json
```

#### single process

ぱっと見で何に時間がかかっているかは判断できます。

![alt text](/images/python-profiler/viztracer.png)

#### multi process

なんの関数かまでは、ぱっと見ではわかりませんね。

![alt text](/images/python-profiler/viztracer2.png)

### py-spy

一番期待していたのですが、これもうまく実行できず。
これもwindows対応とかいてあるのですがね。。

```cmd
uv add --dev py-spy
uv run py-spy record -o profile.svg -- python eval_single_process.py
------------------------------
Error: Failed to find python version from target process
```

## 結論

かろうじてviztracerが試せましたが、満足はできない結果に。
普段windowsで開発するのですが、検証用の環境が必要そうですね。
次はLinux環境を準備して試すことにします。
