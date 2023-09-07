---
title: "Windows11でCmakeをコマンドプロンプトからインストール"
emoji: "💨"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["cmake", "Tech", "scip"]
published: true
---

# 1.目的

サーバ上にある開発環境を構築する際に、ソフトウェアのインストールを自動化するには自分でビルドする必要があった。
Cmakeがなんぞやは知らないけれど、とりあえずインストールできればヨシっ！ってことで始めて行きます。

## 1.1 調査した環境
OS: Windows 11
Cmake:3.27.4

実は以下のサイトに書いてあるのは内緒。
英語より日本語がいいでしょ？
https://silentinstallhq.com/cmake-silent-install-how-to-guide/

# 2 インストール開始

## 2.1 Cmakeのダウンロード

さっそくCmakeのソースファイルをダウンロード。
web上のファイルをCmdでダウンロードするには、以下のコマンドを実行。
何かしら権限を求められるかもしれないので、一応管理者権限で実行。


```Cmd: Command Prompt
> bitsadmin /transfer ＜ジョブ名＞ ＜URL＞ ＜保存先ファイル名＞
```

ちなみにPower Shellでやる場合は以下らしい。

```PS:PowerShell
> Invoke-WebRequest -Uri ＜URL＞ -OutFile ＜保存先ファイル名＞
```

話をCmdに戻します。
Cmakeをインストールする場合は、以下のパラメータで実行します。
保存先は適当に読み替えてください。
最後をフォルダじゃなくてファイル名.msiにすることを忘れずに。

> **＜ジョブ名＞**=任意の文字列(例 download)
> **＜URL＞**=https://github.com/Kitware/CMake/releases/download/v3.27.4/cmake-3.27.4-windows-x86_64.msi
> **＜保存先ファイル名＞**= 例 c:\download\

``` Cmd: Command Prompt
> bitsadmin /transfer download https://github.com/Kitware/CMake/releases/download/v3.27.4/cmake-3.27.4-windows-x86_64.msi c:\download\cmake-3.27.4-windows-x86_64.msi
```

## 2.2 .msiのサイレントインストール

msiexecを使ってインストール。
Cmakeをmsiexecでインストールしている人を見つけれなかったので、とりあえずやってみる。

``` Cmd: Command Prompt
# 保存先フォルダに移動
> cd ＜保存先フォルダ＞

# msiexecでのインストール
> msiExec.exe /i cmake-3.27.4-windows-x86_64.msi /qn
```

何もでないけど、インストールはできたみたい。

## 2.3 設定

サイレントインストールだと、オプション何もつけれてなくて、パスも通ってない。
サイレントインストールするときに、オプションの入力をすると思われるが見つけられず断念。

あとからパスを通しておきます。
環境構築の場面でしか使わないので、以下で実行。

```Cmd: Command Prompt
> set PATH=%PATH%;C:\Program Files\CMake\bin

#　バージョン確認
> cmake --version
cmake version 3.27.4
```

ふむふむ 3.27.4ですと。ええやん。

# 3.余談

すでに目的は達成しているわけですが、Cmakeソフトウェアをビルドしてみる。
参考は以下のページ。Macでやってはりますが、まあいけるでしょ。

https://zenn.dev/ohtaman/articles/advent2022_use_scip

(追記)
windowsの人はcmakeで完結できるみたい。
https://scipopt.org/doc-7.0.1/html/CMAKE.php


git のサイレントインストールは以下を参考。
目的のソフトをインストールするまでの道のりが長い。。
https://silentinstallhq.com/git-silent-install-how-to-guide/#google_vignette

```Cmd: Command Prompt
> bitsadmin /transfer download https://github.com/git-for-windows/git/releases/download/v2.42.0.windows.2/Git-2.42.0.2-64-bit.exe c:\download\Git-2.42.0.2-64-bit.exe
> Git-2.42.0.2-64-bit.exe /VERYSILENT /NORESTART
> set PATH=%PATH%;C:\Program Files\Git\bin
```

適当に打ち込んだコマンド備忘録

```Cmd: Command Prompt
# soplexのダウンロード
> git clone https://github.com/scipopt/soplex.git
> cd soplex

# soplex/src/soplex/ratrecpn.hppの一部にコンパイルエラーが出るので修正
# 184行目のdenom.str()が原因なのでコメントアウト。ただのdebug printのようですしモーマンタイ。
# 例にもれず自動化するために、仰々しくも下記のbatを実行。
> code_editer.bat <保存先>/soplex/src/soplex

# soplex build
> cmake -Bbuild -H.
> cmake --build build --config Release

# soplexのパスを通す
> set set SOPLEX_DIR=<保存先>\soplex\build\

# scipのダウンロード
> cd ../
> git clone https://github.com/scipopt/scip.git

# scip build
> cmake -Bbuild -H. -DAUTOBUILD=ON
> cmake --build build --config Release

# MS VS Build Toolsのインストール
> bitsadmin /transfer download  https://aka.ms/vs/17/release/vs_BuildTools.exe c:\download\vs_BuildTools.exe
> cd c:\download\vs_BuildTools.exe
> .\vs_BuildTools.exe --layout .\vs_BuildTools
> .\vs_setup.exe --nocache --wait --noUpdateInstaller --noWeb --allWorkloads --includeRecommended --includeOptional --quiet --norestart

```

```BAT: code_editer.bat
@echo off
setlocal

set BEFORE_STRING= SPxOut::debug(&input, "LCM = {}\n", denom.str())
set AFTER_STRING= // SPxOut::debug(&input, "LCM = {}\n", denom.str())


set INPUT_FILE=%1\ratrecon.hpp
set RESAVE_INPUT_FILE=ratrecon.hpp
set OUTPUT_FILE=%1\out_ratrecon.hpp
echo %OUTPUT_FILE%

if exist %OUTPUT_FILE% del %OUTPUT_FILE%

setlocal enabledelayedexpansion
for /f "delims=" %%a in (%INPUT_FILE%) do (
set line=%%a
echo !line:%BEFORE_STRING%=%AFTER_STRING%!>>%OUTPUT_FILE%
)

del %INPUT_FILE%
rename %OUTPUT_FILE% %RESAVE_INPUT_FILE%

endlocal
```

# 4. おわり

お疲れさまでした。
これでビルド完成です。

pyscipoptを使う人は、SCIPOPTDIRのパスを、<保存先>\scip\scip\buildに通しておいてください。
きれいなインストール方法とは思いませんが、動くのでヨシっ！