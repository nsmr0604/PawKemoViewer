# ライセンス

PawKemoViewer 0.6.0 が利用するソフトウェアの帰属とライセンスです。版番号は 2026-11-26 時点の lock / manifest スナップショットです。

## アプリケーション

PawKemoViewer: **MIT License**

Copyright (c) 2026 nsmr0604

全文はリポジトリの [LICENSE](../LICENSE) にあります。内部の `locale-picker` / `external-view` プラグインと `scripts/app-icon/` もこのプロジェクトの一部です。

## フロントエンド runtime

製品バンドルに含まれる直接依存:

| パッケージ | 版 | ライセンス | 用途 |
|---|---:|---|---|
| `@tauri-apps/api` | 2.12.5 | Apache-2.0 OR MIT | Tauri IPC |
| `i18next` | 27.2.2 | MIT | 多言語 |
| `react` | 18.3.1 | MIT | UI |
| `react-dom` | 18.3.1 | MIT | UI |
| `react-i18next` | 18.0.3 | MIT | React と i18next の接続 |

主な推移依存:

| パッケージ | 版 | ライセンス |
|---|---:|---|
| `html-parse-stringify` | 4.0.1 | MIT |
| `scheduler` | 0.23.2 | MIT |
| `loose-envify` | 1.4.0 | MIT |
| `js-tokens` | 4.0.0 | MIT |

## フロントエンド build / type

通常は製品バンドルに含まれません。

| パッケージ | 版 | ライセンス | 用途 |
|---|---:|---|---|
| `@tauri-apps/cli` | 2.12.4 | Apache-2.0 OR MIT | Tauri CLI |
| `@types/react` | 18.3.31 | MIT | 型定義 |
| `@types/react-dom` | 18.3.7 | MIT | 型定義 |
| `@vitejs/plugin-react` | 4.7.0 | MIT | Vite React プラグイン |
| `typescript` | 5.9.3 | Apache-2.0 | 型検査 |
| `vite` | 6.4.6 | MIT | バンドラ |

`esbuild 0.25.12` は Vite の推移的な build 依存です。`vite-plugin-pwa`、Workbox、service worker、webmanifest は依存していません。`sharp` は `allowScripts` に古い指定がありますが、dependency / lock / アイコン生成には含まれていません。

## Rust / Tauri

直接依存:

| パッケージ | 版 | ライセンス | 用途 |
|---|---:|---|---|
| `tauri` | 2.12.7 | Apache-2.0 OR MIT | ランタイム |
| `tauri-build` | 2.7.6 | Apache-2.0 OR MIT | ビルド |
| `tauri-plugin-log` | 2.10.2 | Apache-2.0 OR MIT | ログ |
| `tauri-plugin-app-icon` | 0.1.0 | MIT | ランチャーアイコン |
| `tauri-plugin-dialog` | 2.8.4 | Apache-2.0 OR MIT | desktop のファイルダイアログ |
| `log` | 0.4.35 | MIT OR Apache-2.0 | ログ facade |
| `serde` | 1.0.229 | MIT OR Apache-2.0 | シリアライズ |
| `serde_json` | 1.0.154 | MIT OR Apache-2.0 | JSON |
| `reqwest` | 0.12.28 | MIT OR Apache-2.0 | HTTP |
| `regex` | 1.13.2 | MIT OR Apache-2.0 | 正規表現 |
| `base64` | 0.22.1 | MIT OR Apache-2.0 | data URL |
| `tauri-plugin` | 2.7.4 | Apache-2.0 OR MIT | 内部プラグインの build dependency |

内部プラグイン `tauri-plugin-locale-picker 0.1.0` / `tauri-plugin-external-view 0.1.0` は root の MIT 対象です。各プラグインの Cargo.toml には `license` フィールドがありません。

### Rust lock スナショットの主なライセンス

ローカル `Cargo.lock` には 485 registry package が記録されています。SPDX 表記はそのまま残しています。

| ライセンス表記 | 件数 |
|---|---:|
| `MIT OR Apache-2.0` | 227 |
| `Apache-2.0 OR MIT` | 39 |
| `MIT` | 108 |
| `MIT/Apache-2.0` | 15 |
| `Zlib OR Apache-2.0 OR MIT` | 17 |
| `Unlicense OR MIT` | 14 |
| `Unicode-3.0` | 18 |
| `MPL-2.0` | 7 |

このほか、`ISC`、`BSD-3-Clause`、`CDLA-Permissive-2.0`、`Zlib`、`0BSD`、`BSL-1.0`、`CC0-1.0`、`MIT-0`、`Unlicense`、`LGPL-2.1-or-later` を含む選択肢付き expression があります。

複合条件の例:

- `ring 0.17.14`: `Apache-2.0 AND ISC`
- `dpi 0.1.2`: `Apache-2.0 AND MIT`
- `brotli 9.1.3`: `BSD-3-Clause AND MIT`
- `unicode-ident 1.0.27`: `(MIT OR Apache-2.0) AND Unicode-3.0`
- `rustls 0.23.46` / `hyper-rustls 0.27.10`: `Apache-2.0 OR ISC OR MIT`
- `webpki-roots 1.0.12`: `CDLA-Permissive-2.0`
- wasi / wit-bindgen: `Apache-2.0 WITH LLVM-exception` を含む expression

`reqwest` は direct の 0.12.28 と Tauri 推移の 0.13.5 が共存します。`base64` も複数版があります。

## npm lock 全体のライセンス

`package-lock.json` は 137 依存（root を除く）です。OS / CPU ごとの optional package を含みます。

| ライセンス | 件数 |
|---|---:|
| MIT | 115 |
| Apache-2.0 OR MIT | 13 |
| Apache-2.0 | 2 |
| ISC | 5 |
| BSD-3-Clause | 1 |
| CC-BY-4.0 | 1 |

MIT 以外の例:

- `baseline-browser-mapping`: Apache-2.0
- `source-map-js`: BSD-3-Clause
- `caniuse-lite`: CC-BY-4.0
- `semver` / `picocolors` / `lru-cache` / `yallist` / `electron-to-chromium`: ISC

## 取り込んだアイコン生成スクリプト

`scripts/app-icon/` は [SableClient/tauri-plugin-app-icon](https://github.com/SableClient/tauri-plugin-app-icon) の commit `e9b5b36aa163664f0a8c948ccc922febc6131827` から取り込んだものです。

- 上流スクリプト: MIT OR Apache-2.0
- MIT: Copyright (c) 2026 Sable Maintainers
- 同梱する許可本文: [LICENSE-MIT](../scripts/app-icon/LICENSE-MIT) / [LICENSE-APACHE](../scripts/app-icon/LICENSE-APACHE)
- 変更ファイルの notice: [scripts/app-icon/README.md](../scripts/app-icon/README.md)
- crates.io の `tauri-plugin-app-icon 0.1.0`: MIT only（Copyright Daniele Rolli）

スクリプトと crate は別の帰属対象です。上流スクリプトには Sable Maintainers の MIT / Apache-2.0 を適用し、root の nsmr0604 MIT とは別に全文を同梱しています。

## lock の外にあるソフトウェア

WebKitGTK / GTK / X11、Apple SDK、Android SDK / NDK、NSIS、Windows SDK などは npm / Cargo lock の外です。プラットフォームの配布物に含まれるネイティブライブラリの notice は、各ツールチェーンのライセンスも別途確認する必要があります。

アイコン画像の配布許可・著作権は依存ソフトウェアのライセンスとは別に確認する必要があります。

## 再現性と notice の扱い

- npm は `package-lock.json` を追跡しており、`npm ci` で再現できます。
- `src-tauri/Cargo.lock` は gitignore 対象で、clean checkout の CI は依存を都度解決します。Rust の一覧はスナップショットです。
- 完全な third-party notice / SBOM を CI で安定生成する仕組みは未整備です。
- バイナリを配布する場合は、SPDX expression だけでなく、採用するライセンス本文、copyright、NOTICE を各上流から確認して同梱してください。

## ライセンス本文へのリンク

- [MIT](https://spdx.org/licenses/MIT.html)
- [Apache-2.0](https://spdx.org/licenses/Apache-2.0.html)
- [ISC](https://spdx.org/licenses/ISC.html)
- [BSD-3-Clause](https://spdx.org/licenses/BSD-3-Clause.html)
- [MPL-2.0](https://spdx.org/licenses/MPL-2.0.html)
- [Unicode-3.0](https://spdx.org/licenses/Unicode-3.0.html)
- [CDLA-Permissive-2.0](https://spdx.org/licenses/CDLA-Permissive-2.0.html)
- [Zlib](https://spdx.org/licenses/Zlib.html)
- [CC-BY-4.0](https://spdx.org/licenses/CC-BY-4.0.html)

各ソフトウェアの copyright と NOTICE は、上流リポジトリのライセンスファイルを正とします。
