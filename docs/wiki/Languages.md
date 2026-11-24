# 表示言語と翻訳ファイル

設定 → 言語・翻訳ファイル → **言語 / Language** で日本語、英語、追加した言語を選べます。切り替えはすぐに反映されます。

![PC版の言語設定。追加フォルダーの場所と同期ボタン]({{PAGES_URL}}/assets/screens/ja-light-settings-desktop.png)

## 言語ファイルを追加する

1. UTF-8 の JSON を `es.json` や `zh-Hant.json` の名前で保存します。
2. 設定に表示される **追加の言語フォルダー** に JSON を置き、**言語フォルダーを同期** を押します。有効なファイルが一覧に反映されます。
3. **言語 / Language** から追加した言語を選びます。

## アプリ専用領域と追加フォルダー

**言語フォルダーを同期** は、フォルダーの有効な JSON を読み直します。選択中の言語にアプリ専用ファイルがある場合は、同名ファイルがフォルダーにないときに書き出します。

| 環境 | 追加の言語フォルダー |
|---|---|
| Windows・macOS・Linux | OS のドキュメントフォルダー内の `Pawchive/languages` |
| Android | アプリの `Android/data/com.nsmr0604.pawkemoviewer/files/Documents/Languages` |
| iOS・iPadOS | ファイル → このiPhone内／このiPad内 → PawKemoViewer → Languages |

Android では端末のファイル管理アプリから `Android/data` にアクセスできない場合があります。

同じ言語コードでは、同梱辞書にアプリ専用ファイル、追加フォルダーのファイルの順で上書きします。`ja.json` も差し替えられます。選択した言語に含まれない文言は日本語で表示します。

## JSON の書き方

`locale.name` に一覧の表示名を指定し、翻訳を 1 件以上追加します。キーは [日本語辞書]({{REPOSITORY_URL}}/blob/{{DEFAULT_BRANCH}}/src/locales/ja.json) と同じフラットなドット区切りで、値は空でない文字列にします。ファイルの上限は 1 MiB です。

```json
{
  "locale.name": "Español",
  "nav.home": "Inicio",
  "settings.backupOpenOther": "Abrir otra copia de seguridad",
  "settings.backupDefaultDesc": "Guarda la copia en Backups dentro de {{path}}."
}
```

`{{path}}` のような差し込み変数は日本語原文と同じ名前を使います。訳文の中で順番を入れ替えられます。キーの誤記、空文字、差し込み変数の不足・追加がある場合は、設定画面に表示される理由とキーを確認して修正してください。使用する言語だけの部分翻訳も取り込めます。

言語コードは英字 2〜3 文字で始まり、その後に英数字 2〜8 文字の区切りを最大 2 つ追加できます。例は `es`、`pt-BR`、`zh-Hant-TW` です。
