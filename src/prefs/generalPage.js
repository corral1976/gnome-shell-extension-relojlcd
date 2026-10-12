import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { addSwitchRow, bindChoiceRow } from './prefsHelpers.js';

const POSITION_KEYS = ['left', 'center', 'right'];

export function buildGeneralPage(settings, links) {
    const page = new Adw.PreferencesPage({
        title: _('General'),
        icon_name: 'preferences-system-symbolic'
    });

    const dateGroup = new Adw.PreferencesGroup({
        title: _('Current Date')
    });
    page.add(dateGroup);

    const dateLabel = new Gtk.Label({
        label: GLib.DateTime.new_now_local().format('%A, %d %B %Y'),
        halign: Gtk.Align.CENTER,
        margin_top: 4,
        margin_bottom: 10,
        css_classes: ['title-2']
    });
    dateGroup.add(dateLabel);

    const behaviorGroup = new Adw.PreferencesGroup({
        title: _('Clock Behavior'),
        description: _('Choose what the clock shows and where it lives')
    });
    page.add(behaviorGroup);

    addSwitchRow(settings, behaviorGroup, 'is-widget',
        _('Desktop Widget Mode'),
        _('Show clock on desktop instead of the top bar'));
    const verticalLayoutRow = addSwitchRow(settings, behaviorGroup, 'vertical-panel-layout',
        _('Vertical Panel Layout'),
        _('Compact layout (bell, hours, minutes stacked, no seconds or date) for a panel docked to the left or right edge of the screen. Not used in desktop widget mode.'));
    settings.bind('is-widget', verticalLayoutRow, 'sensitive',
        Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.INVERT_BOOLEAN);
    addSwitchRow(settings, behaviorGroup, 'clock-format-24h',
        _('24-Hour Format'),
        _('Display time in 24-hour format instead of AM/PM'));
    addSwitchRow(settings, behaviorGroup, 'show-seconds',
        _('Show Seconds'),
        _('Display seconds in the time display'));
    addSwitchRow(settings, behaviorGroup, 'show-date',
        _('Show Date'),
        _('Display current date below the time'));
    addSwitchRow(settings, behaviorGroup, 'show-date-tooltip',
        _('Show Date on Hover'),
        _('Show the full date in a small tooltip when the pointer rests over the clock'));

    const dateOrderRow = new Adw.ComboRow({
        title: _('Date Order'),
        subtitle: _('Order of day, month and year when the date is shown'),
        model: new Gtk.StringList({ strings: [_('DD-MM-YYYY'), _('MM-DD-YYYY'), _('YYYY-MM-DD')] })
    });
    bindChoiceRow(settings, links, dateOrderRow, 'date-format', ['dmy', 'mdy', 'ymd']);
    settings.bind('show-date', dateOrderRow, 'sensitive', Gio.SettingsBindFlags.GET);
    behaviorGroup.add(dateOrderRow);

    const positionRow = new Adw.ComboRow({
        title: _('Panel Position'),
        subtitle: _('Choose where the clock appears on the panel'),
        model: new Gtk.StringList({ strings: [_('Left'), _('Center'), _('Right')] })
    });
    bindChoiceRow(settings, links, positionRow, 'panel-position', POSITION_KEYS);
    behaviorGroup.add(positionRow);

    return page;
}
