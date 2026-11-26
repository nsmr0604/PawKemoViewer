# HTTP User-Agent、Referer、ヘッダー

外部へアクセスする経路ごとに、UA・Referer・Cookie・タイムアウトを定めます。

## User-Agent

設定 → 通信 → User-Agent で選びます。既定は **端末** です。

| 選択肢 | 値 | 内容 |
|---|---|---|
| 端末 | `device` | アプリを動かしている WebView の `navigator.userAgent` |
| アプリ | `app` | `PawKemoViewer/<version> (<OS>)` |
| Chrome | `desktop` | 固定の Windows Chrome 文字列 |

起動時と設定変更時に `set_http_user_agent(userAgent)` へ渡します。Rust 側には永続化されず、毎起動時にフロントから再設定します。

- 拒否条件: trim 後が空、512 バイト超、制御文字を含む。
- 対象: API、login、thumbnail、creator icon、pkv、一括保存の reqwest。
- 対象外: Android WebView / iOS WKWebView / デスクトップの外部ページウィンドウ。外部ページは
  各 WebView の標準 UA を使います（Linux だけは Rust 取得時に選択中 UA を付けます）。

Chrome モードの文字列:

```text
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36
```

## 経路別のヘッダーとタイムアウト

| 経路 | 主なヘッダー | connect / total |
|---|---|---:|
| API | `Accept: application/json,text/plain,*/*`、`Accept-Language`、pawchive の Referer / Origin、session Cookie | 個別指定なし / 既定 30 秒（1〜300 秒） |
| login | pawchive の Referer / Origin、form `application/x-www-form-urlencoded` | 個別指定なし / 設定値。session 検証にも適用 |
| 投稿 thumbnail | 選択中 UA のみ。Referer / Origin / Cookie なし | 個別指定なし / 15 秒 |
| creator icon | 選択中 UA、pawchive の Referer / Origin | 個別指定なし / 15 秒 |
| pkv | 選択中 UA、許可済み Referer、その Origin、Range を透過 | 10 秒 / 180 秒 |
| 一括保存 | 選択中 UA、Accept / Accept-Language / Sec-Fetch-*、画像または HTML の Referer | 10 秒 / 120 秒 |
| 外部ページ | 初回リクエストに Referer。WebView の標準ヘッダー。Linux は Rust 取得時に選択中 UA と Referer を付ける | OS 標準（Linux は 30 秒） |

設定の `timeoutSecs` は API と login にだけ使います。thumbnail、icon、pkv、一括保存、外部 WebView には適用されません。

## Cookie の範囲

- API: 呼び出しごとに `Cookie: session=<sessionKey>` を手動付与。
- login: リダイレクトを追わず、`Set-Cookie` から session を手動抽出。
- pkv: 上流へ Cookie を送らず、上流の `Set-Cookie` も破棄。
- 一括保存: 取得先が `pawchive.pw` / `*.pawchive.pw` のときだけ session を付与。
- 外部ページ: Android は `CookieManager`、iOS は WKWebView 標準の cookie jar、デスクトップは
  WebView 標準の cookie jar（Linux は Rust 取得分の Set-Cookie が入らない）。

session はフロントの localStorage に平文保存されます。Keychain / Keystore による暗号化は未実装です。

## pkv の URL と Referer

| OS | 形式 |
|---|---|
| Windows / Android | `http://pkv.localhost/file?u=<対象URL>&r=<Referer>` |
| macOS / iOS / Linux | `pkv://localhost/file?u=<対象URL>&r=<Referer>` |

- `u`: 取得先 URL
- `r`: Referer
- `f=1` の強制中継は現行ハンドラでは解釈しません

Referer として許可されるのは次のいずれかです。

1. `fanbox.cc` / `*.fanbox.cc`
2. `patreon.com` / `*.patreon.com`
3. 取得先と完全一致の hostname

未指定・不正時は、fanbox / pximg 系は `https://www.fanbox.cc/`、patreon 系は `https://www.patreon.com/`、その他は fanbox のトップを既定にします。Origin は Referer から導出します。

## pkv の取得先と HTTP 動作

- http / https のみ。
- `pawchive.pw` / `*.pawchive.pw`、localhost、`.local`、`.internal`、単一ラベル、IP リテラルを拒否。
- それ以外の外部ホストを広く許可します。フロントは投稿文脈のある URL を生成しますが、Rust はその文脈を検証しません。
- 実質 GET / POST。HEAD / PUT / DELETE なども GET として送信します。
- POST は `application/x-www-form-urlencoded` 固定で、multipart と Android custom protocol の POST body は利用できません。
- Range は透過しますが、実装は全量をメモリへ読みます。
- リダイレクトは最大 5 回。各ホップで宛先と DNS 解決 IP を検査します。
- 本文 64 MiB、connect 10 秒、total 180 秒、worker 4。

`text/html` は中継しません(415)。pkv のオリジンはアプリのローカル扱いになるため、
中継した HTML のスクリプトが Tauri コマンドへ到達し得るのを防ぎます。外部ページは
実オリジンの専用ウィンドウ(デスクトップ)またはネイティブビュー(モバイル)で開きます。

## SSRF 検査と残る制約

拒否対象は loopback、private、link-local、unspecified、broadcast、multicast、CGNAT、`192.0.0.0/24`、`198.18.0.0/15`、IPv6 unique-local / link-local、IPv4-mapped private です。DNS 結果が複数ある場合は、すべて public IP であることを要求します。

ただし、現在は次の制約が残ります。

- 検査した IP と実際の接続先 IP を固定しておらず、DNS rebinding の TOCTOU がある。
- TEST-NET など、拒否対象に含まれない予約アドレスがある。
- pkv は `text/html` を中継しない (415)。HTML の入力上限 8 MiB の経路は削除した。
- アプリの CSP は `tauri.conf.json` で明示している (`script-src 'self'`、`object-src 'none'` など)。
  外部ページは別ウィンドウ (実オリジン) で開くため、アプリの CSP の対象外。

## 外部ページと一括保存

- 外部ページは全 OS で実オリジンで開き、初回リクエストにだけ Referer を付ける。
  Android / iOS はプラグインのネイティブビュー、デスクトップは専用ウィンドウ。
- デスクトップの Referer 付与は Windows = WebView2 の `WebResourceRequested`、
  macOS = WKWebView の `loadRequest`、Linux = Referer 付き取得後の `load_html`。
- 外部ページから保存する画像は、そのページ自身を `imageReferer` にできる。
- 一括保存のミラー対策として、Accept / Accept-Language / Sec-Fetch-* を付与する。
- 一括保存の詳細は[一括画像保存](../features/image-download.md)を参照してください。
