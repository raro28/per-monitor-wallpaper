import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { entryForConnector, normalizeDefault } from './lib/config.js';
import type { Mode } from './lib/mode.js';
import { ConfigStore } from './prefs/configStore.js';
import { MonitorModel } from './prefs/monitorModel.js';
import { ThumbnailCache } from './prefs/thumbnailCache.js';
import { MonitorTile } from './prefs/monitorTile.js';
import { ArrangementView } from './prefs/arrangement.js';

// GJS provides console globally; absent from lib ES2022, so declare what we use.
declare const console: { error(...args: unknown[]): void };

/* eslint-disable @typescript-eslint/no-explicit-any */
export default class PerMonitorWallpaperPrefs extends ExtensionPreferences {
  fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    const store = new ConfigStore();
    const model = new MonitorModel();
    const cache = new ThumbnailCache();

    const page = new Adw.PreferencesPage();
    const group = new Adw.PreferencesGroup({ title: 'Monitors' });

    // Open Display Settings (only if gnome-control-center is present).
    if (GLib.find_program_in_path('gnome-control-center')) {
      const btn = new Gtk.Button({ label: 'Open Display Settings' });
      btn.add_css_class('flat');
      btn.connect('clicked', () => {
        try {
          Gio.Subprocess.new(['gnome-control-center', 'display'], Gio.SubprocessFlags.NONE);
        } catch (e) {
          console.error(`per-monitor-wallpaper prefs: launch display settings failed: ${e}`);
        }
      });
      group.set_header_suffix(btn);
    }

    const arrangement = new ArrangementView();
    const arrRow = new Adw.PreferencesRow({ activatable: false, selectable: false });
    arrRow.set_child(arrangement);
    group.add(arrRow);

    // Default tile (monitor-agnostic; no reset).
    const defaultTile = new MonitorTile('', 'Default', cache, { resettable: false });
    const defaultRow = new Adw.ActionRow({ title: 'Default wallpaper' });
    defaultRow.add_suffix(defaultTile);
    group.add(defaultRow);

    page.add(group);
    window.add(page);

    const tiles = new Map<string, MonitorTile>();

    const rebuildTiles = (): void => {
      tiles.clear();
      for (const { connector, label } of model.connectors()) {
        const tile = new MonitorTile(connector, label, cache, { resettable: true });
        tile.onPick((c) => this.pick(window, (file) => { store.setMonitor(c, file, this.currentMode(store, c)); }));
        tile.onMode((c, m) => store.setMonitor(c, this.currentFile(store, c) ?? '', m));
        tile.onReset((c) => store.clearMonitor(c));
        tiles.set(connector, tile);
      }
    };

    const refresh = (): void => {
      const cfg = store.read();
      const def = normalizeDefault(cfg);
      defaultTile.setEntry(def?.file ?? null, def?.mode ?? 'zoom', false);
      defaultTile.onPick(() => this.pick(window, (file) => {
        const d = normalizeDefault(store.read());
        store.setDefault(file, d?.mode ?? 'zoom');
      }));
      defaultTile.onMode((_c, m) => { const d = normalizeDefault(store.read()); store.setDefault(d?.file ?? '', m); });
      for (const [connector, tile] of tiles) {
        const e = entryForConnector(cfg, connector);
        if (e) tile.setEntry(e.file, e.mode, false);
        else tile.setEntry(def?.file ?? null, def?.mode ?? 'zoom', true);
      }
      arrangement.render(model.arrange(560, 220), tiles);
    };

    const rebuildAndRefresh = (): void => { rebuildTiles(); refresh(); };
    rebuildAndRefresh();

    store.watch(refresh);
    model.onChanged(rebuildAndRefresh);
    window.connect('notify::is-active', () => { if (window.is_active) refresh(); });
    window.connect('close-request', () => { store.stop(); model.destroy(); return false; });

    return Promise.resolve();
  }

  private currentFile(store: ConfigStore, connector: string): string | null {
    return entryForConnector(store.read(), connector)?.file ?? null;
  }

  private currentMode(store: ConfigStore, connector: string): Mode {
    return entryForConnector(store.read(), connector)?.mode ?? 'zoom';
  }

  private pick(window: Adw.PreferencesWindow, onChosen: (file: string) => void): void {
    const dialog = new Gtk.FileDialog({ title: 'Choose an image' });
    const filter = new Gtk.FileFilter();
    filter.add_mime_type('image/*');
    filter.set_name('Images');
    const filters = new Gio.ListStore({ item_type: Gtk.FileFilter.$gtype });
    filters.append(filter);
    dialog.set_filters(filters);
    dialog.open(window, null, (_d: any, res: any) => {
      try {
        const file = dialog.open_finish(res);
        const path = file?.get_path();
        if (path) onChosen(path);
      } catch {
        /* user cancelled */
      }
    });
  }
}
