# Extension Release CLI

[English](README.md) | [日本語](README.ja.md)

A CLI tool to pack, upload, and publish Chrome extensions to the [Chrome Web Store](https://chromewebstore.google.com/) — all from your terminal.

```
exr release dist/
```

## Features

- `pack` — Zip your extension source directory into a versioned archive
- `upload` — Upload the zip to the Chrome Web Store via API
- `publish` — Publish the uploaded extension (supports staged rollout)
- `release` — Run pack → upload → publish in a single command
- `status` — Inspect the live status of your extension on the store
- Built-in env file support — powered by [dotenvx](https://github.com/dotenvx/dotenvx) (bundled, no separate install needed)

## Requirements

- Node.js >= 18

## Installation

```bash
npm install -g @yhotamos/extension-release-cli
```

## Setup

### 1. Google API Credentials

You need OAuth2 credentials to authenticate with the Chrome Web Store API.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project.
2. Enable the Chrome Web Store API.
3. Create OAuth 2.0 credentials (Desktop app type) and note your `CLIENT_ID` and `CLIENT_SECRET`.
4. Obtain a `REFRESH_TOKEN` using the OAuth2 playground or the Google auth flow.
   - Scopes required: `https://www.googleapis.com/auth/chromewebstore`

### 2. Chrome Web Store IDs

- `PUBLISHER_ID` — Your publisher ID, found in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) URL.
- `EXTENSION_ID` — The ID of your extension, found on the extension's dashboard page.

### 3. Environment File

Create a `.env` file in your project root:

```env
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
REFRESH_TOKEN=your_refresh_token
PUBLISHER_ID=your_publisher_id
EXTENSION_ID=your_extension_id
```

You can also use `.env.local` (takes precedence over `.env`), or environment-specific files like `.env.production` passed via `--env`:

```bash
exr release dist/ --env .env.production
```

> [!TIP]
> Since dotenvx is built in, you can encrypt your env files. This keeps plain-text secrets out of your repository and reduces the risk of AI coding agents (e.g., Claude Code or OpenAI Codex) accidentally reading your plain `.env` files.
>
> ```bash
> npx dotenvx encrypt -f .env.production
> ```
>
> This rewrites the file with encrypted values and generates a `.env.keys` file with the decryption key. The CLI reads `.env.keys` automatically. Add `.env.keys` to `.gitignore` and store the key in your CI secrets.

## Typical Workflow

```bash
# 1. Build your extension
npm run build

# 2. Release in one command
exr release dist/

# 3. Check the store status afterwards
exr status
```

Or step by step:

```bash
exr pack dist/
exr upload releases/my-extension-1.0.0.zip
exr publish
```

## Author

yhotta240 [https://github.com/yhotta240](https://github.com/yhotta240)
