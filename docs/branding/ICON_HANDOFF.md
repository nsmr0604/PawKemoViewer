# PawKemoViewer アイコン統合引継ぎ

更新日: 2026-11-21
対象: Mobile Standard (light) / Mobile Dark / Desktop
このファイルをアイコン作業の唯一の引継ぎ資料とする。

## 1. ブランドと共通デザイン

- **Paw**: 現在の対象である Pawchive (`pawchive.pw`) の Web API に由来する。
  「paw + archive」という解釈はユーザーの考察で、公式語源は未確認。
- **Kemo**: Pawchive の派生元である Kemono (`kemono.cr`) へのリスペクト。
- **Viewer**: 投稿・画像を閲覧するアプリ。動画プレイヤーを示す再生マークは使用しない。
- 共通モチーフ: 狐耳娘、流れる髪、大きめの肉球、狐しっぽ。
- モバイルと PC は共通ブランドの別表現とし、シンボルの連続性を優先する。
- 採用する意匠と配色は、下記のマスター画像に準拠する。

## 2. 決定済みデザイン

### Mobile

| 項目 | Standard (light) | Dark |
|---|---|---|
| 採用配色 | ミント × シアン × ピンク | スレート × ブルー × ティール |
| 描画 | フラット・シンプルな狐耳娘シルエット | 同じシルエット |
| ブランド記号 | 大きめの肉球・狐しっぽ | 同左 |
| 扱い | テーマが light のときの代替アイコン | 既定 (primary) アイコン |

### Desktop

- **最終採用**: A1 Bright Cyan をベースに、狐しっぽの大きさを A2 程度に拡大。
- **配色**: 白髪 × Teal × Blue / Cyan × Blue。背景は装飾のないシンプルなグラデーション。
- **構図**: 白髪の狐耳娘、流れる長い髪、青いリボン、右側に大きく広がる白い狐しっぽ、
  右下に大きな肉球。
- **PC らしいリッチさ**: 毛束・狐耳の内毛・しっぽの毛流れ・自然な陰影を強調。
  背景の装飾は増やさない。
- **禁止要素**: 月、星、光点、再生マーク、文字、背景幾何学模様。

## 3. リポジトリ上のマスター画像

アイコン画像は以下の **3 枚のみ** を正としている。

| ファイル | サイズ | 用途 |
|---|---|---|
| `src-tauri/app-icons/pc.png` | 1024×1024 RGBA PNG | PC (desktop) アイコンの元画像 |
| `src-tauri/app-icons/dark.png` | 1254×1254 RGB PNG | モバイル既定アイコンの元画像 |
| `src-tauri/app-icons/light.png` | 1254×1254 RGB PNG | モバイル代替アイコンの元画像 |

- 提供された ZIP の PNG を原本のまま収録する。モバイル用 2 枚は ZIP 内のファイル名に
  1024 とあるが、実寸は 1254×1254。各プラットフォーム用のサイズへ原本から直接変換する。
- アプリ内ロゴもモバイルのマスター画像を使い、`object-fit: contain` で表示する。

- 旧 `assets/icons/*.svg` は「SVG は崩れるため PNG / BMP を使う」というユーザー指示で
  **削除済み**。SVG をリネームしただけの代理登録は禁止。
- Web 用の `public/` アイコン、`index.html` の icon link、旧 `scripts/make-icons.mjs`
  も削除済み。Tauri のネイティブアプリアイコンには不要
  (`index.html` 自体は WebView の入口のため維持)。
- `src-tauri/icons/` は **gitignore 済みの生成物**。リポジトリには置かない。

## 4. 組み込み実装 (完了)

- `scripts/generate-icons.mjs` が `npm run icons:generate` / `tauri:dev` /
  `tauri:android:dev` / `tauri:build` から呼ばれる。
  - PC (`icon.ico` / `icon.icns` / `icon.png` / StoreLogo 等) → `pc.png`
  - Android / iOS (`src-tauri/icons/android` / `ios`) → `dark.png`
- 各 workflow (tauri / android / ios) も `tauri * init`・`tauri build` の前に
  `npm run icons:generate` を実行する。
- モバイルの切替は `tauri-plugin-app-icon` + capability `app-icon:default`。
  `src/appIcon.ts` が light テーマ時のみ `set_icon('light')`、dark 時は `set_icon(null)`
  で既定 (dark) に戻す。
- Android: light 用 mipmap + `activity-alias` を Manifest に注入
  (`scripts/app-icon/generate-android.mjs`)。
- iOS: `tauri ios init` **後に** `npx tauri icon dark.png` を実行して既定アイコンを
  `gen/apple/Assets.xcassets/AppIcon.appiconset` へ直接書き込む (2026-11-22 修正)。
  `AppIconLight.appiconset` のみ生成し、`project.yml` にエイリアス設定を注入
  (`scripts/app-icon/generate-ios.mjs`)。既定は dark の `AppIcon.appiconset`。
  `tauri ios init` が作った pbxproj / Info.plist はパッチ前のままなので、
  **生成後に `xcodegen generate` を再実行**して反映する (2026-11-21 修正)。
- アプリ内左上のロゴも 🐾 テキストから `dark.png` / `light.png` の画像に変更し、
  テーマに合わせて表示を切り替える (`src/App.tsx` / `src/styles.css`)。

### 検証済み

- `npm run build` / `npm run icons:generate` / 3 ワークフローの YAML / Wiki 同期スクリプト: OK
- ハッシュ照合: `icon.ico` は pc.png 生成分と一致、Android `ic_launcher.png` は
  dark.png 生成分と一致。
- CI: 0.4.1 の Build Tauri / Android / iOS は success。
  iOS 代替アイコン修正後の IPA (`44911910546`) を解析し、
  `Info.plist` に `TauriAppIconAliases` / `CFBundleAlternateIcons` / `AppIconLight`、
  `Assets.car` に `AppIconLight` が含まれることを確認済み。

## 5. 未完了タスク

1. Android / iOS 実機でテーマ切替 → アイコンが反映され、ランチャーのエントリが
   1 つだけ残ることを確認する (未実施)。iOS は切替時に OS の確認ダイアログが出る。
2. 上記 CI (Build Tauri / Android / iOS) の完了結果を確認する。
3. 必要になったら iOS 配布用に署名証明書・Provisioning Profile を GitHub Secrets 化し、
   `tauri ios build --export-method` を追加する。

## 6. 資料整理履歴

- 旧 `docs/branding/icon-design-handoff.md` (モバイル中心) と
  旧 `docs/branding/desktop-icon-png-handoff.md` (PC 中心) を本ファイルへ統合して削除。
- 2026-11-21: 復元時に残っていた「SVG が main に登録済み」「PNG 未登録」
  「プラットフォーム組み込み未実施」という記述は、実際のリポジトリ状態に合わせて更新した。
- 技術的なビルド設定・CI の詳細は [`docs/BUILD.md`](../BUILD.md) も参照。
