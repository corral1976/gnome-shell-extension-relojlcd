import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const RESET_EXCLUDED_KEYS = new Set([
    'alarms', 'widget-x', 'widget-y', 'last-version',
    'test-alarm-counter', 'test-alarm-stop-counter'
]);

export function buildAboutPage(settings, window, metadata) {
    const page = new Adw.PreferencesPage({
        title: _('About'),
        icon_name: 'help-about-symbolic'
    });

    const aboutGroup = new Adw.PreferencesGroup({
        title: _('About'),
        description: _('Information and credits')
    });
    page.add(aboutGroup);

    const versionRow = new Adw.ActionRow({
        title: _('Version'),
        subtitle: `${metadata.name} v${metadata.version}`
    });
    versionRow.set_sensitive(false);
    aboutGroup.add(versionRow);

    const authorRow = new Adw.ActionRow({
        title: _('Author'),
        subtitle: 'Carlos Corral'
    });
    authorRow.set_sensitive(false);
    aboutGroup.add(authorRow);

    const repoRow = new Adw.ActionRow({
        title: _('Source Code'),
        subtitle: _('View on GitLab')
    });
    const repoButton = new Gtk.Button({
        label: _('Open Repository'),
        valign: Gtk.Align.CENTER
    });
    repoButton.connect('clicked', () => {
        const uri = metadata.url;
        if (uri) {
            Gio.app_info_launch_default_for_uri(uri, null);
        }
    });
    repoRow.add_suffix(repoButton);
    aboutGroup.add(repoRow);

    const supportGroup = new Adw.PreferencesGroup({
        title: _('Support Us')
    });
    page.add(supportGroup);

    const kofiRow = new Adw.ActionRow({
        title: _('Support on Ko-fi'),
        subtitle: _('Buy the developer a coffee')
    });
    const kofiButton = new Gtk.Button({
        label: _('Open Ko-fi'),
        valign: Gtk.Align.CENTER
    });
    kofiButton.connect('clicked', () => {
        const kofiUser = metadata.donations?.kofi;
        if (kofiUser) {
            Gio.app_info_launch_default_for_uri(`https://ko-fi.com/${kofiUser}`, null);
        }
    });
    kofiRow.add_suffix(kofiButton);
    supportGroup.add(kofiRow);

    const resetGroup = new Adw.PreferencesGroup({
        title: _('Reset'),
        description: _('Restore appearance and clock settings to their defaults. Your alarms are not affected.')
    });
    page.add(resetGroup);

    const resetRow = new Adw.ActionRow({ title: _('Reset to Defaults') });
    const resetButton = new Gtk.Button({
        label: _('Reset'),
        valign: Gtk.Align.CENTER,
        css_classes: ['destructive-action']
    });

    const resetToDefaults = () => {
        for (const key of settings.settings_schema.list_keys()) {
            if (!RESET_EXCLUDED_KEYS.has(key))
                settings.reset(key);
        }
    };

    resetButton.connect('clicked', () => {
        const dialog = new Adw.MessageDialog({
            heading: _('Reset to Defaults?'),
            body: _('This will restore appearance and clock settings to their defaults. Your alarms will not be affected.'),
            transient_for: window,
            modal: true
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('reset', _('Reset'));
        dialog.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');
        dialog.connect('response', (_dialog, response) => {
            if (response === 'reset') resetToDefaults();
        });
        dialog.present();
    });
    resetRow.add_suffix(resetButton);
    resetGroup.add(resetRow);

    return page;
}
