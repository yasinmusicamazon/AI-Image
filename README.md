# WP AI Image Publisher

A Windows-first (Mac-ready architecture) desktop app for analyzing WordPress
pages/posts and generating, processing, and publishing SEO-friendly AI
images to WordPress Media Library — with review, backup, and rollback
built in.

This repository currently implements **Phase 1**: the app shell, secure API
key storage, WordPress site connection testing, and page/post loading.
Phases 2–6 (AI page analysis, image generation, image processing/upload,
insertion + rollback, and bulk job queue) build directly on top of this
foundation — see [Roadmap](#roadmap) below.

## Architecture

```
wp-ai-image-publisher/
├── electron/                  # Main process (Node.js), compiled to CommonJS
│   ├── main.ts                 # App entry point, BrowserWindow creation
│   ├── preload.ts               # contextBridge — the ONLY surface exposed to the renderer
│   ├── types/index.ts           # Shared types + IPC channel name constants
│   ├── db/
│   │   ├── schema.sql            # SQLite schema (websites, content, jobs, api settings)
│   │   └── database.ts           # better-sqlite3 connection + schema init
│   ├── services/
│   │   ├── credentials.ts        # OS keychain (keytar) wrapper, safeStorage fallback
│   │   ├── wordpress.ts          # WP REST API: connection test + page/post loader
│   │   ├── openai.ts             # OpenAI key validation (image gen added in Phase 3)
│   │   └── gemini.ts             # Gemini key validation (image gen added in Phase 3)
│   └── ipc/handlers.ts          # All ipcMain.handle() wiring
├── src/                        # Renderer (React + TypeScript, built with Vite)
│   ├── main.tsx / App.tsx
│   ├── components/              # Sidebar, TopBar
│   ├── screens/                 # Dashboard, ApiSettings, WebsiteManager
│   └── lib/window-api.d.ts      # Ambient types for window.api (from preload)
├── scripts/                    # Small Node build/dev helper scripts
├── package.json
├── vite.config.ts
└── .env.example
```

### Why this structure

- **Electron main process** owns all Node.js access (filesystem, SQLite,
  keychain, outbound HTTP to WordPress/OpenAI/Gemini). The renderer never
  touches Node directly.
- **contextIsolation + sandbox are enabled**, and the renderer only ever
  calls the narrow, typed functions exposed in `preload.ts` via
  `window.api`. This means even if a compromised dependency got into the
  React bundle, it couldn't read files or secrets directly.
- **Secrets never touch SQLite or disk in plain text.** API keys and
  WordPress Application Passwords are stored via `keytar` (OS
  keychain — Windows Credential Manager / macOS Keychain / Linux Secret
  Service). SQLite only stores a random, non-secret reference key
  (`credential_key`) pointing at the keychain entry. If no OS keychain is
  available, a fallback store encrypts values with Electron's
  `safeStorage` (still OS-backed, e.g. DPAPI) before writing to disk —
  plaintext secrets are never written anywhere.
- **better-sqlite3** was chosen over a heavier ORM for a desktop app: it's
  synchronous (no async overhead for local file-backed queries), fast, and
  has zero runtime dependencies beyond its native binding.
- **Sharp** is included as a dependency now so Phase 4 (image
  resize/compress/convert) doesn't require a fresh native-module install
  later — native modules should be present when you first run
  `electron-builder install-app-deps`.

## Setup

### Prerequisites

- Node.js 20+ and npm
- Windows 10/11 (primary target) — macOS works for development too
- A WordPress site with [Application Passwords](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/)
  available (built into WordPress core since 5.6)

### Install

```bash
npm install
cp .env.example .env
```

No API keys go in `.env` — you'll enter your OpenAI key, Gemini key, and
WordPress site credentials directly in the app UI, and they're stored
securely in your OS keychain.

### Run in development

```bash
npm run dev
```

This starts the Vite dev server for the React UI and launches Electron
pointed at it, with hot reload for the renderer and a watch-compile for
the main process.

### Build

```bash
npm run build          # builds renderer (Vite) + main process (tsc)
npm run package:win    # produces a Windows NSIS installer in /release
npm run package:mac    # produces a macOS .dmg in /release (on a Mac, or with proper cross-build tooling)
```

## Using Phase 1

1. **API Settings** — paste your OpenAI and/or Gemini API key, click
   **Save**, then **Test** to confirm it's valid. Set your preferred
   models, default provider, timeout, retry count, and rate limit.
2. **Website Manager** — click **Add Website**, enter the site URL,
   WordPress username, and an Application Password (generate one under
   *WordPress Admin → Users → Profile → Application Passwords*).
3. Click **Test WordPress Connection**. The app checks, in order:
   REST API reachability → authentication → read permission on
   pages/posts → upload-media capability → edit-content capability. Each
   step is shown individually so you can see exactly what's failing if
   the connection isn't fully green.
4. Once connected, click **Load Pages/Posts** to pull all pages and posts
   from the site into the local SQLite database, ready for Phase 2's page
   analysis.
5. **Dashboard** shows live counts of connected sites, loaded content, and
   job queue status (the job queue itself is wired up starting Phase 6,
   but the table and counters already exist).

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | App shell, API Settings, Website Manager, WP connection test, page/post loading | Done |
| 2 | Content Manager (select pages/posts), AI Image Planner → structured JSON image plan | Done |
| 3 | Image generation via OpenAI/Gemini, prompt editing, Image Review screen | Done |
| 4 | Sharp-based resize/compress/convert/rename, watermark detection/flagging, WordPress Media upload | Done |
| 5 | Insert images into page/post content (Gutenberg block or HTML `<img>` fallback), featured image, backup + rollback | Done |
| 6 | Bulk job queue with pause/resume/retry, structured logs, prompt templates, global settings | Done |

## Honest limitations of this build

A few things are implemented pragmatically rather than perfectly, and you
should know about them before relying on this in production:

- **Watermark detection is an AI vision check, not pixel-level forensics.**
  It asks a vision-capable model "does this look watermarked/branded?" —
  effective for obvious stock-photo marks, logos, and stray text, but not a
  guarantee against subtle or invisible watermarking (e.g. SynthID). There
  is no watermark *removal* anywhere in this app, by design.
- **Image insertion placement is heuristic**, based on matching `<h2>`
  boundaries and a "FAQ" heading in the raw content — not true layout
  understanding. If a placement rule can't find a good spot, the app logs
  that and appends the image to the end rather than silently guessing
  wrong. "Manual only" placement always skips auto-insertion.
- **The job queue runs with concurrency 1** (one content item at a time)
  and keeps per-job planning parameters in memory. If the app restarts
  while jobs are still pending, those specific pending jobs will need to
  be re-created from Content Manager — completed/failed job history in the
  database is unaffected.
- **AI planning uses a separate text model** (`gpt-4.1-mini` for OpenAI,
  `gemini-2.5-flash` for Gemini) from whatever image model you've selected
  in API Settings, since image models generate pixels, not structured
  JSON reasoning.
- **Dry-run mode** blocks the final content-insertion write to a live
  page/post (and says so explicitly in the result message) — it does not
  block image generation or the WordPress Media Library upload, since
  uploading a file to the Media Library doesn't touch any published page.
  Turn it off in Global Settings when you're ready to actually publish.
- **Auto-approve / auto-upload / auto-insert** are chained in that order
  during the job queue's generation stage: a clean (non-watermarked) image
  is auto-processed+uploaded only if both "auto-approve" and "auto-upload
  after approval" are on, and then auto-inserted only if "auto-insert
  after upload" is also on. If you leave all three off (the default),
  nothing happens automatically — you review and click Approve / Insert
  yourself in Image Review, which is the safer default for a live site.
- **"Require manual approval before live update"** is currently advisory
  only — the three auto-* toggles above are what actually control automatic
  behavior. This setting doesn't add a second independent gate on top of
  them yet; toggling it alone won't change behavior. Left as a clearly
  labeled no-op rather than removed, since a future version will use it to
  add a confirmation dialog even when auto-insert is enabled.

## Original scope notes

## Adding a new AI provider later

The provider services (`electron/services/openai.ts`,
`electron/services/gemini.ts`) share a simple contract: a key-test function
today, and (from Phase 3) an image-generation function returning raw image
bytes plus any provider metadata. To add a new provider:

1. Create `electron/services/<provider>.ts` implementing the same shape.
2. Add the provider to the `AiProvider` union in `electron/types/index.ts`.
3. Add a credential key constant in `services/credentials.ts`.
4. Register save/test IPC branches in `ipc/handlers.ts` (they're already
   switch-like on `provider`, so this is a small addition).
5. Add the provider's key input + model selector to `ApiSettings.tsx`.

No other module needs to know about the new provider — the job queue
(Phase 6) and image generation flow (Phase 3) will be written against the
shared provider interface, not against OpenAI/Gemini by name.

## Security & compliance notes (see spec section 13)

- API keys and WordPress passwords: OS keychain only, never logged, never
  written in plain text.
- No watermark *removal* feature exists or is planned — only detection and
  flagging (added in Phase 4), consistent with using only generated, owned,
  or licensed images.
- Every content update will be preceded by a local backup of the original
  content, with a one-click rollback (Phase 5).
- Bulk actions against live WordPress content will require explicit
  confirmation and support a dry-run mode (Phase 6).
