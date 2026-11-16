import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { entryForConnector, normalizeDefault, type Config, type Entry } from '../lib/config.js';
import { modeToStyle } from '../lib/mode.js';
import { loadTexture } from './texture.js';
import type { ConfigSource } from './configSource.js';

// Shell-private members not in @girs public types.
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyBg = any;

export class DesktopBackgrounds {
  private mgrSignals: Array<[AnyBg, number]> = [];

  constructor(private readonly config: ConfigSource) {}

  private idxToEntry(cfg: Config): Record<number, Entry> {
    const mm = (globalThis as any).global.backend.get_monitor_manager();
    const out: Record<number, Entry> = {};
    for (const connector of Object.keys(cfg.monitors ?? {})) {
      const entry = entryForConnector(cfg, connector);
      if (!entry) continue;
      const idx = mm.get_monitor_for_connector(connector);
      if (idx >= 0) out[idx] = entry;
    }
    return out;
  }

  makeBackground(file: string | null, style: number = modeToStyle('zoom')): AnyBg | null {
    if (!file) return null;
    const gfile = Gio.File.new_for_path(file);
    if (!gfile.query_exists(null)) {
      log(`per-monitor-wallpaper: file not found, skipping: ${file}`);
      return null;
    }
    let texture;
    try {
      texture = loadTexture(gfile);
    } catch (e) {
      log(`per-monitor-wallpaper: ${e}`);
      return null;
    }
    const bg: AnyBg = new Meta.Background({ meta_display: (globalThis as any).global.display });
    // GNOME 51: set_texture(texture, style, colorState). colorState is left null, as the
    // shell itself does for images without embedded CICP (the common sRGB wallpaper case).
    bg.set_texture(texture, style, null);
    return bg;
  }

  apply(): void {
    const cfg = this.config.read();
    if (!cfg) return;
    const idxToEntry = this.idxToEntry(cfg);
    const def = normalizeDefault(cfg);
    for (const bg of (Main.layoutManager as AnyBg)._bgManagers)
      this.setBackground(bg, idxToEntry[bg._monitorIndex] ?? def);
  }

  private setBackground(bg: AnyBg, entry: Entry | null): void {
    if (!entry) return;
    const background = this.makeBackground(entry.file, modeToStyle(entry.mode));
    if (!background || !bg.backgroundActor) return;
    bg.backgroundActor.content.background = background;
    bg.backgroundActor.show();
  }

  connectManagers(): void {
    this.disconnect();
    for (const bg of (Main.layoutManager as AnyBg)._bgManagers) {
      const id = bg.connect('changed', () => this.apply());
      this.mgrSignals.push([bg, id]);
    }
  }

  disconnect(): void {
    for (const [bg, id] of this.mgrSignals) {
      try {
        bg.disconnect(id);
      } catch {
        /* manager already destroyed */
      }
    }
    this.mgrSignals = [];
  }
}
