import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { fileForConnector, defaultFile } from '../lib/config.js';
import type { ConfigSource } from './configSource.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

interface OvManager {
  mgr: Any;
  monitorIndex: number;
}

export class OverviewBackgrounds {
  private ovSignals: number[] = [];
  private ovMgrSignals = new Map<Any, number>();

  constructor(
    private readonly config: ConfigSource,
    private readonly makeBackground: (file: string | null) => Any | null,
  ) {}

  private managers(): OvManager[] {
    const out: OvManager[] = [];
    const o = (Main.overview as Any)?._overview;
    const controls = o?._controls ?? o?.controls;
    const views = controls?._workspacesDisplay?._workspacesViews;
    if (!views) return out;
    for (const view of views) {
      const workspaces =
        view._workspaces ??
        view._workspacesView?._workspaces ??
        (view._workspace ? [view._workspace] : null);
      if (!workspaces) continue;
      for (const ws of workspaces) {
        const bg = ws?._background;
        const mgr = bg?._bgManager;
        if (mgr?.backgroundActor) out.push({ mgr, monitorIndex: bg._monitorIndex });
      }
    }
    return out;
  }

  private override(mgr: Any, monitorIndex: number): void {
    const cfg = this.config.read();
    if (!cfg) return;
    const mm = (globalThis as Any).global.backend.get_monitor_manager();
    let file = defaultFile(cfg);
    for (const connector of Object.keys(cfg.monitors ?? {})) {
      if (mm.get_monitor_for_connector(connector) === monitorIndex) {
        file = fileForConnector(cfg, connector) ?? file;
        break;
      }
    }
    const background = this.makeBackground(file);
    if (background && mgr.backgroundActor) mgr.backgroundActor.content.background = background;
  }

  private apply(): void {
    for (const { mgr, monitorIndex } of this.managers()) {
      this.override(mgr, monitorIndex);
      if (!this.ovMgrSignals.has(mgr)) {
        const id = mgr.connect('changed', () => this.override(mgr, monitorIndex));
        this.ovMgrSignals.set(mgr, id);
      }
    }
  }

  connect(): void {
    for (const sig of ['showing', 'shown'])
      this.ovSignals.push((Main.overview as Any).connect(sig, () => this.apply()));
    this.ovSignals.push((Main.overview as Any).connect('hidden', () => this.clearManagers()));
  }

  private clearManagers(): void {
    for (const [mgr, id] of this.ovMgrSignals) {
      try {
        mgr.disconnect(id);
      } catch {
        /* destroyed */
      }
    }
    this.ovMgrSignals.clear();
  }

  disconnect(): void {
    for (const id of this.ovSignals) (Main.overview as Any).disconnect(id);
    this.ovSignals = [];
    this.clearManagers();
  }
}
