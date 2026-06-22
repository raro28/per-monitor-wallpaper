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

    /** Place each tile at its computed rect. Tiles from a previous render are removed first. */
    render(arrangement: Arrangement, tiles: Map<string, MonitorTile>): void {
      let child = this.get_first_child();
      while (child) {
        const next = child.get_next_sibling();
        this.remove(child);
        child = next;
      }
      for (const placed of arrangement.tiles) {
        const tile = tiles.get(placed.connector);
        if (!tile) continue;
        tile.set_size_request(
          Math.max(1, Math.round(placed.rect.width)),
          Math.max(1, Math.round(placed.rect.height)),
        );
        this.put(tile, placed.rect.x, placed.rect.y);
      }
    }
  },
);
export type ArrangementView = InstanceType<typeof ArrangementView>;
