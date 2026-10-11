import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import { ModalDialog } from 'resource:///org/gnome/shell/ui/modalDialog.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

export const AlarmDialog = GObject.registerClass(
{ GTypeName: 'RelojLCDAlarmDialog' },
class AlarmDialog extends ModalDialog {
    _init(alarm, onSnooze, onDismiss) {
        super._init({ styleClass: 'reloj-lcd-alarm-dialog' });

        this.contentLayout.add_child(new St.Label({
            text: alarm.label || _('Alarm'),
            style_class: 'reloj-lcd-alarm-dialog-label',
            x_align: Clutter.ActorAlign.CENTER
        }));

        this.setButtons([
            {
                label: _('Snooze'),
                action: onSnooze
            },
            {
                label: _('Dismiss'),
                action: onDismiss,
                default: true
            }
        ]);
    }
});
