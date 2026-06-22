import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { ConfigSource } from './runtime/configSource.js';
import { DesktopBackgrounds } from './runtime/desktopBackgrounds.js';
import { OverviewBackgrounds } from './runtime/overviewBackgrounds.js';
import { seedLoginBackground } from './runtime/loginSeed.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default class PerMonitorWallpaperExtension extends Extension {
  private config: ConfigSource | null = null;
  private desktop: DesktopBackgrounds | null = null;
  private overview: OverviewBackgrounds | null = null;
  private layoutSig = 0;

  enable(): void {
    this.config = new ConfigSource();
    this.desktop = new DesktopBackgrounds(this.config);
    this.overview = new OverviewBackgrounds(this.config, (f) => this.desktop!.makeBackground(f));

    this.config.watch(() => this.desktop!.apply());
    seedLoginBackground(this.config);
    this.desktop.connectManagers();
    this.overview.connect();
    this.layoutSig = (Main.layoutManager as any).connect('monitors-changed', () => {
      this.desktop!.connectManagers();
      this.desktop!.apply();
    });
    this.desktop.apply();
  }

  disable(): void {
    // Order matters: disconnect every signal + stop the watch BEFORE nulling the
    // modules below, so no `this.desktop!` lambda can fire after teardown.
    this.desktop?.bumpEpoch();
    if (this.layoutSig) {
      (Main.layoutManager as any).disconnect(this.layoutSig);
      this.layoutSig = 0;
    }
    this.config?.stop();
    this.desktop?.disconnect();
    this.overview?.disconnect();
    // Re-seed with handlers off so the next enable()'s seed is a no-op (no login flicker).
    if (this.config) seedLoginBackground(this.config);
    this.config = null;
    this.desktop = null;
    this.overview = null;
  }
}
