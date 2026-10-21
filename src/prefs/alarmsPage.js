import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { ALARM_SOUND_DURATION_MS } from '../shared/alarmSound.js';
import { addSwitchRow, escapeMarkup, parseAlarms } from './prefsHelpers.js';

const TEST_SOUND_END_MARGIN_MS = 70;

function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

export function buildAlarmsPage(settings, window, links, refreshPreview) {
    const page = new Adw.PreferencesPage({
        title: _('Alarms'),
        icon_name: 'alarm-symbolic'
    });

    const alarmGroup = new Adw.PreferencesGroup({
        title: _('Alarms'),
        description: _('Add one or more alarms; each one can be snoozed independently')
    });
    page.add(alarmGroup);

    let alarms = parseAlarms(settings.get_string('alarms'));
    const enabledSwitches = new Map();
    const saveAlarms = () => {
        settings.set_string('alarms', JSON.stringify(alarms));
        refreshPreview();
    };

    const hasSpecificDate = (alarm) => alarm.year !== undefined && alarm.month !== undefined && alarm.day !== undefined;

    const formatAlarmSubtitle = (alarm) => {
        const time = `${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')}`;
        if (hasSpecificDate(alarm)) {
            const date = `${String(alarm.day).padStart(2, '0')}-${String(alarm.month).padStart(2, '0')}-${alarm.year}`;
            return `${time}  ·  ${date}`;
        }
        return `${time}  ·  ${_('Every day')}`;
    };

    const addAlarmButtonRow = new Adw.ActionRow({ title: _('Add New Alarm') });
    const addAlarmButton = new Gtk.Button({
        icon_name: 'list-add-symbolic',
        valign: Gtk.Align.CENTER
    });
    addAlarmButtonRow.add_suffix(addAlarmButton);
    addAlarmButtonRow.set_activatable_widget(addAlarmButton);

    const buildAlarmRow = (alarm) => {
        const row = new Adw.ExpanderRow({
            title: escapeMarkup(alarm.label || _('Alarm')),
            subtitle: formatAlarmSubtitle(alarm)
        });

        const enabledSwitch = new Gtk.Switch({
            active: alarm.enabled,
            valign: Gtk.Align.CENTER
        });
        enabledSwitch.connect('notify::active', (w) => {
            if (alarm.enabled === w.active) return;
            alarm.enabled = w.active;
            saveAlarms();
        });
        enabledSwitches.set(alarm.id, enabledSwitch);
        row.add_prefix(enabledSwitch);

        const timeRow = new Adw.ActionRow({ title: _('Time') });
        const hourSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 23, step_increment: 1, value: alarm.hour }),
            valign: Gtk.Align.CENTER,
            wrap: true
        });
        const minuteSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 59, step_increment: 1, value: alarm.minute }),
            valign: Gtk.Align.CENTER,
            wrap: true
        });
        hourSpin.connect('value-changed', (w) => {
            alarm.hour = Math.floor(w.get_value());
            row.set_subtitle(formatAlarmSubtitle(alarm));
            saveAlarms();
        });
        minuteSpin.connect('value-changed', (w) => {
            alarm.minute = Math.floor(w.get_value());
            row.set_subtitle(formatAlarmSubtitle(alarm));
            saveAlarms();
        });
        timeRow.add_suffix(hourSpin);
        timeRow.add_suffix(new Gtk.Label({ label: ' : ' }));
        timeRow.add_suffix(minuteSpin);
        row.add_row(timeRow);

        const today = GLib.DateTime.new_now_local();

        const specificDateSwitch = new Adw.SwitchRow({
            title: _('Specific Date'),
            subtitle: _('Ring once on a chosen date instead of every day'),
            active: hasSpecificDate(alarm)
        });
        row.add_row(specificDateSwitch);

        const dateRow = new Adw.ActionRow({ title: _('Date') });
        const initialMonth = alarm.month || today.get_month();
        const initialYear = alarm.year || today.get_year();
        const dayAdjustment = new Gtk.Adjustment({
            lower: 1,
            upper: daysInMonth(initialYear, initialMonth),
            step_increment: 1,
            value: alarm.day || today.get_day_of_month()
        });
        const daySpin = new Gtk.SpinButton({
            adjustment: dayAdjustment,
            valign: Gtk.Align.CENTER,
            wrap: true
        });
        const monthSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({ lower: 1, upper: 12, step_increment: 1, value: initialMonth }),
            valign: Gtk.Align.CENTER,
            wrap: true
        });
        const yearSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({ lower: today.get_year(), upper: today.get_year() + 20, step_increment: 1, value: initialYear }),
            valign: Gtk.Align.CENTER
        });
        dateRow.add_suffix(daySpin);
        dateRow.add_suffix(new Gtk.Label({ label: '/' }));
        dateRow.add_suffix(monthSpin);
        dateRow.add_suffix(new Gtk.Label({ label: '/' }));
        dateRow.add_suffix(yearSpin);
        dateRow.set_visible(specificDateSwitch.active);
        row.add_row(dateRow);

        const applyDate = () => {
            if (specificDateSwitch.active) {
                alarm.day = Math.floor(daySpin.get_value());
                alarm.month = Math.floor(monthSpin.get_value());
                alarm.year = Math.floor(yearSpin.get_value());
            } else {
                delete alarm.day;
                delete alarm.month;
                delete alarm.year;
            }
            row.set_subtitle(formatAlarmSubtitle(alarm));
            saveAlarms();
        };

        specificDateSwitch.connect('notify::active', (w) => {
            dateRow.set_visible(w.active);
            applyDate();
        });

        const clampDayToMonth = () => {
            const maxDay = daysInMonth(Math.floor(yearSpin.get_value()), Math.floor(monthSpin.get_value()));
            dayAdjustment.set_upper(maxDay);
            if (daySpin.get_value() > maxDay) {
                daySpin.set_value(maxDay);
            } else {
                applyDate();
            }
        };

        daySpin.connect('value-changed', applyDate);
        monthSpin.connect('value-changed', clampDayToMonth);
        yearSpin.connect('value-changed', clampDayToMonth);

        const labelRow = new Adw.EntryRow({
            title: _('Label'),
            text: alarm.label
        });
        labelRow.connect('changed', (w) => {
            alarm.label = w.get_text();
            row.set_title(escapeMarkup(alarm.label || _('Alarm')));
            saveAlarms();
        });
        row.add_row(labelRow);

        const deleteRow = new Adw.ActionRow({ title: _('Remove This Alarm') });
        const deleteButton = new Gtk.Button({
            icon_name: 'user-trash-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action']
        });
        deleteButton.connect('clicked', () => {
            alarms = alarms.filter(existing => existing.id !== alarm.id);
            enabledSwitches.delete(alarm.id);
            saveAlarms();
            alarmGroup.remove(row);
        });
        deleteRow.add_suffix(deleteButton);
        deleteRow.set_activatable_widget(deleteButton);
        row.add_row(deleteRow);

        return row;
    };

    for (const alarm of alarms) alarmGroup.add(buildAlarmRow(alarm));

    addAlarmButton.connect('clicked', () => {
        const alarm = { id: GLib.uuid_string_random(), hour: 8, minute: 0, enabled: true, label: _('Alarm') };
        alarms.push(alarm);
        saveAlarms();
        alarmGroup.remove(addAlarmButtonRow);
        alarmGroup.add(buildAlarmRow(alarm));
        alarmGroup.add(addAlarmButtonRow);
    });

    alarmGroup.add(addAlarmButtonRow);

    links.connect('changed::alarms', () => {
        for (const stored of parseAlarms(settings.get_string('alarms'))) {
            const local = alarms.find(existing => existing.id === stored.id);
            if (!local || local.enabled === stored.enabled) continue;
            local.enabled = stored.enabled;
            enabledSwitches.get(stored.id).set_active(stored.enabled);
        }
    });

    const alarmSettingsGroup = new Adw.PreferencesGroup({
        title: escapeMarkup(_('Sound & Snooze'))
    });
    page.add(alarmSettingsGroup);

    const testSoundRow = new Adw.ActionRow({
        title: _('Test Alarm Sound'),
        subtitle: _('Play or stop the alarm sound to preview it')
    });
    const testSoundButton = new Gtk.Button({
        icon_name: 'media-playback-start-symbolic',
        valign: Gtk.Align.CENTER
    });

    let isTestSoundPlaying = false;
    let testSoundTimeoutId = null;

    const setTestSoundPlaying = (playing) => {
        isTestSoundPlaying = playing;
        testSoundButton.set_icon_name(playing ? 'media-playback-stop-symbolic' : 'media-playback-start-symbolic');
    };

    testSoundButton.connect('clicked', () => {
        if (isTestSoundPlaying) {
            if (testSoundTimeoutId) {
                GLib.Source.remove(testSoundTimeoutId);
                testSoundTimeoutId = null;
            }
            settings.set_int('test-alarm-stop-counter', settings.get_int('test-alarm-stop-counter') + 1);
            setTestSoundPlaying(false);
        } else {
            settings.set_int('test-alarm-counter', settings.get_int('test-alarm-counter') + 1);
            setTestSoundPlaying(true);
            testSoundTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ALARM_SOUND_DURATION_MS + TEST_SOUND_END_MARGIN_MS, () => {
                testSoundTimeoutId = null;
                setTestSoundPlaying(false);
                return GLib.SOURCE_REMOVE;
            });
        }
    });
    testSoundRow.add_suffix(testSoundButton);
    testSoundRow.set_activatable_widget(testSoundButton);
    alarmSettingsGroup.add(testSoundRow);

    window.connect('close-request', () => {
        if (testSoundTimeoutId) {
            GLib.Source.remove(testSoundTimeoutId);
            testSoundTimeoutId = null;
        }
        if (isTestSoundPlaying) {
            settings.set_int('test-alarm-stop-counter', settings.get_int('test-alarm-stop-counter') + 1);
        }
        return false;
    });

    const snoozeRow = new Adw.ActionRow({
        title: _('Snooze Duration'),
        subtitle: _('Minutes to wait before a snoozed alarm rings again')
    });
    const snoozeSpin = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({ lower: 1, upper: 60, step_increment: 1 }),
        digits: 0,
        valign: Gtk.Align.CENTER
    });
    settings.bind('snooze-minutes', snoozeSpin, 'value', Gio.SettingsBindFlags.DEFAULT);
    snoozeRow.add_suffix(snoozeSpin);
    alarmSettingsGroup.add(snoozeRow);

    addSwitchRow(settings, alarmSettingsGroup, 'alarm-dialog-enabled',
        _('On-Screen Alarm Dialog'),
        _('Show a dialog instead of a notification when an alarm rings, so it is not missed if notifications are silenced'));

    return page;
}
