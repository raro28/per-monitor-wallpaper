# per-monitor-wallpaper@ekthor

A minimal GNOME Shell extension that paints each monitor its own wallpaper, read from
`~/.config/per-monitor-wallpaper/config.json`. It works where GNOME's `spanned` wallpaper
cannot tile (mixed-resolution / rotated monitors), and it is writer-agnostic — any tool, or
you by hand, can write the config.

## Install

```bash
./install.sh            # symlink src/ into the extensions dir + enable
./install.sh --copy     # copy instead of symlink
./install.sh --uninstall
```

On Wayland a newly-installed extension requires one logout/login before it loads; after
that, changes are live.

## Config

`~/.config/per-monitor-wallpaper/config.json`:

```json
{
  "default": "/path/to/wallpaper.jpg",
  "monitors": {
    "DP-1":   { "file": "/path/to/left.jpg"  },
    "HDMI-1": { "file": "/path/to/right.jpg" }
  }
}
```

- `default` is painted on any monitor not listed in `monitors`.
- Keys are mutter connector names (e.g. `DP-1`, `HDMI-1`, `eDP-1`).
- Images are always scaled `zoom` (cover/crop); scaling is not configurable.

Any tool can write this file automatically; you can also edit it by hand.
