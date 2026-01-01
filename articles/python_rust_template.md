---
title: "【保存版】Python×Rustテンプレートで爆速開発"
emoji: "📘"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [Python,Rust,Copier]
published: true
---

## 0. Python×Rust

Pythonの手軽さとRustの計算速度で爆速で爆速プログラムを開発しませんか？
面倒なプロジェクトの立ち上げが、テンプレートを使うことで苦労なくできちゃいます。

## 1. 目的

この記事の目的は、作成したRust製Pythonライブラリ開発テンプレートの使い方を紹介することです。

@[card](https://github.com/ctenopoma/python-rust-copier)

## 2. 準備

- Copier
- uv
- rustup

**or**

- docker

## 3. ビルドを通すまで

### 3.1 準備編

必要なツールをインストールします。
Gitは自身でご準備下さい。

:::details ubuntu

```bash
# update
sudo apt update
sudo apt install -y curl git build-essential

# uv install
curl -LsSf https://astral.sh/uv/install.sh | sh

# terminal再起動

# copier install
uv tool install copier

# rustup install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# terminal再起動
```

:::

:::details windows

```powershell
pipx install uv

uv tool install copier

powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

```

:::

### 3.2 プロジェクト作成編

```bash
copier copy https://github.com/ctenopoma/python-rust-copier.git <フォルダ名>
```

:::details プロジェクト設定

```bash
🎤 Human-friendly project name
   My Rust-Py Library
🎤 Python-safe package slug (PEP 8 module name)
   mypkg
🎤 Initial semver version
   0.1.0
🎤 Author name
 
🎤 SPDX identifier (e.g., MIT, Apache-2.0)
   MIT
🎤 Short project description
   Rust-backed Python library template
🎤 Target Python version
   3.12
🎤 Rust toolchain via rustup (e.g., stable)
   stable
🎤 Emit uv lockfile on scaffold
   Yes
🎤 Fixed FFI boundary (PyO3)
   PyO3
🎤 Target deployment platform (determines which build scripts to include)
   Linux
🎤 Include Docker Compose setup for development container
   Yes

Copying from template version 1.1.1
    create  build.sh
    create  .dockerignore
    create  CHANGELOG.md
    create  Cargo.toml
    create  README.md
    create  docker-compose.yml
    create  pyproject.toml
    create  src
    create  src/lib.rs
    create  noxfile.py
    create  Dockerfile
    create  ruff.toml
    create  mypkg
    create  mypkg/__init__.py
    create  .gitignore
    create  .cargo
    create  .cargo/config.toml
    create  docs
    create  docs/index.rst
    create  docs/conf.py
    create  rust-toolchain.toml
    create  BUILDING.md
    create  tests
    create  tests/rust
    create  tests/rust/lib_tests.rs
    create  tests/python
    create  tests/python/test_example.py
```

:::

```bash
.
├── Cargo.toml          # Rust設定
├── pyproject.toml      # Python設定 (uv管理)
├── src/                # Rustソース
│   └── lib.rs
├── mypkg/              # Pythonパッケージ
│   └── __init__.py
├── tests/              # テストコード
│   ├── python/         # pytest用
│   └── rust/           # cargo test用
└── docker-compose.yml  # 開発用コンテナ
```

### 3.3 ビルド編

```bash
cd <フォルダ名>
uv sync --group dev
uv run maturin develop
```

動作確認

```bash
uv run python
>> import <pkg名>
>> add(2,3)
>> 5

uv run pytest tests
```

## 4. ビルドを通すまで(Docker環境)

### 4.1 準備編

Git, Dockerは自身でご準備下さい。

:::details ubuntu

```bash
# update
sudo apt update
sudo apt install -y curl git build-essential

# uv install
curl -LsSf https://astral.sh/uv/install.sh | sh

# terminal再起動

# copier install
uv tool install copier
```

:::

:::details windows

```powershell
pipx install uv

uv tool install copier

```

:::

### 4.2 プロジェクト作成編

```bash
copier copy https://github.com/ctenopoma/python-rust-copier.git <フォルダ名>
```

```bash
.
├── Cargo.toml          # Rust設定
├── pyproject.toml      # Python設定 (uv管理)
├── src/                # Rustソース
│   └── lib.rs
├── mypkg/              # Pythonパッケージ
│   └── __init__.py
├── tests/              # テストコード
│   ├── python/         # pytest用
│   └── rust/           # cargo test用
└── docker-compose.yml  # 開発用コンテナ
```

### 4.3 ビルド編

```bash
cd <フォルダ名>
docker compose up -d
docker compose exec bash dev bash
uv sync --group dev
uv run maturin develop
```

動作確認

```bash
uv run python
>> import <pkg名>
>> add(2,3)
>> 5

uv run pytest tests
```

## 5. 開発手順

### 5.1 rustの開発

まず、`src/`フォルダにRustのコードを配置して、関数を開発します。
Pythonで実装すると処理に時間のかかる処理をRustの関数に落とし込むように設計しましょう。

まずPythonで実装してみて、処理時間を計測してから、Rust化する部分を狙い撃ちするのもよいと思います。
@[card](https://zenn.dev/ctenopoma/articles/python_dev_best_practice)

コミットする前に、clippyでリンターを通しましょう。

```bash
cargo fmt -- --check
cargo clippy -- -D warnings
```

### 5.2 pythonの開発

次に、ライブラリの根幹となるPythonサイドの実装です。
Rustで作った関数をインポートし、それをPythonのクラスや関数として配布します。
Pubな関数とする場合は、しっかりとDocstringを書いておきましょう。

コミットする前に、RuffとPyreflyでリンターを通しましょう。

```bash
uv run ruff check .
uv run pyrefly check .
```

### 5.3 テストコード

PythonとRustのテストコードを書きます。
最初に書いてしまうのもよいでしょう。

`tests/python`と`tests/rust`があります。
Pythonのテストはpytestで、rustのテストはcargo testで実行できます。

```bash
uv run pytest tests
cargo test
```

### 5.4 Documents

Sphinxを使って、Pubな関数に関するドキュメントを自動生成しましょう。
自作ライブラリの保守性の要になります。

```bash
uv run sphinx-build -b html docs build/docs
```

## 6. さいごに

Rust製のPythonライブラリの開発を容易にするために、テンプレートを作成しました。
AI駆動の開発との相性も良いと思いますので、ぜひ色んな場面で役立ててください。

@[card](https://github.com/ctenopoma/python-rust-copier)

**※ バグ・要望ありましたらコメントまでお願いいたします。**
