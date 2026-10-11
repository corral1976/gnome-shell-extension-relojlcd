import Gio from 'gi://Gio';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

export function notifyIfUpdated(settings, metadata) {
    const currentVersion = metadata.version.toString();
    const lastVersion = settings.get_string('last-version');
    settings.set_string('last-version', currentVersion);

    if (lastVersion === '' || lastVersion === currentVersion) return;

    const source = MessageTray.getSystemSource();
    const notification = new MessageTray.Notification({
        source,
        title: _('%s updated').format(metadata.name),
        body: _('Now running version %s.').format(currentVersion),
        gicon: Gio.ThemedIcon.new('preferences-system-time-symbolic')
    });
    source.addNotification(notification);
}
