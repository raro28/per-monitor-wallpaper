import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// GDesktopBackgroundStyle.ZOOM — verified by literal value on GNOME 50.2 (2026-06-13).
const ZOOM = 5;
const DEBOUNCE_MS = 150;

export default class PerMonitorWallpaperExtension extends Extension {
    enable() {
        this._configDir = GLib.build_filenamev(
            [GLib.get_user_config_dir(), 'per-monitor-wallpaper']);
        this._configPath = GLib.build_filenamev([this._configDir, 'config.json']);
        // Ensure the dir exists so the directory monitor works even before any writer runs.
        GLib.mkdir_with_parents(this._configDir, 0o755);

        this._mgrSignals = [];
        this._debounceId = 0;
        this._applyEpoch ??= 0; // monotonic across enable/disable so stale loads can't collide

        this._startWatch();
        this._seedLoginBackground();
        this._connectLayout();
        this._connectOverview();
        this._apply();
    }

    disable() {
        this._applyEpoch++; // invalidate any pending async background assignment
        if (this._debounceId) {
            GLib.source_remove(this._debounceId);
            this._debounceId = 0;
        }
        if (this._fileMonitor) {
            this._fileMonitor.cancel();
            this._fileMonitor = null;
        }
        if (this._layoutSig) {
            Main.layoutManager.disconnect(this._layoutSig);
            this._layoutSig = 0;
        }
        this._disconnectManagers();
        this._disconnectOverview();
        // Sync gsettings while handlers are off, so the next enable()'s seed is a
        // no-op (no gsettings write at login = no reload flicker).
        this._seedLoginBackground();
    }

    _readConfig() {
        try {
            const [ok, bytes] = GLib.file_get_contents(this._configPath);
            if (!ok)
                return null;
            return JSON.parse(new TextDecoder().decode(bytes));
        } catch (e) {
            console.error(e, 'per-monitor-wallpaper: cannot read/parse config');
            return null;
        }
    }

    // Point gsettings at config.default so the pre-enable login flash shows our
    // wallpaper, not the distro default. The get!==set guard keeps it a no-op when
    // already in sync — a needless write makes GNOME reload and clobber our override.
    _seedLoginBackground() {
        const cfg = this._readConfig();
        if (!cfg || !cfg.default)
            return;
        const gfile = Gio.File.new_for_path(cfg.default);
        if (!gfile.query_exists(null))
            return;
        const uri = gfile.get_uri();
        const settings = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
        for (const key of ['picture-uri', 'picture-uri-dark']) {
            if (settings.get_string(key) !== uri)
                settings.set_string(key, uri);
        }
    }

    // Map monitor index -> override file from the config's connector entries.
    _idxToFile(cfg) {
        const mm = global.backend.get_monitor_manager();
        const idxToFile = {};
        const monitors = cfg.monitors || {};
        for (const connector of Object.keys(monitors)) {
            const entry = monitors[connector];
            if (!entry || !entry.file)
                continue;
            const idx = mm.get_monitor_for_connector(connector);
            if (idx >= 0)
                idxToFile[idx] = entry.file;
        }
        return idxToFile;
    }

    // Build a Meta.Background for a file, or null if no file / missing on disk.
    _makeBackground(file) {
        if (!file)
            return null; // no override and no default -> leave it
        const gfile = Gio.File.new_for_path(file);
        if (!gfile.query_exists(null)) {
            log(`per-monitor-wallpaper: file not found, skipping: ${file}`);
            return null;
        }
        const background = new Meta.Background({meta_display: global.display});
        background.set_file(gfile, ZOOM);
        return background;
    }

    _apply() {
        const cfg = this._readConfig();
        if (!cfg)
            return; // missing/malformed -> leave current backgrounds

        const idxToFile = this._idxToFile(cfg);
        const epoch = ++this._applyEpoch;

        for (const bg of Main.layoutManager._bgManagers)
            this._setBackgroundWhenLoaded(bg, idxToFile[bg._monitorIndex] ?? cfg.default, epoch);
    }

    // Assign the override only once its texture has decoded, so the actor never
    // paints black during a cold load; the current (loaded) image stays up until
    // then. Mirrors GNOME's BackgroundManager, which swaps only after isLoaded.
    // Warm images assign synchronously (keeps the 'changed' re-assert flicker-free);
    // the epoch drops a slow load superseded by a newer _apply or by disable().
    _setBackgroundWhenLoaded(bg, file, epoch) {
        const background = this._makeBackground(file);
        if (!background)
            return;
        const assign = () => {
            if (epoch === this._applyEpoch && bg.backgroundActor)
                bg.backgroundActor.content.background = background;
        };
        const image = Meta.BackgroundImageCache.get_default().load(Gio.File.new_for_path(file));
        if (image.is_loaded()) {
            assign();
        } else {
            const id = image.connect('loaded', () => {
                image.disconnect(id);
                assign();
            });
        }
    }

    _scheduleApply() {
        if (this._debounceId)
            GLib.source_remove(this._debounceId);
        this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
            this._debounceId = 0;
            this._apply();
            return GLib.SOURCE_REMOVE;
        });
    }

    _connectManagers() {
        this._disconnectManagers();
        for (const bg of Main.layoutManager._bgManagers) {
            const id = bg.connect('changed', () => {
                // GNOME reloaded gsettings and clobbered content.background; re-assert
                // ours synchronously (no debounce) so it lands before a frame paints the
                // default. Direct content.background assignment emits no 'changed' — no loop.
                this._apply();
            });
            this._mgrSignals.push([bg, id]);
        }
    }

    _disconnectManagers() {
        for (const [bg, id] of this._mgrSignals) {
            try {
                bg.disconnect(id);
            } catch (e) {}
        }
        this._mgrSignals = [];
    }

    _connectLayout() {
        this._connectManagers();
        this._layoutSig = Main.layoutManager.connect('monitors-changed', () => {
            this._connectManagers(); // _bgManagers is a fresh array now
            this._scheduleApply();
        });
    }

    // --- Overview (Activities) backgrounds --------------------------------
    // The overview builds its own per-monitor Background.BackgroundManager actors
    // under Main.overview._overview._controls._workspacesDisplay._workspacesViews,
    // rebuilt on every open and loaded async from gsettings — so we override on
    // show and re-override on each manager's 'changed'. Verified on GNOME 50.2.

    _overviewBgManagers() {
        const out = [];
        const o = Main.overview?._overview;
        const controls = o?._controls ?? o?.controls;
        const views = controls?._workspacesDisplay?._workspacesViews;
        if (!views)
            return out;
        for (const view of views) {
            // Primary -> WorkspacesView (_workspaces). Secondary ->
            // SecondaryMonitorDisplay (_workspacesView._workspaces), or
            // ExtraWorkspaceView (_workspace) when workspaces-only-on-primary.
            const workspaces = view._workspaces
                ?? view._workspacesView?._workspaces
                ?? (view._workspace ? [view._workspace] : null);
            if (!workspaces)
                continue;
            for (const ws of workspaces) {
                const bg = ws?._background;
                const mgr = bg?._bgManager;
                if (mgr?.backgroundActor)
                    out.push({mgr, monitorIndex: bg._monitorIndex});
            }
        }
        return out;
    }

    _overrideManager(mgr, monitorIndex, cfg, idxToFile) {
        const background = this._makeBackground(idxToFile[monitorIndex] ?? cfg.default);
        if (background && mgr.backgroundActor)
            mgr.backgroundActor.content.background = background;
    }

    _applyOverview() {
        const cfg = this._readConfig();
        if (!cfg)
            return;
        const idxToFile = this._idxToFile(cfg);
        for (const {mgr, monitorIndex} of this._overviewBgManagers()) {
            this._overrideManager(mgr, monitorIndex, cfg, idxToFile);
            // Re-apply when this manager reloads from gsettings. A direct
            // content.background assignment emits no 'changed', so no apply loop.
            if (!this._ovMgrSignals.has(mgr)) {
                const id = mgr.connect('changed', () => {
                    const c = this._readConfig();
                    if (c)
                        this._overrideManager(mgr, monitorIndex, c, this._idxToFile(c));
                });
                this._ovMgrSignals.set(mgr, id);
            }
        }
    }

    _connectOverview() {
        this._ovMgrSignals = new Map();
        this._ovSignals = [];
        // Apply synchronously (no debounce) so the override lands in the same frame
        // the managers load, else the gsettings default paints briefly first. The
        // per-manager 'changed' handler is synchronous too, for the same reason.
        for (const sig of ['showing', 'shown'])
            this._ovSignals.push(Main.overview.connect(sig, () => this._applyOverview()));
        // Managers are destroyed on hide; drop our stale references.
        this._ovSignals.push(Main.overview.connect('hidden', () => this._clearOverviewManagers()));
    }

    _clearOverviewManagers() {
        for (const [mgr, id] of this._ovMgrSignals) {
            try {
                mgr.disconnect(id);
            } catch (e) {}
        }
        this._ovMgrSignals.clear();
    }

    _disconnectOverview() {
        for (const id of this._ovSignals ?? [])
            Main.overview.disconnect(id);
        this._ovSignals = [];
        this._clearOverviewManagers();
    }

    _startWatch() {
        // Monitor the directory (survives an atomic temp+mv rename of config.json).
        const dir = Gio.File.new_for_path(this._configDir);
        this._fileMonitor = dir.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
        this._fileMonitor.connect('changed', (_m, file, other, _event) => {
            const p = file ? file.get_path() : null;
            const op = other ? other.get_path() : null;
            if (p === this._configPath || op === this._configPath)
                this._scheduleApply();
        });
    }
}
