import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { ConfigSource } from './runtime/configSource.js';
import { DesktopBackgrounds } from './runtime/desktopBackgrounds.js';
import { OverviewBackgrounds } from './runtime/overviewBackgrounds.js';
import { Debouncer } from './runtime/debouncer.js';
import { seedLoginBackground } from './runtime/loginSeed.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default class PerMonitorWallpaperExtension extends Extension {
  private config: ConfigSource | null = null;
  private desktop: DesktopBackgrounds | null = null;
  private overview: OverviewBackgrounds | null = null;
  private applyDebouncer: Debouncer | null = null;
  private layoutSig = 0;

  enable(): void {
    this.config = new ConfigSource();
    this.desktop = new DesktopBackgrounds(this.config);
    this.overview = new OverviewBackgrounds(this.config, (f, style) => this.desktop!.makeBackground(f, style));
    // Single shared debounce: both the config-file watch and monitors-changed coalesce
    // into one deferred apply (150 ms), matching 1.0.2's _scheduleApply.
    this.applyDebouncer = new Debouncer(() => this.desktop!.apply());

    this.config.watch(() => this.applyDebouncer!.schedule());
    seedLoginBackground(this.config);
    this.desktop.connectManagers();
    this.overview.connect();
    this.layoutSig = (Main.layoutManager as any).connect('monitors-changed', () => {
      this.desktop!.connectManagers();
      this.applyDebouncer!.schedule();
    });
    this.desktop.apply();
  }

  disable(): void {
    // Order matters: disconnect every signal + stop the watch/debounce BEFORE nulling the
    // modules below, so no `this.desktop!` lambda can fire after teardown.
    this.desktop?.bumpEpoch();
    if (this.layoutSig) {
      (Main.layoutManager as any).disconnect(this.layoutSig);
      this.layoutSig = 0;
    }
    this.applyDebouncer?.cancel();
    this.config?.stop();
    this.desktop?.disconnect();
    this.overview?.disconnect();
    // Re-seed with handlers off so the next enable()'s seed is a no-op (no login flicker).
    if (this.config) seedLoginBackground(this.config);
    this.config = null;
    this.desktop = null;
    this.overview = null;
    this.applyDebouncer = null;
  }
}
