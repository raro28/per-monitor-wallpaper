#!/usr/bin/env bash
# Install the per-monitor-wallpaper@ekthor GNOME extension by symlinking (default) or
# copying dist/ (built from TypeScript) into the user extensions dir, then enabling it.
#   install.sh            symlink + enable
#   install.sh --copy     copy instead of symlink
#   install.sh --uninstall  disable + remove
set -euo pipefail

UUID="per-monitor-wallpaper@ekthor"
ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/dist"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

mode="symlink"
case "${1:-}" in
  --copy)      mode="copy" ;;
  --uninstall) mode="uninstall" ;;
  "")          ;;
  *) echo "usage: install.sh [--copy|--uninstall]" >&2; exit 1 ;;
esac

if [ "$mode" = "uninstall" ]; then
  gnome-extensions disable "$UUID" 2>/dev/null || true
  rm -rf -- "$DEST"
  echo "uninstalled $UUID"
  exit 0
fi

# Build dist/ from TypeScript before installing.
( cd "$ROOT" && npm ci && npm run build )

mkdir -p "$(dirname "$DEST")"
rm -rf -- "$DEST"
if [ "$mode" = "copy" ]; then
  cp -r "$SRC" "$DEST"
else
  ln -s "$SRC" "$DEST"
fi
echo "installed $UUID ($mode) -> $DEST"

gnome-extensions enable "$UUID" 2>/dev/null \
  && echo "enabled." \
  || echo "Could not enable yet. On Wayland, log out and back in, then run: gnome-extensions enable $UUID"
