import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import { AlarmDialog } from './alarmDialog.js';
import { ALARM_SOUND_DURATION_MS } from './alarmSound.js';

const ALARM_AUTO_STOP_MS = 60000;
const SECONDS_PER_MINUTE = 60;

export class AlarmManager {
    #settings;
    #title;
    #onRingingChanged;
    #onAlarmsChanged;
    #alarms = [];
    #lastAlarmStamps = new Map();
    #pendingAlarms = [];
    #snoozeTimeoutIds = new Map();
    #activeNotification = null;
    #alarmDialog = null;
    #lastCheckedTime = null;
    #isRinging = false;
    #alarmSoundTimeoutId = null;
    #alarmSoundCancellable = null;
    #alarmTimeoutId = null;
    #testSoundCancellable = null;

    constructor(settings, { title, onRingingChanged, onAlarmsChanged }) {
        this.#settings = settings;
        this.#title = title;
        this.#onRingingChanged = onRingingChanged;
        this.#onAlarmsChanged = onAlarmsChanged;

        this.#migrateLegacyAlarm();
        this.#alarms = this.#parseAlarms();

        this.#settings.connectObject(
            'changed::alarms', () => { this.#alarms = this.#parseAlarms(); this.#onAlarmsChanged(); },
            'changed::test-alarm-counter', () => this.#startTestSound(),
            'changed::test-alarm-stop-counter', () => this.#stopTestSound(),
            this
        );
    }

    get isRinging() {
        return this.#isRinging;
    }

    get hasEnabledAlarm() {
        return this.#alarms.some(alarm => alarm.enabled);
    }

    destroy() {
        this.#settings.disconnectObject(this);
        this.#haltRinging();
        this.#stopTestSound();

        for (const timeoutId of this.#snoozeTimeoutIds.values())
            GLib.Source.remove(timeoutId);
        this.#snoozeTimeoutIds.clear();

        this.#alarms = [];
        this.#pendingAlarms = [];
        this.#lastAlarmStamps.clear();
        this.#lastCheckedTime = null;
        this.#settings = null;
        this.#onRingingChanged = null;
        this.#onAlarmsChanged = null;
    }

    checkAlarms(now) {
        const previousCheckedTime = this.#lastCheckedTime;
        this.#lastCheckedTime = now;

        if (!this.#alarms.length) return;

        for (const alarm of this.#alarms) {
            if (!alarm.enabled) continue;

            const hasDate = alarm.year !== undefined;
            const target = hasDate
                ? GLib.DateTime.new_local(alarm.year, alarm.month, alarm.day, alarm.hour, alarm.minute, 0)
                : GLib.DateTime.new_local(now.get_year(), now.get_month(), now.get_day_of_month(), alarm.hour, alarm.minute, 0);

            const reachedTarget = previousCheckedTime
                ? previousCheckedTime.compare(target) < 0 && now.compare(target) >= 0
                : (hasDate
                    ? now.get_year() === alarm.year && now.get_month() === alarm.month && now.get_day_of_month() === alarm.day &&
                      now.get_hour() === alarm.hour && now.get_minute() === alarm.minute
                    : now.get_hour() === alarm.hour && now.get_minute() === alarm.minute);

            if (!reachedTarget) continue;

            const stamp = `${now.get_year()}-${now.get_day_of_year()}-${alarm.hour}:${alarm.minute}`;
            if (this.#lastAlarmStamps.get(alarm.id) === stamp) continue;
            this.#lastAlarmStamps.set(alarm.id, stamp);

            if (hasDate) this.#disableOneTimeAlarm(alarm);

            if (this.#isRinging) {
                if (!this.#pendingAlarms.some(pending => pending.id === alarm.id))
                    this.#pendingAlarms.push(alarm);
            } else {
                this.#triggerAlarm(alarm);
            }
        }
    }

    stopRinging() {
        this.#haltRinging();
        this.#onRingingChanged(false);

        if (this.#pendingAlarms.length)
            this.#triggerAlarm(this.#pendingAlarms.shift());
    }

    #parseAlarms() {
        let parsed;
        try {
            parsed = JSON.parse(this.#settings.get_string('alarms'));
        } catch {
            parsed = [];
        }
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(alarm => {
            if (!alarm || typeof alarm.id !== 'string') return false;
            if (!Number.isInteger(alarm.hour) || alarm.hour < 0 || alarm.hour > 23) return false;
            if (!Number.isInteger(alarm.minute) || alarm.minute < 0 || alarm.minute > 59) return false;

            const hasDate = alarm.year !== undefined || alarm.month !== undefined || alarm.day !== undefined;
            if (!hasDate) return true;

            if (!Number.isInteger(alarm.year) || alarm.year < 1970 || alarm.year > 9999) return false;
            if (!Number.isInteger(alarm.month) || alarm.month < 1 || alarm.month > 12) return false;
            if (!Number.isInteger(alarm.day) || alarm.day < 1 || alarm.day > 31) return false;

            return GLib.DateTime.new_local(alarm.year, alarm.month, alarm.day, alarm.hour, alarm.minute, 0) !== null;
        });
    }

    #migrateLegacyAlarm() {
        if (this.#settings.get_boolean('alarms-migrated')) return;
        this.#settings.set_boolean('alarms-migrated', true);

        if (!this.#settings.get_boolean('alarm-enabled')) return;

        const legacyAlarm = {
            id: GLib.uuid_string_random(),
            hour: this.#settings.get_int('alarm-hour'),
            minute: this.#settings.get_int('alarm-minute'),
            enabled: true,
            label: this.#settings.get_string('alarm-message') || _('Alarm')
        };
        this.#settings.set_string('alarms', JSON.stringify([legacyAlarm]));
    }

    #disableOneTimeAlarm(alarm) {
        alarm.enabled = false;
        this.#settings.set_string('alarms', JSON.stringify(this.#alarms));
    }

    #playAlarmSound(cancellable = this.#alarmSoundCancellable) {
        try {
            global.display.get_sound_player().play_from_theme('alarm-clock-elapsed', 'Alarm clock', cancellable);
        } catch (e) {
            console.error('RelojLCD: Failed to play alarm sound', e);
        }
    }

    #startTestSound() {
        this.#stopTestSound();
        this.#testSoundCancellable = new Gio.Cancellable();
        this.#playAlarmSound(this.#testSoundCancellable);
    }

    #stopTestSound() {
        if (this.#testSoundCancellable) {
            this.#testSoundCancellable.cancel();
            this.#testSoundCancellable = null;
        }
    }

    #triggerAlarm(alarm) {
        this.#isRinging = true;
        this.#alarmSoundCancellable = new Gio.Cancellable();

        if (this.#settings.get_boolean('alarm-dialog-enabled')) {
            this.#showAlarmDialog(alarm);
        } else {
            this.#showAlarmNotification(alarm);
        }
        this.#playAlarmSound();

        if (this.#alarmSoundTimeoutId) GLib.Source.remove(this.#alarmSoundTimeoutId);
        this.#alarmSoundTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ALARM_SOUND_DURATION_MS, () => {
            this.#playAlarmSound();
            return GLib.SOURCE_CONTINUE;
        });

        this.#onRingingChanged(true);

        if (this.#alarmTimeoutId) GLib.Source.remove(this.#alarmTimeoutId);
        this.#alarmTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ALARM_AUTO_STOP_MS, () => {
            this.stopRinging();
            return GLib.SOURCE_REMOVE;
        });
    }

    #showAlarmNotification(alarm) {
        const source = MessageTray.getSystemSource();
        const notification = new MessageTray.Notification({
            source,
            title: this.#title,
            body: alarm.label || _('Alarm'),
            urgency: MessageTray.Urgency.CRITICAL
        });

        notification.addAction(_('Snooze'), () => this.#snoozeAlarm(alarm));
        notification.addAction(_('Dismiss'), () => this.stopRinging());

        const destroyHandlerId = notification.connect('destroy', () => {
            notification.disconnect(destroyHandlerId);
            if (this.#activeNotification === notification)
                this.#activeNotification = null;
        });

        this.#activeNotification = notification;
        source.addNotification(notification);
    }

    #showAlarmDialog(alarm) {
        this.#alarmDialog = new AlarmDialog(
            alarm,
            () => this.#snoozeAlarm(alarm),
            () => this.stopRinging()
        );
        this.#alarmDialog.open();
    }

    #snoozeAlarm(alarm) {
        this.stopRinging();

        const existingTimeoutId = this.#snoozeTimeoutIds.get(alarm.id);
        if (existingTimeoutId) GLib.Source.remove(existingTimeoutId);

        const snoozeMinutes = this.#settings.get_int('snooze-minutes');
        const timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, snoozeMinutes * SECONDS_PER_MINUTE, () => {
            this.#snoozeTimeoutIds.delete(alarm.id);
            this.#triggerAlarm(alarm);
            return GLib.SOURCE_REMOVE;
        });
        this.#snoozeTimeoutIds.set(alarm.id, timeoutId);
    }

    #haltRinging() {
        this.#isRinging = false;

        if (this.#alarmSoundCancellable) {
            this.#alarmSoundCancellable.cancel();
            this.#alarmSoundCancellable = null;
        }

        if (this.#alarmSoundTimeoutId) {
            GLib.Source.remove(this.#alarmSoundTimeoutId);
            this.#alarmSoundTimeoutId = null;
        }

        if (this.#alarmTimeoutId) {
            GLib.Source.remove(this.#alarmTimeoutId);
            this.#alarmTimeoutId = null;
        }

        this.#activeNotification?.destroy();
        this.#activeNotification = null;

        if (this.#alarmDialog) {
            this.#alarmDialog.close();
            this.#alarmDialog = null;
        }
    }
}
