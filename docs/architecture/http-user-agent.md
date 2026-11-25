# HTTP の User-Agent とヘッダー

外部へアクセスするときの UA・Referer・Cookie の方針です。
対象は Rust 側の HTTP (API / プロキシ / 一括保存) と、外部ページを表示するネイティブビューです。

## User-Agent の選択 (設定)

設定 → 接続 → **User-Agent** で 3 つから選べます (`settings.userAgentMode`)。

| 選択肢 | 値 | 内容 |
|---|---|---|
| 端末 (**既定**) | `device` | アプリを動かしている WebView の UA (`navigator.userAgent`) |
| アプリ | `app` | `PawKemoViewer/<version> (<OS>)` |
| Chrome | `desktop` | 固定の Windows Chrome 文字列 (旧来の既定値) |

- 起動時に `set_http_user_agent` で Rust へ渡し、以後のすべての HTTP に適用する
- 端末の UA が最も互換性が高い。pawchive の公開 API はアプリ独自 UA でも構わない
- ミラー (`n1`〜`n4.pawchive.pw`) は Cloudflare が UA・`Accept`・`Sec-Fetch-*` を見るため、
  アプリ UA では 403 になることがある (その場合は端末 UA を選ぶ)

## 経路ごとのヘッダー

| 経路 | UA | ヘッダー |
|---|---|---|
| **API** (`pawchive.pw/api/v1/…`) | 設定値 | `Accept: application/json,text/plain,*/*`<br>`Accept-Language: ja,en-US;q=0.9,en;q=0.8`<br>`Referer: https://pawchive.pw/`<br>`Origin: https://pawchive.pw`<br>`Cookie: session=<sessionKey>` (設定時)<br>`Accept-Encoding: gzip, br, deflate` |
| **ログイン** (`/account/login`) | 設定値 | `Referer: https://pawchive.pw/account/login`<br>`Origin: https://pawchive.pw`<br>POST は `application/x-www-form-urlencoded`<br>リダイレクトは追わない (Set-Cookie の取得) |
| **アイコン** (`pawchive.pw/icons/…`) | 設定値 | `Referer: https://pawchive.pw/`<br>`Origin: https://pawchive.pw` |
| **サムネイル** (`img.pawchive.pw/thumbnail/…`) | 設定値 | 追加ヘッダーなし |
| **pkv プロキシ** (外部画像・外部ページ) | 設定値 | `Referer`: クエリ指定 (許可ホストのみ) かホスト別既定<br>・`*.pawchive.pw` → `https://pawchive.pw/`<br>・`*.fanbox.cc` / `*.pximg.net` → `https://www.fanbox.cc/`<br>・`*.patreon.com` / `*.patreonusercontent.com` → `https://www.patreon.com/`<br>・その他 → `https://www.fanbox.cc/`<br>`Origin`: Referer の origin<br>`Range` は透過<br>Cookie は付けない |
| **一括保存** | 設定値 | `Accept-Language: ja,en-US;q=0.9,en;q=0.8`<br>画像: `Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8`<br>`Sec-Fetch-Dest: image` / `Mode: no-cors` / `Site: cross-site`<br>HTML: `Accept: text/html,application/xhtml+xml,…`<br>`Sec-Fetch-Dest: document` / `Mode: navigate` / `Site: cross-site`<br>`Upgrade-Insecure-Requests: 1`<br>`Referer`: 投稿 URL (外部ページ由来の画像はそのページ URL)<br>`Cookie: session=…` は `*.pawchive.pw` のみ |
| **外部ページのビュー** (Android / iOS) | OS 標準の WebView / WKWebView | 初回読み込み時だけ `Referer: <投稿ページ>`<br>Cookie は WebView の Cookie ジャー |

## 固定の Chrome 文字列 (`desktop` と Rust の既定値)

```
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36
```

## 安全上の決まり

- `session` Cookie は **pawchive のホストにだけ**付ける (`downloads.rs` の `session_cookie`)
- Referer を指定できるのは FANBOX / Patreon のページか、中継先と同じホストのページだけ
- 取得先は `host_is_public` で内部アドレス・名前解決先を検査し、リダイレクト先も再検査する
- UA は 512 文字以内・制御文字なしだけを受け付ける

## 実装の場所

- `src-tauri/src/lib.rs` — `current_user_agent` / `set_http_user_agent`、API・ログイン・アイコン・プロキシ
- `src-tauri/src/downloads.rs` — 一括保存のヘッダーと Cookie の範囲
- `src/http-user-agent.ts` — 設定値から UA を決めて Rust へ渡す
- `src-tauri/plugins/external-view/` — 外部ページのネイティブビュー
