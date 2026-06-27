# Claude Code Instructions — per-monitor-wallpaper

## What this project is

A minimal **GNOME Shell extension** (`per-monitor-wallpaper@ekthor`) that paints each
monitor its own wallpaper, read from `~/.config/per-monitor-wallpaper/config.json`. It works
where GNOME's `spanned` wallpaper can't tile (mixed-resolution / rotated monitors).

The extension is a **reader**. The config is **writer-agnostic**: any tool, or the user by
hand, can write it — an automated script, or a standalone GUI editor. The JSON schema is the
interface between writers and the reader — see "Config contract".

Target host: **Fedora 44, GNOME Shell 50.2, GTK 4.22**. `metadata.json` pins `shell-version`
to `50`.

## Chat format

These rules bind your replies and any document you write or edit, equally.

- Only hard verified facts. Analytically verify any claim before stating it.
- No assumptions, no hypotheticals. If one is unavoidable, mark it visibly as such.
- Verify against the code and a real run on this host — not prior knowledge or stale docs.
- No silent scope: report what you ran, what passed, and what you skipped.

## Verify, don't assert — applied to this repo

"Verified" means reproduced on this host, not "the build passed". A green `tsc`/`eslint`/build
proves the bundle compiles; it proves **nothing** about runtime behavior.

- `src/lib/*` (`config`, `layout`, `mode`) is **pure and node-testable** — this is the only
  code `npm test` covers. Changes here are verifiable headlessly.
- `src/runtime/*` (shell-side) and `src/prefs/*` (GTK GUI) require a **live GNOME 50 session**.
  They cannot be unit-tested headless. To verify them, build, install, and observe in a real
  session — on Wayland that needs one logout/login (see "Install & runtime"). Say so when a
  change to these is unverified rather than implying it was checked.

## Architecture

Two esbuild entry points, three code zones:

- `src/extension.ts` — runtime entry; runs **inside** gnome-shell.
- `src/prefs.ts` — preferences entry; runs in a **separate** GTK4/Adwaita process.
- `src/lib/` — pure, runtime-agnostic logic shared by both. Unit-tested. No `gi://` imports.
- `src/runtime/` — shell-side units (`configSource`, `debouncer`, `desktopBackgrounds`,
  `loginSeed`, `overviewBackgrounds`).
- `src/prefs/` — GTK GUI units (`arrangement`, `configStore`, `monitorModel`, `monitorTile`,
  `thumbnailCache`). `src/types/glycin.d.ts` is prefs-only.

`gi://*` and `resource://*` imports are externalized at bundle time. GJS ambient globals
(`log`, `logError`, `console`, `TextDecoder`) are declared in `eslint.config.js`.

## Build & verify loop

```bash
npm run check    # tsc --noEmit (excludes *.test.ts)
npm run lint     # eslint src
npm test         # esbuild src/lib/*.test.ts -> node --test
npm run build    # esbuild extension.ts + prefs.ts -> dist/ (ESM), copies metadata.json
```

CI (`.github/workflows/release.yml`) runs check → lint → test → build on `v*` tags, then
packages `dist/{extension.js,prefs.js,metadata.json}` + `LICENSE` + `README.md` into a tarball
release. Keep all four green before claiming done.

## Install & runtime

`./install.sh` builds `dist/` then symlinks it into the user extensions dir and enables it
(`--copy` to copy, `--uninstall` to remove). On Wayland a newly-installed extension requires
**one logout/login** before it loads; after that, config changes are live.

## Config contract (load-bearing — do not break)

`~/.config/per-monitor-wallpaper/config.json`:

```json
{ "default": "/path.jpg",
  "monitors": { "DP-1": { "file": "/left.jpg", "mode": "zoom" } } }
```

- Keys are **mutter connector names** (`DP-1`, `HDMI-1`, `eDP-1`).
- `mode`: `zoom` (cover/crop, default), `fill` (stretch), `fit` (letterbox), `center`.
- `default` paints any monitor not listed under `monitors`.

This schema is consumed by the extension and written by external tools. A schema change is a
breaking change across writers — treat it as one: update README, `src/lib/config`, and the
writers in lockstep, and bump deliberately.

## Document hygiene

Docs (this file, README, design notes) hold **current truth or explicitly-marked WIP only** —
never "we said X, now Y" deliberation history. When something changes, rewrite in place.

Specs and plans under `docs/superpowers/` **are committed** in this repo (they are version-
controlled deliverables here, unlike some sibling projects). Keep them current with reality.

## Working conventions

- **Operator decides scope.** No "while I'm here" additions — any feature, dependency, or
  refactor beyond the task goes in only when asked. Suggest with rationale + cost; never assume.
- **No embedded scripts:** do not embed one language inside another via heredocs or inline
  strings. Extract logic to a named file and invoke it. Single-line invocations are fine.
- **Propagate fixes:** when fixing a defect, grep the tree for the same pattern. Local
  correctness is not global correctness — and a fix in `lib/` may need mirroring in a writer.
- **Style:** terse and factual in code, comments, and commits. Match the surrounding file's
  brevity and idiom. Keep edits minimal.

## Environment

An **`rtk` hook** rewrites shell commands. When you need raw, unfiltered output (a valid
applyable diff, exact `ls`/`find` results), run it via `rtk proxy <cmd>`.

## Git

- Commit or push only when explicitly asked.
- Default branch `main`; feature work on `feat/*` branches. Commits use Conventional Commits
  with a scope: `feat(prefs):`, `fix(prefs):`, `build(prefs):`, `release(vX.Y.Z):`.
- Releases ship by pushing a `v*` tag (triggers the CI release job).
- Post-merge cleanup only for branches you created or were asked to merge: prove merged-ness
  (branch tip is an ancestor of `main`), then delete with `git branch -d` (safe), never `-D`.
