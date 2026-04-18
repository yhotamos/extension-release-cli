# Extension Release CLI

![NPM Version](https://img.shields.io/npm/v/%40yhotamos%2Fextension-release-cli)
![NPM Downloads](https://img.shields.io/npm/dm/%40yhotamos%2Fextension-release-cli)
![NPM License](https://img.shields.io/npm/l/%40yhotamos%2Fextension-release-cli)

[English](README.md) | [日本語](README.ja.md)

ターミナルからChrome拡張機能をパッケージ化し，アップロードして公開まで行えるCLIツールです．  
すべての作業が端末上で完結します．

```
# グローバルインストールしている場合
exr release dist/

# またはローカル環境から実行する場合
npx exr release dist/
```

## 特徴

- `pack` — 拡張機能のソースディレクトリをバージョン付きアーカイブに zip します
- `upload` — API を介して zip ファイルを Chrome Web Store にアップロードします
- `publish` — アップロードした拡張機能を公開（段階的ローリングアウト対応）
- `release` — pack → upload → publish を一括実行
- `status` — ストア上の拡張機能のライブステータスを確認
- `cancel` — 審査待ちの拡張機能申請の審査をキャンセルする
- `version` - manifest.json と package.json の拡張機能バージョンを同期して更新
- env ファイルの読み込みを内包 — [dotenvx](https://github.com/dotenvx/dotenvx) を内包（別途インストール不要）

## 要件

- Node.js ≥ 18

## インストール

```bash
# グローバルインストール
npm install -g @yhotamos/extension-release-cli

# またはローカルにインストール（開発依存）
npm install --save-dev @yhotamos/extension-release-cli
```

## 設定方法

### 1. Google API 認証情報

Chrome Web Store API に認証するための OAuth2 クレデンシャルが必要です．

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセスし，プロジェクトを作成します．
2. Chrome Web Store API を有効化します．
3. OAuth 2.0 クレデンシャル（デスクトップアプリタイプ）を作成し，`CLIENT_ID` と `CLIENT_SECRET` をメモします．
4. OAuth2 プレイグラウンドまたは Google 認証フローで `REFRESH_TOKEN` を取得します．
   - 必要なスコープ: `https://www.googleapis.com/auth/chromewebstore`

### 2. Chrome Web Store ID

- `PUBLISHER_ID` — 開発者ダッシュボードの URL に表示されるパブリッシャー ID
- `EXTENSION_ID` — 拡張機能のダッシュボードページに表示される拡張機能 ID

### 3. 環境ファイル

プロジェクトルートに `.env` ファイルを作成します：

```env
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
REFRESH_TOKEN=your_refresh_token
PUBLISHER_ID=your_publisher_id
EXTENSION_ID=your_extension_id
```

`.env.local`（`.env` より優先）や，`--env` で指定する環境別ファイル（`.env.production` など）も利用できます：

```bash
exr release dist/ --env .env.production
```

> [!TIP]
> dotenvx が内包されているため，env ファイルを暗号化して平文のシークレットをリポジトリに含めない運用もできます．また，Claude Code や OpenAI Codex などの AI コーディングエージェントが，平文の `.env` を誤って読み込むリスクも低減できます．
>
> ```bash
> npx dotenvx encrypt -f .env.production
> ```
>
> ファイルの値が暗号化され，復号キーを含む `.env.keys` が生成されます．CLI は実行時に `.env.keys` を自動で読み込みます．`.env.keys` は `.gitignore` に追加し，CI シークレットに登録して管理してください．

## 一般的なワークフロー

```bash
# 1. .env ファイルを作成（初回のみ）
# 必要な変数は上記「設定方法」を参照

# 2. 拡張機能をビルド
npm run build

# 3. コマンド一つでリリース（.env は自動で読み込まれます）
exr release dist/

# 4. ストアのステータス確認
exr status
```

または手順ごとに：

```bash
exr pack dist/
exr upload releases/my-extension-1.0.0.zip
exr publish
```

## 作者

yhotta240 [https://github.com/yhotta240](https://github.com/yhotta240)
