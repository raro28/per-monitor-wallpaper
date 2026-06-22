import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { parseConfig, type Config } from '../lib/config.js';

const DEBOUNCE_MS = 150;

// GJS exposes TextDecoder globally; absent from lib ES2022, so declare its minimal interface.
declare const TextDecoder: new (encoding?: string) => { decode(input?: Uint8Array): string };

export class ConfigSource {
  private readonly configDir: string;
  private readonly configPath: string;
  private monitor: Gio.FileMonitor | null = null;
  private debounceId = 0;

  constructor() {
    this.configDir = GLib.build_filenamev([GLib.get_user_config_dir(), 'per-monitor-wallpaper']);
    this.configPath = GLib.build_filenamev([this.configDir, 'config.json']);
    GLib.mkdir_with_parents(this.configDir, 0o755);
  }

  read(): Config | null {
    try {
      const [ok, bytes] = GLib.file_get_contents(this.configPath);
      if (!ok) return null;
      return parseConfig(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
  }

  watch(onChange: () => void): void {
    const dir = Gio.File.new_for_path(this.configDir);
    this.monitor = dir.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
    this.monitor.connect('changed', (_m, file, other) => {
      const p = file ? file.get_path() : null;
      const op = other ? other.get_path() : null;
      if (p === this.configPath || op === this.configPath) this.schedule(onChange);
    });
  }

  private schedule(onChange: () => void): void {
    if (this.debounceId) GLib.source_remove(this.debounceId);
    this.debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
      this.debounceId = 0;
      onChange();
      return GLib.SOURCE_REMOVE;
    });
  }

  stop(): void {
    if (this.debounceId) {
      GLib.source_remove(this.debounceId);
      this.debounceId = 0;
    }
    if (this.monitor) {
      this.monitor.cancel();
      this.monitor = null;
    }
  }
}
