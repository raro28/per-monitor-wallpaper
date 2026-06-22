import Adw from 'gi://Adw';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class PerMonitorWallpaperPrefs extends ExtensionPreferences {
  fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    const page = new Adw.PreferencesPage();
    window.add(page);
    return Promise.resolve();
  }
}
