import Gio from 'gi://Gio';
import { defaultFile } from '../lib/config.js';
import type { ConfigSource } from './configSource.js';

/** Point gsettings at the default wallpaper so the pre-enable login flash matches.
 *  The get!==set guard keeps it a no-op when already in sync. */
export function seedLoginBackground(config: ConfigSource): void {
  const cfg = config.read();
  const def = cfg ? defaultFile(cfg) : null;
  if (!def) return;
  const gfile = Gio.File.new_for_path(def);
  if (!gfile.query_exists(null)) return;
  const uri = gfile.get_uri();
  const settings = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
  for (const key of ['picture-uri', 'picture-uri-dark']) {
    if (settings.get_string(key) !== uri) settings.set_string(key, uri);
  }
}
