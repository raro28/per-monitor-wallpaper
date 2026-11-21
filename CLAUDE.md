# Claude Code Instructions — per-monitor-wallpaper

## What this project is

A minimal **GNOME Shell extension** (`per-monitor-wallpaper@ekthor`) that paints each
monitor its own wallpaper, read from `~/.config/per-monitor-wallpaper/config.json`. It works
where GNOME's `spanned` wallpaper can't tile (mixed-resolution / rotated monitors).

The extension is a **reader**. The config is **writer-agnostic**: any tool, or the user by
hand, can write it — an automated script, or a standalone GUI editor. The JSON schema is the
interface between writers and the reader — see "Config contract".

Target host: **Fedora 45, GNOME Shell 51**. `metadata.json` pins `shell-version`
to `51`. (GNOME 51 removed `Meta.Background.set_file()`; backgrounds are built from a
Glycin-decoded `CoglTexture` via `set_texture()` — see `src/runtime/texture.ts`.)

## Chat format

These rules bind your replies and any document you write or edit, equally.

- Only hard verified facts. Analytically verify any claim before stating it.
- No assumptions, no hypotheticals. If one is unavoidable, mark it visibly as such.
- Verify against the code and a real run on this host — not prior knowledge or stale docs.
- No silent scope: report what you ran, what passed, and what you skipped.
- Not chatty. State facts directly — no narrative framing, preamble, or filler.
- Avoid antithesis prose ("not X, but Y"; "it isn't this, it's that"). State the fact once.

## Verify, don't assert — applied to this repo

"Verified" means reproduced on this host, not "the build passed". A green `tsc`/`eslint`/build
proves the bundle compiles; it proves **nothing** about runtime behavior.

- `src/lib/*` (`config`, `mode`) is **pure and node-testable** — this is the only
  code `npm test` covers. Changes here are verifiable headlessly.
- `src/runtime/*` (shell-side) requires a **live GNOME 51 session**.
  It cannot be unit-tested headless. To verify it, build, install, and observe in a real
  session — on Wayland that needs one logout/login (see "Install & runtime"). Say so when a
  change here is unverified rather than implying it was checked.

## Debugging login-time behavior

Facts established while fixing the v2.2.1 overview bug on GNOME Shell 50.2. The overview
signal names and private fields these rely on were confirmed identical on 51 by offline
shell-JS/typelib inspection (see "Porting to a new GNOME release"); the reproduction itself
was not re-run on 51. Each cost a wrong hypothesis.

- **Reproduce on the install path that fails.** `./install.sh` symlinks into
  `~/.local/share`; the RPM installs to `/usr/share`. `enable()` runs at a different point
  in shell startup for each, and login behavior differs. The v2.2.1 overview bug reproduced
  only from `/usr/share`, never from the symlink, across repeated reboots. To debug it,
  `sudo install` `dist/{extension.js,metadata.json}` into
  `/usr/share/gnome-shell/extensions/per-monitor-wallpaper@ekthor/` and remove the user
  symlink; `rpm -V` flags the overwritten files, `sudo dnf reinstall` restores them.
- **A correct background may not be displayed.** GNOME can open the session in the overview,
  with `global.window_group` hidden; what is on screen then is the overview's own background
  actors, filled from `gsettings picture-uri` (one image on every monitor). Check
  `global.window_group.visible` and `Main.overview.visible` before treating it as an assign
  or repaint bug.
- **`disable()` does not run at logout.** State it writes (the gsettings re-seed) does not
  happen on the way out; the next `enable()` sees whatever was left behind.
- **`Meta.Background` exposes no `file` through introspection** (reads back null). To tell
  our background from GNOME's, tag the object we construct and read the tag back.

## Porting to a new GNOME release

The private shell API this extension reads is not in `@girs`; re-check it on each major bump.
The surface to verify: `Main.layoutManager._bgManagers` plus each manager's
`_monitorIndex`/`backgroundActor`; `Main.overview._overview`, its `.visible` getter and the
`showing`/`shown`/`hidden` signal names; the overview manager path `_controls`/`.controls` →
`_workspacesDisplay._workspacesViews` → `_workspaces` (or `_workspacesView._workspaces`, or
`_workspace`) → `_background._bgManager`; `global.backend.get_monitor_manager()`; and the
`Meta.Background` texture API.

Verify without a live session of the new release: download (do not install) its `gnome-shell`
and `mutter` RPMs (`dnf download --releasever=<N>`), `rpm2cpio | cpio` them, extract the shell
JS with `objcopy -O binary --only-section=.gresource.shell_js_resources libshell-<N>.so`, load
that blob with `Gio.Resource`, and enumerate `/org/gnome/shell/ui/*.js`; inspect the native
`Meta` surface with `GIRepository` 3.0 against the extracted `Meta-<N>.typelib`.

GNOME 51 example (the v2.3.0 port): `Meta.Background.set_file()` and `Meta.BackgroundImageCache`
were removed; images decode in JS via Glycin to a `CoglTexture` passed to
`set_texture(texture, style, colorState)` — see `src/runtime/texture.ts`. The `gi://Gly` typelib
needs no explicit RPM `Requires`: the chain `gnome-shell → gtk → gdk-pixbuf2 → glycin-libs`
guarantees it, and `gi://Gly` resolves to `Gly-2` on Fedora 45.

## Architecture

One esbuild entry point, two code zones:

- `src/extension.ts` — runtime entry; runs **inside** gnome-shell.
- `src/lib/` — pure, runtime-agnostic logic (`config`, `mode`). Unit-tested. No `gi://` imports.
- `src/runtime/` — shell-side units (`configSource`, `debouncer`, `desktopBackgrounds`,
  `loginSeed`, `overviewBackgrounds`, `texture`). `texture.ts` decodes a file to a
  `CoglTexture` via Glycin (`gi://Gly`); its type shim is `src/gi-gly.d.ts`.

`gi://*` and `resource://*` imports are externalized at bundle time. GJS ambient globals
(`log`, `globalThis`) are declared in `eslint.config.js`.

## Build & verify loop

```bash
npm run check    # tsc --noEmit (excludes *.test.ts)
npm run lint     # eslint src
npm test         # esbuild src/lib/*.test.ts -> node --test
npm run build    # esbuild extension.ts -> dist/ (ESM), copies metadata.json
```

CI (`.github/workflows/release.yml`) runs check → lint → test → build on `v*` tags, then
packages `dist/{extension.js,metadata.json}` + `LICENSE` + `README.md` into a tarball
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
  with a scope: `feat(runtime):`, `fix(runtime):`, `build:`, `release(vX.Y.Z):`.
- Releases ship by pushing a `v*` tag (triggers the CI release job).
- Post-merge cleanup only for branches you created or were asked to merge: prove merged-ness
  (branch tip is an ancestor of `main`), then delete with `git branch -d` (safe), never `-D`.
