# Building the Windows Installer via GitHub (no Windows machine needed)

This repo includes `.github/workflows/build-windows.yml`, which builds the
Windows `.exe` installer automatically on GitHub's servers every time you
push code. You never need to run `npm run package:win` yourself.

## One-time setup

### 1. Create a GitHub repository

- Go to https://github.com/new
- Name it (e.g. `wp-ai-image-publisher`)
- Leave it **empty** (no README/gitignore/license) since you already have those
- Click **Create repository**

### 2. Push this project to it

From inside the unzipped project folder:

```bash
git init
git add .
git commit -m "Initial commit: Phase 1"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

Replace `<your-username>/<your-repo>` with the URL GitHub showed you after
creating the repo.

## Getting the .exe

As soon as you push to `main`, GitHub automatically starts the build. To
watch it and grab the file:

1. Go to your repo on GitHub → the **Actions** tab.
2. Click the most recent run ("Build Windows Installer").
3. Wait for it to finish (a few minutes — first run is slower since it
   installs and rebuilds native modules).
4. Scroll to the **Artifacts** section at the bottom of the run page and
   download **WP-AI-Image-Publisher-Windows-Installer** — it's a zip
   containing the `.exe`.

That artifact download requires you to be logged into GitHub. If you want
a public download link you can share with anyone (no login required), use
the release method below instead.

## Getting a public, shareable download link (recommended for real use)

Push a version tag instead of just a commit:

```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers the same build, but also publishes the `.exe` to your repo's
**Releases** page (`https://github.com/<your-username>/<your-repo>/releases`).
Anyone with that link can download and double-click the `.exe` directly —
no GitHub account needed, even on a private... actually note: if your repo
is **private**, Releases are only visible to people with repo access. Make
the repo **public** if you want a truly public download link, or add
collaborators if you want to keep it private but share with specific people.

Each time you're ready to ship an update, bump the version and push a new tag:

```bash
git tag v0.1.1
git push origin v0.1.1
```

## What to expect when you run the installer

- Windows SmartScreen will likely show **"Windows protected your PC"** the
  first time, because the app isn't code-signed (that requires a paid
  certificate). Click **More info → Run anyway**. This is normal for
  unsigned indie/internal apps and not a sign of a broken build.
- The NSIS installer lets you choose an install directory (configured via
  `allowToChangeInstallationDirectory` in `package.json`).

## If the build fails

Click into the failed step in the Actions log — the two most likely causes:

- **Type errors**: the workflow runs `tsc --noEmit` before packaging, so
  a broken change will fail fast with a clear file/line reference.
- **Native module rebuild issues** (better-sqlite3, keytar, sharp): these
  are rebuilt automatically for Windows by `electron-builder
  install-app-deps` (wired into `postinstall`). This step runs on GitHub's
  own Windows runner, so it works the same way every time regardless of
  what OS you're developing on locally.
