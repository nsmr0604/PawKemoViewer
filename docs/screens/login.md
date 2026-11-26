# ログイン

## 目的

pawchive.pw のアカウントでセッション Cookie を取得し、`sessionKey` として保存します。保存された値はお気に入り・フォロー同期・画像保存に使われます。

## 入口（ルート）

| ルート | `route.path` | クエリ | 備考 |
|---|---|---|---|
| `#/login` | `login` | — | レール下部 / モバイルヘッダーのアカウント欄（未ログイン時） |
| `#/login?next={path}` | `login` | `next` | お気に入りタブ、設定のアカウント欄から |

`next` の既定は `/` です。`activateAccount(next)` は `next` を `encodeURIComponent` して付けます。

## 画面構成

```
┌───────────────────────────────────────────────────────────┐
│                    div.page.login-page                    │
│      ┌───────────────────────────────────────────┐        │
│      │ div.login-card                            │        │
│      │   h1  🐾 login.title                      │        │
│      │   p.login-desc  login.desc                │        │
│      │   form.login-form                         │        │
│      │     label.field  ユーザー名 [input text]  │        │
│      │     label.field  パスワード [input pass]  │        │
│      │     button.login-submit  ログイン          │        │
│      │   div.login-result ok / login-error       │        │
│      │   div.login-status（ログイン済みのとき）   │        │
│      │   div.login-links  [新規登録]             │        │
│      │   div.login-version  PawKemoViewer v...   │        │
│      └───────────────────────────────────────────┘        │
└───────────────────────────────────────────────────────────┘
```

`AppShell` はログイン画面でレール / ボトムナビを出さず、モバイルでは `detail-bar`（戻る + ホーム）だけを出します。デスクトップは `content-naked` で下余白を詰めます。カードは `max-width: 420px`、`login-page` は上寄せ（`padding-top: 6vh`）です。

## 主な操作

| 操作 | 挙動 |
|---|---|
| ユーザー名 / パスワード入力 | ローカル state のみ（保存しない） |
| ログイン送信 | `submit`（後述） |
| 新規登録 | `https://pawchive.pw/account/register?location=/login` を新しいタブで開く |
| 戻る / ホーム | `detail-bar` の共通ボタン（`goBack` / `navigate("/")`） |

### `submit` の流れ

1. `username` か `password` が空なら `result = { ok: false, msg: login.errorEmpty }` で終了。
2. `busy = true`、`result = null`。
3. `invoke("login_request", { username, password, timeoutSecs: getSettings().timeoutSecs || null })`。
   Tauri v2 のため引数は camelCase（`timeoutSecs`）。認証と Cookie 検証は Rust 側です。
4. 応答 `{ ok, session?, error? }` で分岐する。

| 応答 | 処理 | 表示 |
|---|---|---|
| `ok && session` | `updateSettings({ sessionKey: session, accountId: username.trim() })` → `await syncFollowsWithAccount()` | `login.success` を出し、800ms 後に `navigate(next.startsWith("/") ? next : "/", true)` |
| `ok && !session` | Cookie を取得できなかったケース | `login.sessionError` を出し、2500ms 後に `/settings` へ replace |
| `!ok` | `j.error` があればそれを、無ければ `login.errorFail` | `login-error` の色で表示 |
| 例外 | `login.commError { msg }` | 同上 |

5. `finally` で `busy = false`、`password = ""`（state から消す。設定には保存しない）。

`updateSettings` は `sessionKey` が変わると `accountId` を一旦空にしてからパッチを当て、`clearApiCache()` を実行します。そのため `accountId: username.trim()` を同じパッチで渡しています。

成功時の `navigate` は `replace` なので、ログイン画面は履歴に残りません。

## 状態（読込中・空・エラー・部分成功）

| 状態 | 条件 | 表示 |
|---|---|---|
| 入力待ち | `busy === false` | ボタンは `login.submit` |
| 送信中 | `busy === true` | ボタンが `login.submitting` で disabled |
| 入力不足 | 空欄で送信 | `login.errorEmpty`（フォームは維持） |
| 認証失敗 | `ok === false` | サーバーのエラー文または `login.errorFail` |
| 通信失敗 | `invoke` が例外 | `login.commError`（例外メッセージ付き） |
| セッション未取得 | `ok && !session` | `login.sessionError` → 設定画面へ誘導 |
| 成功 | `ok && session` | `login.success` → `next` へ |
| ログイン済みで表示 | `sessionKey` が非空 | `div.login-status` に `login.sessionSet` |
| バージョン取得失敗 | `getVersion()` が失敗 | `appVersion = ""` でバージョン行を出さない |

成功・失敗のどちらも `result` は 1 つだけで、画面遷移まで残ります。パスワード欄は送信のたびに空になります。

## データ依存

| 用途 | 呼び出し |
|---|---|
| 認証 | `invoke("login_request", { username, password, timeoutSecs })`（`@tauri-apps/api/core`） |
| 設定の保存 | `updateSettings({ sessionKey, accountId })`、`getSettings().timeoutSecs` |
| フォロー同期 | `syncFollowsWithAccount()`（`src/follows.ts`） |
| アプリ版 | `getVersion()`（`@tauri-apps/api/app`）、`displayAppVersion()` |
| 遷移 | `navigate(path, true)`、`useRoute().query.get("next")` |

## 関連コード

- `src/pages/LoginPage.tsx`
- `src/account-action.ts` — ログイン / ログアウトの入口
- `src/follows.ts` — ログイン直後の同期
- `src/api.ts` — `getSettings` / `updateSettings`、`clearApiCache`
- `src-tauri/` の `login_request` コマンド（pawchive.pw `/account/login` への POST と Cookie 検証）

## 既知の制約

- パスワードは保存しませんが、`invoke` の引数として Rust 側へ渡ります。ログへの出力有無は Rust 実装側の確認が必要です（未確認）。
- 遅延遷移の `setTimeout` は保持・解除していません。800ms / 2500ms 以内に別画面へ移動しても、そのまま遷移が実行されます。
- 成功判定の前に `syncFollowsWithAccount()` を待つため、同期が失敗するとセッションは保存済みでも `login.commError` が表示されます。
- ログイン済みでもこの画面は開けます（自動リダイレクトなし）。`login.sessionSet` が出るだけです。
- 認証方式の変更（2 要素認証、CAPTCHA 等）には対応していません。フォームはユーザー名とパスワードの 2 項目だけです。
- レート制限や再試行間隔の制御はフロント側にありません。
