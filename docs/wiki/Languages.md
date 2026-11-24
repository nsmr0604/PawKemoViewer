# 表示言語と翻訳ファイル

設定 → 言語・翻訳ファイル → **言語 / Language** で日本語、英語、追加した言語を選べます。切り替えはすぐに反映されます。

## 言語ファイルを追加する

1. UTF-8 の JSON を `es.json` や `zh-Hant.json` の名前で保存します。
2. 設定 → 言語・翻訳ファイル → **言語ファイルを選ぶ** から JSON を選びます。ファイルはアプリ専用領域に取り込まれます。
3. **言語 / Language** から追加した言語を選びます。

**言語ファイルの詳細操作** では、言語コードと JSON の貼り付けでも追加できます。ファイル選択で同じコードがすでにアプリ専用領域にある場合は、既存ファイルを上書きせずに取り込みを中止します。

## アプリ専用領域と追加フォルダー

取り込んだファイルは設定から書き出し・削除できます。複数のファイルを別途管理する場合は、設定に表示される **追加の言語フォルダー** に置き、編集後に **言語を再読み込み** を押してください。

| 環境 | 追加の言語フォルダー |
|---|---|
| Windows・macOS・Linux | OS のドキュメントフォルダー内の `Pawchive/languages` |
| Android | アプリの `Android/data/com.nsmr0604.pawkemoviewer/files/Documents/Languages` |
| iOS・iPadOS | ファイル → このiPhone内／このiPad内 → PawKemoViewer → Languages |

Android で追加フォルダーをファイル管理アプリから開けない場合は、PawKemoViewer の **言語ファイルを選ぶ** または **追加フォルダーに保存** を使ってください。

同じ言語コードでは、同梱辞書にアプリ専用ファイル、追加フォルダーのファイルの順で上書きします。`ja.json` も差し替えられます。選択した言語に含まれない文言は日本語で表示します。

## JSON の書き方

`locale.name` に一覧の表示名を指定し、翻訳を 1 件以上追加します。キーは [日本語辞書](https://github.com/nsmr0604/PawKemoViewer/blob/main/src/locales/ja.json) と同じフラットなドット区切りで、値は空でない文字列にします。ファイルの上限は 1 MiB です。

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
