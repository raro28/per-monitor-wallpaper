# Extension Trim — Design

Date: 2026-06-27. Status: approved, pending implementation plan.
Companion plan: `docs/superpowers/plans/2026-06-27-extension-trim.md`.

## 1. Purpose & scope

Remove the extension's bundled preferences GUI. The editing GUI is being delivered as the
standalone **Mural** app (separate repo), which writes the same
`~/.config/per-monitor-wallpaper/config.json`. After this trim, this repo is the **reader
only**: `extension.ts` + `runtime/*` paint each monitor from the config; the config is written
externally (Mural, any other tool, or by hand).

The runtime is **unchanged by construction** — no file under `src/extension.ts` or
`src/runtime/*` is edited. Only the prefs code, its build/packaging wiring, dead lint config,
and docs change. Because no runtime file is edited and the build uses no esbuild code-splitting
(verified: no `--splitting` flag), the `dist/extension.js` bundle is expected to be
byte-identical before and after; the plan proves this with a sha256 comparison (plan Task 1,
Step 8) rather than asserting it.

**In scope:** delete prefs source, drop the `prefs.ts` build entry and `prefs.js` packaging,
remove lint globals that go unused, bump the extension version, update docs.

**Out of scope:** any runtime behavior change; Mural itself; re-releasing (the release tag is a
later, separate action).

## 2. What is removed

Source (7 files):
- `src/prefs.ts` — the `ExtensionPreferences` entry.
- `src/prefs/arrangement.ts`, `configStore.ts`, `monitorModel.ts`, `monitorTile.ts`,
  `thumbnailCache.ts` — the GUI units.
- `src/lib/layout.ts` + `src/lib/layout.test.ts` — `computeArrangement`; imported only by
  `prefs/arrangement` + `prefs/monitorModel`, never by the runtime. Becomes orphaned, so it
  goes. (It lives on in Mural.)
- `src/types/glycin.d.ts` — Glycin ambient typings; imported only by `prefs/thumbnailCache`.
  Empties `src/types/`, which is removed.

## 3. Build & packaging changes

- `package.json` build script: drop `src/prefs.ts` from the esbuild entry list. The test
  script globs `src/lib/*.test.ts` and needs no edit — deleting `layout.test.ts` is sufficient
  (config + mode tests remain).
- `.github/workflows/release.yml`: drop `dist/prefs.js` from the `cp` packaging line. The
  release tarball then carries `extension.js` + `metadata.json` + `LICENSE` + `README.md`.

## 4. Dead-code cleanup (no dead code)

`eslint.config.js` declares GJS globals `log, logError, globalThis, TextDecoder, console`.
Measured against surviving code on this host:
- `log` — used (`runtime/desktopBackgrounds.ts`). **Keep.**
- `globalThis` — used (`runtime/desktopBackgrounds.ts`, `runtime/overviewBackgrounds.ts`).
  **Keep.**
- `logError` — unused anywhere in surviving code. **Remove.**
- `console` — unused in surviving code (grep-verified). **Remove.**
- `TextDecoder` — used in `runtime/configSource.ts`, but that file declares its own file-local
  `declare const TextDecoder` (verified, lines 5–6); the global is redundant. **Remove.**

Removal of `logError`/`console`/`TextDecoder` is confirmed safe by the lint gate staying green
(plan Task 2, Step 2), not assumed. Result: globals reduce to `{ log, globalThis }`; the
comment "used by the runtime + prefs modules" becomes "used by the runtime modules."

No `package.json` dependency becomes dead: `@girs/gnome-shell` is still required by
`extension.ts`/`runtime/*`; esbuild, eslint, typescript-eslint, typescript all remain in use.
Glycin was never an npm dependency.

## 5. Versioning

`src/metadata.json` `version`: **3 → 4** (integer release counter; removing the prefs bundle is
a release-worthy packaging change). `package.json` semver (`2.0.0`) is left to the release
commit that cuts the tag — out of scope here.

## 6. Docs

- `CLAUDE.md`: eleven exact edits enumerated in the plan (Task 3, Step 3). In summary: rewrite
  Architecture from "two esbuild entry points, three code zones" to one entry point, two zones
  (`src/lib/` + `src/runtime/`); drop the `src/prefs.ts` entry line, the `src/prefs/` zone
  description + glycin-typings note, and the "shared by both" lib phrasing; drop `layout` from
  the node-testable line and the prefs clause from the live-session line; drop `GTK 4.22` from
  the target-host line (no GTK in a reader-only extension); update the build-loop comment, the
  CI-artifacts list, and the GJS-globals list to `(log, globalThis)`; and replace the `prefs`
  commit-scope examples with current-zone ones.
- `README.md`: replace the "Open the extension's preferences…" line with a pointer to **Mural**
  as the GUI editor (per operator decision), keeping the existing writer-agnostic framing
  (any tool or by hand).

## 7. Verification

Headless is sufficient here because the runtime is untouched:
- `npm run check`, `npm run lint`, `npm test` (config + mode tests), `npm run build` all green.
- `dist/` after build contains exactly `extension.js` + `metadata.json` (no `prefs.js`).
- **`dist/extension.js` sha256 must be identical before and after the trim** — the proof the
  runtime bundle did not change (captured/compared in plan Task 1, Steps 2 and 8).
- Repo-wide grep for `prefs`, `layout`, `glycin`, `Gly` finds no stale references outside the
  historical `docs/superpowers/` records and the gitignored `.superpowers/` working dir.

Historical plan/spec files under `docs/superpowers/` (the v2.0.0 port, the v2.1.0 prefs build)
are **not** rewritten — they are dated records of completed work, not living truth. This spec +
its plan are the record of the removal.

Beyond headless gates, the operator requested a live runtime swap (plan Task 4): remove the
installed RPM (`gnome-shell-extension-per-monitor-wallpaper-2.1.0-1.fc44.noarch`, verified
present), install this dev build via `./install.sh`, reload the session (the repo documents
that Wayland needs one logout/login), and observe — backgrounds paint, and record the actual
behavior of `gnome-extensions prefs` now that no `prefs.js` ships rather than predicting it.
The operator then updates the spec and installs the RPM version.
