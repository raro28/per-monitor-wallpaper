import GLib from 'gi://GLib';

const DEBOUNCE_MS = 150;

/** Coalesces rapid triggers into a single deferred call (150 ms), matching the
 *  original extension's shared _scheduleApply debounce. */
export class Debouncer {
  private id = 0;

  constructor(private readonly fn: () => void) {}

  schedule(): void {
    if (this.id) GLib.source_remove(this.id);
    this.id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
      this.id = 0;
      this.fn();
      return GLib.SOURCE_REMOVE;
    });
  }

  cancel(): void {
    if (this.id) {
      GLib.source_remove(this.id);
      this.id = 0;
    }
  }
}
