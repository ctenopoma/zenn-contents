---
title: "Rust製のPythonライブラリを自作してみた"
emoji: "💬"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [aicoding, SDD, AI駆動開発, rust, python]
published: true
---

# Rust製のPythonライブラリを自作してみた

## 動機的なお話

日頃、Pythonで開発を行っている身からして何一つ不便は感じないのですが、uvやruffがRust製であることを考えると、やはり処理速度は正義なのかと思うこの頃。

特に処理速度で困っているわけではないのですが、困る前にRust製ライブラリの作り方を学習しておこうということで。

## 目標

まず適当なライブラリを作成してみて、その後、Rust製のPythonライブラリ開発用のテンプレートを作成していこうと思います。

## サンプルの実装

### 環境

AIの利用を前提として、以下の環境で開発しようと思います。

- copilot
- Rustup: 1.28.2
- Python: 3.14

### 環境構築

#### Rust

以下のページからrustupをダウンロード
<https://rust-lang.org/ja/learn/get-started/>

#### Python

uvをインストール

:::details uvのインストール手順

- pip install --user pipx
- pipxのPATHを通す
- pipx install uv
- uvのPATHを通す
:::

### プロジェクトフォルダの作成

まずプロジェクトフォルダを作成し、基本的なファイルを配置していきます。
最終的にテンプレートを作成することを前提に、各種設定ファイルも配置していきます。

pythonの実行環境としてはuvを利用するため、以下のコマンドを実行。
※ .python-versionを3.14にしておいて下さい

```cmd
uv init .
uv run main.py
------------------
Creating virtual environment at: .venv
Hello from python-rust!
```

:::details pyproject.toml

```toml
[project]
name = "python-rust"
version = "0.1.0"
description = "Add your description here"
readme = "README.md"
requires-python = ">=3.14"
dependencies = []

[project.optional-dependencies]
dev = [
    "pytest>=7.0",
    "ruff",
    "pyrefly",
]

[build-system]
requires = ["maturin>=1.0"]
build-backend = "maturin"

```

:::

pythonのリンターにはruffを利用します。

:::details ruff.toml

```toml
line-length = 100
# Ruff supports up to Python 3.12; use the latest available while targeting >=3.14.
target-version = "py312"

[lint]
select = [
    "E4", "E7", "E9", "F",  # core errors
    "I",                        # import sorting
    "UP",                       # modernize syntax
    "B",                        # bugbear
    "A",                        # builtins safety
    "C4",                       # comprehension rules
    "SIM",                      # simplify
]
extend-ignore = ["E203"]

[lint.isort]
known-first-party = ["python_rust"]
combine-as-imports = true

```

:::

次にrust用の設定ファイルを配置
maturinを使うのですが、uv initとmaturin initの共存の仕方がわからず、手動でファイルを配置。

:::details Cargo.toml

```toml
[package]
name = "python-rust"
version = "0.1.0"
edition = "2021"

[lib]
name = "python-rust"
crate-type = ["cdylib"]

[dependencies]
pyo3 = { version = "0.22", features = ["extension-module"] }

[profile.release]
lto = true
codegen-units = 1

[lints. rust]
unsafe_code = "forbid"
missing_docs = "warn"

[lints.clippy]
# デフォルトで有効にするlint
all = "warn"
pedantic = "warn"
nursery = "warn"

# 特定のlintを無効化（必要に応じて）
# module_name_repetitions = "allow"
# missing_errors_doc = "allow"
```

:::

:::details rust-toolchain.toml

```toml
[toolchain]
channel = "stable"
components = ["rustfmt", "clippy"]
```

:::

:::details .cargo/config.toml

```toml
# .cargo/config.toml
[target.x86_64-pc-windows-msvc]
rustflags = ["-D", "warnings"]

[alias]
lint = "clippy -- -D warnings"
lint-fix = "clippy --fix"
```

:::

最終的なディレクトリ構造はこんな感じ。

```cmd
python-rust
├── .cargo
│   └── config.toml
├── .venv
├── python
│   └── python-rust
│       └── __init__.py
├── src
│   └── lib.rs
├── tests
├── .gitignore
├── .python-version
├── Cargo.toml
├── pyproject.toml
├── ruff.toml
├── rust-toolchain.toml
└── uv.lock
```

### 実験する問題

Pythonで実行すると処理に時間がかかるような問題を取り上げます。
copilot君に壁打ちしてみると、フィボナッチ数列の計算がシンプルで良さそう。これを題材にします。

```python
def fibonacci(n:  int) -> int:
    """フィボナッチ数列（再帰）"""
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)
```

### 実装

早速、speckitを使ってAIに実装してもらいます。
出来上がったコードが以下の通り

※ コメントでいただいた結果に訂正しています。

```rust:lib.rs
use pyo3::prelude::*;

#[pyfunction]
#[must_use]
pub fn fibonacci_recursive(n: u32) -> u64 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci_recursive(n - 1) + fibonacci_recursive(n - 2),
    }
}

#[pyfunction]
#[must_use]
pub fn fibonacci(n: u32) -> u64 {
    fibonacci_recursive(n)
}

#[pymodule]
fn python_rust(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(fibonacci_recursive, m)?)?;
    m.add_function(wrap_pyfunction!(fibonacci, m)?)?;
    Ok(())
}


```

```python:python/python-rust/__init__.py
from .python_rust import fibonacci as fibonacci_rust  # type: ignore # noqa: F401
```

出来上がったコードはこちら。
@[card](https://github.com/ctenopoma/Python-Rust-Sample)

### 評価

上記のリポジトリを利用して、以下のベンチマークを走らせます。

```cmd
uv sync
uv run python
import python_rust
python_rust.benchamrk()
```

結果はこちら。

※ コメントでいただいた結果に訂正しています。

```cmd
>>> python_rust.benchmark()
Fibonacci(35):
  Rust:   0.025235s
  Python: 0.718564s
  Speedup: 28.5x

>>> python_rust.benchmark_iterative()
Fibonacci(35) iterative:
  Rust:   0.024759s
  Python: 0.000002s
  Speedup: 0.0x
```

圧倒的な処理速度。これはいいですね。
AIにコーディングしてもらったので、何が何やらあまりわかりませんが、実装を見る限りそこまで難しいところはなく。
環境構築も至ってシンプルで、困ることはなさそう。
積極的にこの開発体制は採用していきたいですね。

## テンプレートの作成

さて、最終目標であるRust製アプリケーションを開発のテンプレートを作成していきます。
サンプルを作成して、いくつか経験も積めました。

以下のツールの使用を前提とした開発テンプレートを作成します。

### 配布ツール

- copier

### Python

- uv(Python>=3.12)
- ruff
- pyrefly
- maturin

### Rust

- rustup
- clippy

### 公開先

作成したテンプレートを以下で公開しています。

```cmd
pipx install copier
copier copy https://github.com/ctenopoma/python-rust-copier.git my-project
```

@[card](https://github.com/ctenopoma/python-rust-copier)

こんな感じのディレクトリになります。
src/**.rsを追加して開発を進めていきます。

```
.
├── .cargo
│   └── config.toml
├── docs
│   ├── conf.py
│   └── index.rst
├── mypkg
│   └── __init__.py
├── src
│   └── lib.rs
├── tests
│   ├── python
│   │   └── test_example.py
│   └── rust
│       └── lib_tests.rs
├── .dockerignore
├── .gitignore
├── build.ps1
├── BUILDING.md
├── Cargo.toml
├── CHANGELOG.md
├── docker-compose.yml
├── Dockerfile
├── noxfile.py
├── pyproject.toml
├── README.md
├── ruff.toml
└── rust-toolchain.toml
```

## 結論

Rustを使うことで、個人的にはC++のような面倒なビルドもなく、割と楽に高速化が図れるなという感想。
場面によっては活躍してくれると思うので、AIを利用する前提のコーディングではコスト低く開発がすすめられそう。

## 追記

@Northwardさんがコメントにて、実装した関数について訂正いただいています。
分かりやすく書いていただいているので、コメントを参照ください。
AIが書いたコードをよく見もせずに載せてしまい、大反省。
