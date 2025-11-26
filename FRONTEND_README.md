# Lemon Mini App Sample

This sample demonstrates a minimal React + TypeScript app that shows how to interact with the Lemon Cash Mini App SDK.

Files added:

- `src/MiniApp.tsx` — sample component demonstrating `authenticate`, `isWebView`, `deposit`, `callSmartContract`, and deeplink usage.
- `src/api.ts` — mock backend helpers (`getNonceFromBackend`, `verifySignatureOnBackend`) for local testing.

Quick start (Windows PowerShell):

```powershell
# 1. Install dependencies
npm install

# 2. Run dev server
npm run dev

# 3. Open the displayed local URL in a browser.
```

Notes:

- The project uses `@lemoncash/mini-app-sdk` in examples. Replace the placeholder version in `package.json` with the real package/version when available.
- For a production integration, implement proper backend endpoints for nonce generation and SIWE verification (see Lemon Cash docs).
- Deeplinks (examples):
  - `lemoncash://app/mini-apps/detail/:mini-app-id`
  - `lemoncash://app/mini-apps/webview/:mini-app-id`

If you want, I can:

- Update `package.json` to use `@vitejs/plugin-react` and add a working plugin setup.
- Implement a tiny Express backend in this workspace to serve `/api/auth/nonce` and `/api/auth/verify` endpoints.
- Commit changes to git and run `npm install` for you.
