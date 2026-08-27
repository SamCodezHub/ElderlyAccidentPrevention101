# Family Gateway — Web (Vercel)

A fully client-side, static web version of the caregiver app. It replaces the
Electron runtime (`main.js`, `preload.js`, `auth-store.js`) with a browser-only
implementation so it can be hosted for free on **Vercel** with zero servers.

There is **no backend** — accounts, sessions and profiles are stored in the
browser's `localStorage` (per-device, no cloud sync).

## Color scheme

The UI now uses the **`#96B7C8`** blue-gray theme. The accent, gradients,
glows and dark-theme highlights across `index`, `login`, `onboarding`,
`family-dashboard` and `dashboard` pages have been harmonized around that hex.

## Structure

```
web_app/
├── index.html            # Landing page
├── login.html            # Sign in / register / demo
├── onboarding.html       # Home setup wizard + AI sensor placement
├── family-dashboard.html # Caregiver monitoring + emergency dispatch
├── dashboard.html        # Moderator map view (moderator-role users)
├── sample-plan.js        # Sample floor plan + sensor analysis (browser UMD)
├── vercel.json           # Static hosting config
└── src/
    └── app.js            # Browser API reimplementing window.electronAPI
```

### How it works without Electron

Every page loads two small scripts before its inline logic:

```html
<script src="sample-plan.js"></script>
<script src="src/app.js"></script>
```

`src/app.js` exposes the exact same `window.electronAPI` surface the pages
already use (`login`, `register`, `demoLogin`, `session`, `profile`,
`updateProfile`, `signOut`, `sampleSchematic`, `analyzeSchematic`,
`completeOnboarding`) but implemented with `localStorage` + the Web Crypto API
instead of the Electron IPC bridge. Passwords are salted + SHA-256 hashed,
session tokens are stored in `sessionStorage`/`localStorage`.

## Deploy to Vercel

Option A — Vercel CLI:

```bash
cd web_app
npx vercel
```

Option B — GitHub + Vercel dashboard:

1. Push the `web_app` folder up (or the whole repo).
2. In Vercel, "Import Project" and point the **Root Directory** to `web_app`.
3. Framework preset: **Other** (static). Build command: none.
4. Deploy — the site is served from `vercel.json`.

### Demo account

Sign in with the one-tap **Quick Demo** button, or use:

| Field | Value |
|---|---|
| Email | `rehan.khan@hertzandhaven.app` |
| Password | `rehan@402` |

## Run locally

```bash
cd web_app
npx serve .        # or: python -m http.server 8000
```

(the Web Crypto API needs `http://localhost` or `https://`; it will not run via
`file://` in some browsers.)

## Run the API unit harness

```bash
node web_app/test/harness.js
```

Mocks `window`, `document`, `localStorage` and Web Crypto in Node and walks the
full demo-login → register → onboarding → update-profile flow.
