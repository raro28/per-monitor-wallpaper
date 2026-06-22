# Per-Monitor Wallpaper — preview preferences (1.1.0)

- Date: 2026-06-21
- Status: approved design, pre-implementation
- Target: `per-monitor-wallpaper@ekthor`, GNOME Shell 50, GTK4 / libadwaita
- Verified on host (GNOME Shell 50.2, GTK 4.22) via GObject introspection: every named
  GTK4/Gdk4/Gly/GlyGtk4/Adw API and every `GDesktopBackgroundStyle` value below exists;
  the Gdk connector names equal the mutter connectors (`DP-1`, `HDMI-1`);
  `gnome-control-center --list` includes the `display` panel; and the refresh signals
  (`Gio.ListModel::items-changed`, `Gdk.Monitor:geometry`/`::invalidate`,
  `Gtk.Window:is-active`) exist.

## Goal

Add a preferences UI that shows the monitor arrangement to scale — like the GNOME
Displays panel — with each monitor filled by its **current** wallpaper, and lets the
user pick an image and a fit-mode per monitor by clicking the tile. Today the
extension has no prefs; the config file is hand- or tool-written.

## Scope

In scope (1.1.0):
- `prefs.js`: geometry-faithful monitor arrangement, per-monitor wallpaper thumbnail,
  click-to-pick image (image-only file dialog), per-monitor fit-mode, a Default
  fallback tile, reset-to-default, and an Open-Display-Settings link.
- `extension.js`: **honor the `mode` field** (currently ignored — always `zoom`).
- Docs/packaging: README, metadata version, RPM spec.

Out of scope:
- The `spanned` fit-mode (incoherent for a per-monitor tool).
- Any awareness of external writers (e.g. wallpaper scripts) — see Contract.
- Changing how monitors are arranged (that is the Displays panel's job; we mirror it
  read-only).

## Contract (the only interface)

`~/.config/per-monitor-wallpaper/config.json` is the sole interface between the
extension, its prefs, and any external writer. The prefs and runtime are **generic**
and MUST NOT reference any external tool.

```jsonc
{
  "monitors": {
    "DP-1":   { "file": "/path/a.jpg", "mode": "zoom"   },
    "HDMI-1": { "file": "/path/b.jpg", "mode": "center" }
  },
  "default": "/path/c.jpg"                          // legacy bare string  → mode "zoom"
  // or: "default": { "file": "/path/c.jpg", "mode": "zoom" }
}
```

Rules:
- `mode ∈ { zoom, fill, fit, center }`. Absent/unknown → `zoom`.
- `default` is read as either a bare string (→ `{file, mode:"zoom"}`) or an object.
  The bare-string form stays valid forever (back-compat).
- Writers are equal citizens; **last write wins**. No writer preserves or defers to
  another. An external writer that rewrites an entry (e.g. as `{file, mode:"zoom"}`) is
  expected and accepted; so is the GUI overwriting an external pick.
- All writes are **read-modify-write merges** (never replace the whole document), so a
  writer never drops keys it doesn't manage.

Note: README/docs previously dropped `mode` as unused (commit 49d0126). 1.1.0 makes it
real and configurable, so the docs must be restored/updated.

## Fit-mode mapping

`mode` string → `GDesktopBackgroundStyle` value. `Meta.Background.set_file` already
takes this value — `extension.js` passes `5` today. Names and values verified on host.

| UI label | `mode`   | GDesktopBackgroundStyle | value | Behavior |
|----------|----------|-------------------------|-------|----------|
| Zoom     | `zoom`   | `ZOOM`                  | 5     | cover, crop overflow (current behavior) |
| Fill     | `fill`   | `STRETCHED`             | 4     | stretch to fill, distorts aspect        |
| Fit      | `fit`    | `SCALED`                | 3     | contain, letterbox, no crop             |
| Center   | `center` | `CENTERED`              | 2     | native size, centered, no scale         |

`SPANNED` (6), `WALLPAPER`/tiled (1), `NONE` (0) exist in the enum but are not offered
in the UI. Unknown strings fall back to `zoom`.

## UX

Mirrors the GNOME Displays monitor diagram, extended for wallpaper:

- **Arrangement**: each connected monitor drawn as a rounded tile, positioned and sized
  to its real logical geometry (rotation already reflected), numbered badge, label
  (manufacturer/model). A uniform scale-to-fit centers the set in the available area.
- **Tile fill**: the monitor's current wallpaper thumbnail (its `file`, or the Default
  if it has no entry), painted via `Gtk.Snapshot`.
- **Two click targets per tile**:
  - tile body → image-only `Gtk.FileDialog` for that connector.
  - corner **fit-mode chip** (`Gtk.MenuButton`, label e.g. `Zoom ▾`) → menu of
    Zoom/Fill/Fit/Center.
- **Reset** (`⟳`, shown on hover/focus) on tiles that have an explicit entry → deletes
  the entry so the monitor falls back to Default.
- **Default tile** below the arrangement: a neutral landscape thumbnail (monitor-
  agnostic — it is the shared fallback). Same two targets (pick image, fit-mode). No
  orientation filtering; the user may pick any image.
- Tiles, chips, and reset are **real focusable widgets** (keyboard navigation and
  accessible labels).
- **Open Display Settings** — a flat `Gtk.Button` in the arrangement group's
  `Adw.PreferencesGroup` `header-suffix` (the libadwaita idiom for a group-level
  secondary action), launching the GNOME Displays panel (`Gio.Subprocess` →
  `gnome-control-center display`) to change arrangement / rotation / resolution, which
  this tool mirrors read-only. Shown only when
  `GLib.find_program_in_path('gnome-control-center')` resolves.

States: explicit pick (thumbnail) · inheriting Default (thumbnail of Default + chip
reads from Default) · Default unset (placeholder "Choose…") · file missing on disk
(broken-image placeholder, entry retained).

## Architecture

### prefs.js (GTK4 / libadwaita, separate process)

- **ConfigStore** — read/modify/write `config.json` atomically (temp + `rename`),
  read-modify-write merge, tolerant parse (malformed → treat as empty, never throw),
  and a `Gio.FileMonitor` (watch the directory, `WATCH_MOVES`, like the runtime) so
  external writes refresh the UI live.
- **MonitorModel** — `Gdk.Display.get_default().get_monitors()`; per monitor:
  `get_connector()`, `get_geometry()` (logical, rotation-aware),
  `get_manufacturer()`/`get_model()` for the label. Computes the bounding box of all
  geometries, a uniform scale to fit the allocation, and a centering offset; each tile
  rect is its geometry × scale. `get_connector()` returns the same string the runtime
  keys on via `get_monitor_for_connector` — verified on host (both report `DP-1`,
  `HDMI-1`), so prefs keys and runtime lookups match. Re-renders when the display config
  changes: the monitors model `items-changed` (connect/disconnect), each monitor's
  `notify::geometry` (in-place resolution/rotation) and `invalidate` (removal), plus a
  re-read on the prefs window `is-active` as a guaranteed fallback when returning from
  Display Settings — so rotating or rearranging a monitor redraws the diagram without
  reopening prefs.
- **ArrangementView** — positions one `MonitorTile` per monitor at the scaled rect;
  hosts the `DefaultTile` beneath. A custom layout (or `Gtk.Fixed`) for absolute
  geometry placement.
- **MonitorTile / DefaultTile** — focusable widget painting the thumbnail via
  `Gtk.Snapshot` (`append_scaled_texture` + rounded clip); overlays a `GestureClick`
  (body → file dialog), a `Gtk.MenuButton` chip (fit-mode), and a reset `Gtk.Button`.
- **ThumbnailCache** — decode each distinct path once, keyed by path + mtime; scale per
  tile. Decode with **Glycin** (`gi://Gly` 2 + `gi://GlyGtk4` 2, present on host:
  `Gly.Loader`, `GlyGtk4.frame_get_texture`), which decodes out-of-process. Fallback:
  `Gdk.Texture.new_from_filename` (in-process), acceptable for local user-chosen images.

### extension.js (runtime — one behavioral change)

- `_makeBackground(file, mode)` maps `mode` → background-style value
  (zoom 5 / fill 4 / fit 3 / center 2; default `zoom`); replaces the hardcoded `ZOOM`
  literal.
- `_idxToFile` → `_idxToEntry`, returning `{file, mode}` per index.
- `_apply` and the overview path (`_applyOverview`, `_overrideManager`) pass
  `entry.mode`. `default` is normalized to `{file, mode}` wherever consumed — including
  the login seed `_seedLoginBackground`, which currently reads `default` as a path
  string. Back-compatible: missing mode → `zoom`; a bare-string `default` stays valid.
- No change needed for geometry tracking: the runtime already re-applies wallpapers on
  display changes via the existing `monitors-changed` handler (`_connectLayout`,
  `extension.js:187`). The prefs diagram refresh (above) is the only new follow.

### Data flow

Load: ConfigStore.read + MonitorModel → render tiles. Edit (pick / fit-mode / reset):
ConfigStore merge-write → (a) the running extension's existing file-watch repaints the
live desktop, (b) prefs re-renders the affected tile. External write → ConfigStore
file-watch → UI refresh. No IPC; no cross-references.

## Edge cases

- Monitor present but no entry → shows Default.
- Entry for a disconnected connector → not drawn; **retained** on write (reappears when
  the monitor returns).
- Missing image file → broken-image placeholder; entry retained.
- Default unset + monitor unpicked → "Choose…" placeholder.
- Decode failure → placeholder + log; never crash prefs.
- Malformed config → treated as empty; the file is only overwritten once the user makes
  an edit (which then writes valid JSON).
- `gnome-control-center` not on `PATH` → the Open Display Settings link is hidden.

## Versioning & packaging

- `src/metadata.json` `version` (integer, read by GNOME Shell): `1` → `2`.
- Release tag / RPM `Version`: `1.0.2` → `1.1.0`; bump the rpm-specs
  `gnome-shell-extension-per-monitor-wallpaper.spec` and its README row in the same
  change set; re-run the lint gate.
- README: restore the `mode` field in the config example and document the four fit
  modes + the new prefs UI; drop "scaling is not configurable".

## Testing

Pure logic, headless-testable (no display):
- config normalize: bare-string vs object `default`; missing/unknown `mode` → `zoom`.
- `mode` → background-style value mapping (zoom 5 / fill 4 / fit 3 / center 2).
- scale-to-fit geometry math (bounding box, uniform scale, centering, rotated tiles).
- connector → entry resolution (explicit / default / disconnected).

Manual (needs a live session): prefs render, click-to-pick, fit-mode change, reset, and
live repaint on the two-monitor setup (`DP-1` landscape, `HDMI-1` rotated portrait).

## Non-goals / future

- Rearranging monitors (Displays owns that).
- `spanned`/tiled modes.
- Per-image orientation filtering for Default.
