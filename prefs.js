import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { buildAboutPage } from './src/prefs/aboutPage.js';
import { buildAlarmsPage } from './src/prefs/alarmsPage.js';
import { buildAppearancePage } from './src/prefs/appearancePage.js';
import { buildGeneralPage } from './src/prefs/generalPage.js';
import { SettingsLinks } from './src/prefs/prefsHelpers.js';

export default class RelojLCDPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const links = new SettingsLinks(settings);
        const appearance = buildAppearancePage(settings, links);

        window.add(buildGeneralPage(settings, links));
        window.add(appearance.page);
        window.add(buildAlarmsPage(settings, window, appearance.refreshPreview));
        window.add(buildAboutPage(settings, window, this.metadata));

        window.connect('close-request', () => {
            links.disconnectAll();
            return false;
        });
    }
}
