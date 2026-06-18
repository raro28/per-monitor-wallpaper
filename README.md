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
    "DP-1":   { "file": "/path/to/left.jpg",  "mode": "zoom" },
    "HDMI-1": { "file": "/path/to/right.jpg", "mode": "zoom" }
  }
}
```

- `default` is painted on any monitor not listed in `monitors`.
- Keys are mutter connector names (`gnome-monitor-config list`, or `xrandr`-style names).
- `mode` is currently always `zoom` (cover/crop).

Any tool can write this file automatically; you can also edit it by hand.
