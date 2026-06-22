import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gsk from 'gi://Gsk';
import Graphene from 'gi://Graphene';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { normalizeMode, type Mode } from '../lib/mode.js';
import type { ThumbnailCache } from './thumbnailCache.js';

const MODES: Mode[] = ['zoom', 'fill', 'fit', 'center'];
const LABELS: Record<Mode, string> = { zoom: 'Zoom', fill: 'Fill', fit: 'Fit', center: 'Center' };

// Childless leaf painter: draws the (optional) texture with a rounded clip via
// Gtk.Snapshot. No children -> no manual size-allocate needed.
const ThumbnailArea = GObject.registerClass(
  { GTypeName: 'PmwThumbnailArea' },
  class extends Gtk.Widget {
    texture: Gdk.Texture | null = null;

    setTexture(t: Gdk.Texture | null): void {
      this.texture = t;
      this.queue_draw();
    }

    vfunc_snapshot(snapshot: Gtk.Snapshot): void {
      const w = this.get_width();
      const h = this.get_height();
      if (w <= 0 || h <= 0) return;
      const rect = new Graphene.Rect().init(0, 0, w, h);
      const rounded = new Gsk.RoundedRect();
      rounded.init_from_rect(rect, 8);
      snapshot.push_rounded_clip(rounded);
      if (this.texture) {
        snapshot.append_scaled_texture(this.texture, Gsk.ScalingFilter.TRILINEAR, rect);
      } else {
        const c = new Gdk.RGBA();
        c.parse('rgba(127,127,127,0.25)');
        snapshot.append_color(c, rect);
      }
      snapshot.pop();
    }
  },
);

// Composite tile: thumbnail + fit-mode chip. Gtk.Overlay
// positions the chip via halign/valign, so no manual child allocation.
export const MonitorTile = GObject.registerClass(
  { GTypeName: 'PmwMonitorTile' },
  class extends Gtk.Overlay {
    connector: string;
    private cache: ThumbnailCache;
    private area: InstanceType<typeof ThumbnailArea>;
    private chip: Gtk.MenuButton;
    private pickCb: ((c: string) => void) | null = null;
    private modeCb: ((c: string, m: Mode) => void) | null = null;

    constructor(connector: string, label: string, cache: ThumbnailCache) {
      super();
      this.connector = connector;
      this.cache = cache;
      this.set_focusable(true);
      this.set_size_request(120, 80);
      this.update_property([Gtk.AccessibleProperty.LABEL], [label]);

      this.area = new ThumbnailArea();
      this.area.set_hexpand(true);
      this.area.set_vexpand(true);
      this.set_child(this.area);

      // Body click -> pick image.
      const click = new Gtk.GestureClick();
      click.connect('released', () => this.pickCb?.(this.connector));
      this.area.add_controller(click);

      // Fit-mode chip (bottom-left overlay).
      const menu = new Gio.Menu();
      for (const m of MODES) menu.append(LABELS[m], `tile.mode::${m}`);
      this.chip = new Gtk.MenuButton({
        label: LABELS.zoom,
        halign: Gtk.Align.START,
        valign: Gtk.Align.END,
      });
      this.chip.add_css_class('osd');
      this.chip.set_menu_model(menu);
      this.add_overlay(this.chip);

      const group = new Gio.SimpleActionGroup();
      const action = new Gio.SimpleAction({ name: 'mode', parameter_type: GLib.VariantType.new('s') });
      action.connect('activate', (_a, param) => {
        if (param) this.modeCb?.(this.connector, normalizeMode(param.get_string()[0]));
      });
      group.add_action(action);
      this.insert_action_group('tile', group);

    }

    setEntry(file: string | null, mode: Mode): void {
      this.area.setTexture(file ? this.cache.texture(file) : null);
      this.chip.set_label(LABELS[mode]);
    }

    onPick(cb: (c: string) => void): void { this.pickCb = cb; }
    onMode(cb: (c: string, m: Mode) => void): void { this.modeCb = cb; }
  },
);
export type MonitorTile = InstanceType<typeof MonitorTile>;
