import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import type { Arrangement } from '../lib/layout.js';
import type { MonitorTile } from './monitorTile.js';

export const ArrangementView = GObject.registerClass(
  { GTypeName: 'PmwArrangementView' },
  class extends Gtk.Fixed {
    constructor() {
      super();
      this.set_size_request(-1, 220);
      this.set_hexpand(true);
    }

    render(arrangement: Arrangement, tiles: Map<string, MonitorTile>): void {
      const wanted = new Set<MonitorTile>();
      for (const placed of arrangement.tiles) {
        const tile = tiles.get(placed.connector);
        if (!tile) continue;
        wanted.add(tile);
        const x = placed.rect.x;
        const y = placed.rect.y;
        tile.set_size_request(
          Math.max(1, Math.round(placed.rect.width)),
          Math.max(1, Math.round(placed.rect.height)),
        );
        if (tile.get_parent() === this) this.move(tile, x, y);
        else this.put(tile, x, y);
      }
      // Remove only children that are no longer wanted (e.g. after a monitor rebuild).
      let child = this.get_first_child();
      while (child) {
        const next = child.get_next_sibling();
        if (!(wanted as Set<unknown>).has(child)) this.remove(child);
        child = next;
      }
    }
  },
);
export type ArrangementView = InstanceType<typeof ArrangementView>;
