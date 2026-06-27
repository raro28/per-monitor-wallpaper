# Extension Trim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the extension's bundled preferences GUI (now delivered by the standalone Mural app), leaving this repo as the reader-only extension, with no dead code.

**Architecture:** Delete `prefs.ts` + `prefs/*` + the prefs-only `lib/layout.ts` and `types/glycin.d.ts`; drop the `prefs.ts` esbuild entry and `prefs.js` packaging; remove lint globals that go unused; bump the extension version; update docs. The runtime (`extension.ts`, `runtime/*`) is not edited, so `dist/extension.js` is byte-identical before and after.

**Tech Stack:** TypeScript, esbuild (single ESM entry after trim), `@girs/gnome-shell`, eslint/typescript-eslint, `node --test`. Target host: Fedora 44, GNOME Shell 50.

## Global Constraints

- Companion spec: `docs/superpowers/specs/2026-06-27-extension-trim-design.md`.
- Runtime code is untouched: do **not** edit `src/extension.ts` or `src/runtime/*`. `dist/extension.js` sha256 must be identical before and after the trim.
- No dead code: every removed unit's references (build entries, lint globals, doc mentions) go with it.
- Do not rewrite historical records under `docs/superpowers/` (the v2.0.0 / v2.1.0 plans+specs); they are dated and stay.
- Commit only at the steps below (operator already authorized commits for this work). Conventional Commits.
- Branch: `refactor/trim-prefs` off `main`.

---

### Task 1: Branch + source/build trim

**Files:**
- Capture baseline: build `dist/extension.js` from current tree.
- Delete: `src/prefs.ts`, `src/prefs/arrangement.ts`, `src/prefs/configStore.ts`, `src/prefs/monitorModel.ts`, `src/prefs/monitorTile.ts`, `src/prefs/thumbnailCache.ts`, `src/lib/layout.ts`, `src/lib/layout.test.ts`, `src/types/glycin.d.ts` (then `rmdir src/types`).
- Modify: `package.json` (build script), `.github/workflows/release.yml` (packaging `cp`).

**Interfaces:**
- Consumes: nothing.
- Produces: a `dist/` containing only `extension.js` + `metadata.json`; an unchanged `extension.js` bundle.

- [ ] **Step 1: Branch**

```bash
cd /home/ekthor/Projects/per-monitor-wallpaper
git switch -c refactor/trim-prefs
```

- [ ] **Step 2: Capture the pre-trim runtime bundle hash**

```bash
npm ci
npm run build
sha256sum dist/extension.js | tee /tmp/extjs.pre.sha256
```
Expected: a sha256 line printed and saved (the baseline to compare against in Step 8).

- [ ] **Step 3: Delete the prefs source, the orphaned layout lib, and the glycin typings**

```bash
git rm src/prefs.ts \
       src/prefs/arrangement.ts src/prefs/configStore.ts src/prefs/monitorModel.ts \
       src/prefs/monitorTile.ts src/prefs/thumbnailCache.ts \
       src/lib/layout.ts src/lib/layout.test.ts \
       src/types/glycin.d.ts
rmdir src/types 2>/dev/null || true
```
Expected: 9 files staged for deletion; `src/prefs/` and `src/types/` gone.

- [ ] **Step 4: Drop `src/prefs.ts` from the build script**

In `package.json`, the `build` script changes from:

```
"build": "esbuild src/extension.ts src/prefs.ts --bundle --format=esm --outdir=dist '--external:gi://*' '--external:resource://*' && cp src/metadata.json dist/",
```
to:
```
"build": "esbuild src/extension.ts --bundle --format=esm --outdir=dist '--external:gi://*' '--external:resource://*' && cp src/metadata.json dist/",
```
(The `test` script is unchanged: `src/lib/*.test.ts` now globs only `config.test.ts` + `mode.test.ts`.)

- [ ] **Step 5: Drop `dist/prefs.js` from release packaging**

In `.github/workflows/release.yml`, the packaging line changes from:

```
          cp dist/extension.js dist/prefs.js dist/metadata.json LICENSE README.md "$STAGE/"
```
to:
```
          cp dist/extension.js dist/metadata.json LICENSE README.md "$STAGE/"
```

- [ ] **Step 6: Clean rebuild**

```bash
rm -rf dist
npm run build
ls dist
```
Expected: `dist` contains exactly `extension.js` and `metadata.json` (no `prefs.js`).

- [ ] **Step 7: Run the headless gates**

```bash
npm run check && npm run lint && npm test
```
Expected: `tsc` clean; eslint clean; tests pass (config + mode suites; the layout suite is gone). Note: lint may still pass here even with now-unused globals — those are removed in Task 2.

- [ ] **Step 8: Prove the runtime bundle is unchanged**

```bash
sha256sum dist/extension.js | tee /tmp/extjs.post.sha256
diff <(awk '{print $1}' /tmp/extjs.pre.sha256) <(awk '{print $1}' /tmp/extjs.post.sha256) \
  && echo "RUNTIME BUNDLE UNCHANGED" || echo "MISMATCH — investigate"
```
Expected: `RUNTIME BUNDLE UNCHANGED`. (If MISMATCH: a runtime file was edited or an import path changed — stop and investigate before continuing.)

- [ ] **Step 9: Commit**

```bash
# Stage explicitly — the deletions are already staged by `git rm` (Step 3);
# add only the two wiring edits. Do NOT `git add -A`: the spec+plan are
# untracked here and belong to the Task 3 docs commit.
git add package.json .github/workflows/release.yml
git commit -m "refactor: remove bundled preferences GUI; drop prefs.js entry + packaging

The editing GUI is now the standalone Mural app. Runtime (extension.js)
is byte-identical; only the prefs build/packaging is removed."
```
(No `(prefs)` scope: Task 3 removes `prefs` from the CLAUDE.md go-forward scope examples, so this commit stays consistent with that.)

---

### Task 2: Remove dead lint globals

**Files:**
- Modify: `eslint.config.js`.

**Interfaces:**
- Consumes: the trimmed source from Task 1.
- Produces: an eslint config whose declared GJS globals are exactly those used by surviving code.

- [ ] **Step 1: Reduce the globals to the used set**

In `eslint.config.js`, the `globals` block changes from:

```js
      globals: {
        // GJS ambient globals used by the runtime + prefs modules.
        log: 'readonly',
        logError: 'readonly',
        globalThis: 'readonly',
        TextDecoder: 'readonly',
        console: 'readonly',
      },
```
to:
```js
      globals: {
        // GJS ambient globals used by the runtime modules.
        log: 'readonly',
        globalThis: 'readonly',
      },
```
Rationale (verified on host): `log` and `globalThis` are used in `runtime/*`; `logError` and `console` are unused in surviving code; `TextDecoder` is covered by a file-local `declare const` in `runtime/configSource.ts`, making the global redundant.

- [ ] **Step 2: Verify lint + type-check still pass**

```bash
npm run lint && npm run check
```
Expected: both clean. (If `console`/`logError`/`TextDecoder` were actually referenced, lint would now flag `no-undef` — it must not.)

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "chore: drop unused GJS lint globals (logError, console, TextDecoder)"
```

---

### Task 3: Docs + version bump

**Files:**
- Modify: `src/metadata.json` (version), `README.md`, `CLAUDE.md`.

**Interfaces:**
- Consumes: the trimmed tree.
- Produces: docs that describe a reader-only extension; metadata `version: 4`.

- [ ] **Step 1: Bump the extension version**

In `src/metadata.json`, change `"version": 3` to `"version": 4`. (Integer release counter. `package.json` semver `2.0.0` is left for the release commit.)

- [ ] **Step 2: Update README — GUI pointer + fix the stale install note**

In `README.md`:

Replace the line:
```
Open the extension's preferences to pick a wallpaper and fit-mode per monitor on a to-scale arrangement.
```
with:
```
Use the **Mural** app to pick a wallpaper and fit-mode per monitor on a to-scale arrangement; it writes this config. You can also edit the file by hand, or have any tool write it.
```

And fix the stale install comment (install.sh symlinks `dist/`, not `src/`):
```
./install.sh            # symlink src/ into the extensions dir + enable
```
→
```
./install.sh            # build dist/ then symlink it into the extensions dir + enable
```
(Leave the trailing "Any tool can write this file automatically; you can also edit it by hand." line as-is — it remains accurate.)

- [ ] **Step 3: Update CLAUDE.md — exact edits**

Each before→after below quotes the current text verbatim (grep-verified on 2026-06-27). Make them in place (document-hygiene rule: current truth only, no "we said X now Y").

(i) Target-host line — drop GTK (reader-only extension has no GTK surface; GTK lives in Mural):
```
Target host: **Fedora 44, GNOME Shell 50.2, GTK 4.22**. `metadata.json` pins `shell-version`
```
→
```
Target host: **Fedora 44, GNOME Shell 50.2**. `metadata.json` pins `shell-version`
```

(ii) Node-testable lib line — drop `layout`:
```
- `src/lib/*` (`config`, `layout`, `mode`) is **pure and node-testable** — this is the only
```
→
```
- `src/lib/*` (`config`, `mode`) is **pure and node-testable** — this is the only
```

(iii) Live-session line — drop the prefs clause, singular verb:
```
- `src/runtime/*` (shell-side) and `src/prefs/*` (GTK GUI) require a **live GNOME 50 session**.
```
→
```
- `src/runtime/*` (shell-side) requires a **live GNOME 50 session**.
```

(iv) Architecture intro:
```
Two esbuild entry points, three code zones:
```
→
```
One esbuild entry point, two code zones:
```

(v) Remove the `src/prefs.ts` entry bullet entirely:
```
- `src/prefs.ts` — preferences entry; runs in a **separate** GTK4/Adwaita process.
```
→ (delete the line)

(vi) `src/lib/` bullet — "shared by both" is no longer true (only the runtime consumes it in-repo):
```
- `src/lib/` — pure, runtime-agnostic logic shared by both. Unit-tested. No `gi://` imports.
```
→
```
- `src/lib/` — pure, runtime-agnostic logic (`config`, `mode`). Unit-tested. No `gi://` imports.
```

(vii) Remove the `src/prefs/` zone bullet + glycin sentence entirely:
```
- `src/prefs/` — GTK GUI units (`arrangement`, `configStore`, `monitorModel`, `monitorTile`,
  `thumbnailCache`). `src/types/glycin.d.ts` is prefs-only.
```
→ (delete both lines)

(viii) GJS-globals sentence — match the trimmed `eslint.config.js`:
```
(`log`, `logError`, `console`, `TextDecoder`) are declared in `eslint.config.js`.
```
→
```
(`log`, `globalThis`) are declared in `eslint.config.js`.
```

(ix) Build-loop comment:
```
npm run build    # esbuild extension.ts + prefs.ts -> dist/ (ESM), copies metadata.json
```
→
```
npm run build    # esbuild extension.ts -> dist/ (ESM), copies metadata.json
```

(x) CI packaging artifacts:
```
packages `dist/{extension.js,prefs.js,metadata.json}` + `LICENSE` + `README.md` into a tarball
```
→
```
packages `dist/{extension.js,metadata.json}` + `LICENSE` + `README.md` into a tarball
```

(xi) Git commit-scope examples — `prefs` is no longer a code zone, so drop it as a go-forward scope:
```
  with a scope: `feat(prefs):`, `fix(prefs):`, `build(prefs):`, `release(vX.Y.Z):`.
```
→
```
  with a scope: `feat(runtime):`, `fix(runtime):`, `build:`, `release(vX.Y.Z):`.
```

- [ ] **Step 4: Verify no stale references remain**

```bash
grep -rn "prefs\|layout\|glycin\|Gly" --include='*.ts' --include='*.json' --include='*.yml' --include='*.sh' --include='*.md' . \
  | grep -vE 'node_modules|/docs/superpowers/(plans|specs)/2026-06-21|\.superpowers/' \
  | grep -vi 'layoutManager\|layoutSig'
```
Expected: no matches except the new spec/plan dated 2026-06-27 (which legitimately describe the removal). `layoutManager`/`layoutSig` in `extension.ts`/`runtime/*` are GNOME Shell API, not our removed `lib/layout` — excluded above.

- [ ] **Step 5: Re-run all gates**

```bash
npm run check && npm run lint && npm test && npm run build && ls dist
```
Expected: all green; `dist` = `extension.js` + `metadata.json`.

- [ ] **Step 6: Commit**

```bash
git add src/metadata.json README.md CLAUDE.md docs/superpowers/specs/2026-06-27-extension-trim-design.md docs/superpowers/plans/2026-06-27-extension-trim.md
git commit -m "docs: reader-only extension; bump metadata version 3->4; commit trim spec+plan"
```

---

### Task 4: Live swap — remove RPM, install local dev build, verify on host

This is the runtime verification the operator requested. RPM removal needs `sudo` → the operator runs it. Wayland needs one logout/login for the swap to load.

**Files:** none (host operations).

**Interfaces:**
- Consumes: the trimmed tree on `refactor/trim-prefs`.
- Produces: the local dev build loaded and painting; confirmation the runtime is unaffected and the prefs are gone.

- [ ] **Step 1: Operator removes the installed RPM**

The currently-installed package is `gnome-shell-extension-per-monitor-wallpaper-2.1.0-1.fc44.noarch` (system dir, includes `prefs.js`). In the Claude Code prompt, run interactively:

```
!sudo dnf remove -y gnome-shell-extension-per-monitor-wallpaper
```
Expected: the system `/usr/share/gnome-shell/extensions/per-monitor-wallpaper@ekthor/` directory is removed.

- [ ] **Step 2: Install the local dev build (user dir symlink to dist/)**

```bash
cd /home/ekthor/Projects/per-monitor-wallpaper
./install.sh
```
Expected: `installed per-monitor-wallpaper@ekthor (symlink) -> ~/.local/share/gnome-shell/extensions/...`; the symlink points at the repo's trimmed `dist/` (no `prefs.js`).

- [ ] **Step 3: Reload the session (Wayland)**

Log out and back in, then:
```bash
gnome-extensions enable per-monitor-wallpaper@ekthor
gnome-extensions info per-monitor-wallpaper@ekthor
```
Expected: state ENABLED; version 4.

- [ ] **Step 4: Verify runtime + prefs absence**

Observe on the live session:
- Each monitor paints its wallpaper per `~/.config/per-monitor-wallpaper/config.json` (runtime unchanged).
- Observe what `gnome-extensions prefs per-monitor-wallpaper@ekthor` does now that no `prefs.js` ships, and check the journal for any new error it raises:
```bash
journalctl --user -b 0 --no-pager | grep -i "per-monitor-wallpaper" | tail -20
```
Expected: backgrounds applied; record the actual `gnome-extensions prefs` result and any journal lines rather than assuming the outcome.

- [ ] **Step 5: Handoff**

Stop here. The operator verifies, then (their words) updates the spec and installs the RPM version. Do not merge `refactor/trim-prefs` or cut a release tag without explicit instruction.

---

## Self-Review

**Spec coverage:** §2 removed files → Task 1.3. §3 build/packaging → Task 1.4–1.5. §4 dead-code/lint → Task 2. §5 version 3→4 → Task 3.1. §6 docs (CLAUDE + README) → Task 3.2–3.3. §7 verification (gates, dist contents, sha256 unchanged, grep clean) → Tasks 1.6–1.8, 3.4–3.5; the optional install smoke is promoted to a required live swap per operator request → Task 4. No spec requirement is unmapped.

**Placeholder scan:** every code/edit step shows exact before→after text and exact commands with expected output. No TBD/TODO/"handle edge cases".

**Type consistency:** no new code or signatures introduced; only deletions and config/doc edits. The sha256 gate (Task 1.8) is the consistency check that nothing in the runtime path moved.
