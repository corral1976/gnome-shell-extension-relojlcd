import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import { AlarmDialog } from '../ui/alarmDialog.js';
import { notifySystem } from '../ui/systemNotification.js';
import { ALARM_SOUND_DURATION_MS } from '../shared/alarmSound.js';

const ALARM_AUTO_STOP_MS = 60000;
const SECONDS_PER_MINUTE = 60;
const MICROSECONDS_PER_SECOND = 1000000;
const MISSED_ALARM_WINDOW_SECONDS = 1800;

export class AlarmManager {
    #settings;
    #title;
    #onRingingChanged;
    #onAlarmsChanged;
    #alarms = [];
    #lastAlarmStamps = new Map();
    #pendingAlarms = [];
    #snoozeTimeoutIds = new Map();
    #snoozeDueTimes = new Map();
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

    getCarryover() {
        return {
            disabledAt: GLib.get_real_time(),
            snoozes: [...this.#snoozeDueTimes].map(([alarmId, dueAt]) => ({ alarmId, dueAt }))
        };
    }

    restore({ disabledAt, snoozes }) {
        const now = GLib.DateTime.new_now_local();

        for (const alarm of this.#alarms) {
            if (!alarm.enabled) continue;

            const missedTarget = this.#findMissedTarget(alarm, disabledAt, now);
            if (!missedTarget) continue;

            this.#lastAlarmStamps.set(alarm.id, this.#buildStamp(missedTarget, alarm));
            if (alarm.year !== undefined) this.#disableOneTimeAlarm(alarm);
            this.#notifyMissedAlarm(alarm, missedTarget);
        }

        for (const { alarmId, dueAt } of snoozes) {
            const alarm = this.#alarms.find(candidate => candidate.id === alarmId);
            if (!alarm || !this.#canRing(alarm)) continue;

            const remainingSeconds = Math.ceil((dueAt - GLib.get_real_time()) / MICROSECONDS_PER_SECOND);
            if (remainingSeconds > 0)
                this.#startSnoozeTimer(alarmId, remainingSeconds);
            else if (-remainingSeconds <= MISSED_ALARM_WINDOW_SECONDS)
                this.#notifyMissedAlarm(alarm, GLib.DateTime.new_from_unix_local(Math.floor(dueAt / MICROSECONDS_PER_SECOND)));
        }
    }

    destroy() {
        this.#settings.disconnectObject(this);
        this.#haltRinging();
        this.#stopTestSound();

        for (const timeoutId of this.#snoozeTimeoutIds.values())
            GLib.Source.remove(timeoutId);
        this.#snoozeTimeoutIds.clear();
        this.#snoozeDueTimes.clear();

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

            const stamp = this.#buildStamp(now, alarm);
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

    #buildStamp(date, alarm) {
        return `${date.get_year()}-${date.get_day_of_year()}-${alarm.hour}:${alarm.minute}`;
    }

    #canRing(alarm) {
        return alarm.enabled || alarm.year !== undefined;
    }

    #findMissedTarget(alarm, disabledAt, now) {
        const targets = alarm.year !== undefined
            ? [GLib.DateTime.new_local(alarm.year, alarm.month, alarm.day, alarm.hour, alarm.minute, 0)]
            : [now, now.add_days(-1)].map(day =>
                GLib.DateTime.new_local(day.get_year(), day.get_month(), day.get_day_of_month(), alarm.hour, alarm.minute, 0));

        return targets.find(target => {
            const lateBySeconds = now.to_unix() - target.to_unix();
            return target.to_unix() * MICROSECONDS_PER_SECOND > disabledAt &&
                lateBySeconds >= SECONDS_PER_MINUTE && lateBySeconds <= MISSED_ALARM_WINDOW_SECONDS;
        }) ?? null;
    }

    #notifyMissedAlarm(alarm, target) {
        notifySystem({
            title: _('Missed alarm'),
            body: `${alarm.label || _('Alarm')}  ·  ${target.format('%H:%M')}`
        });
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

    #disableOneTimeAlarm(alarm) {
        this.#alarms.find(candidate => candidate.id === alarm.id).enabled = false;
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
        const notification = notifySystem({
            title: this.#title,
            body: alarm.label || _('Alarm'),
            urgency: MessageTray.Urgency.CRITICAL,
            actions: [
                { label: _('Snooze'), callback: () => this.#snoozeAlarm(alarm) },
                { label: _('Dismiss'), callback: () => this.stopRinging() }
            ]
        });

        const destroyHandlerId = notification.connect('destroy', () => {
            notification.disconnect(destroyHandlerId);
            if (this.#activeNotification === notification)
                this.#activeNotification = null;
        });

        this.#activeNotification = notification;
    }

    #showAlarmDialog(alarm) {
        const dialog = new AlarmDialog(
            alarm,
            () => this.#snoozeAlarm(alarm),
            () => this.stopRinging()
        );

        if (!dialog.open()) {
            dialog.destroy();
            this.#showAlarmNotification(alarm);
            return;
        }

        this.#alarmDialog = dialog;
    }

    #snoozeAlarm(alarm) {
        this.stopRinging();
        this.#startSnoozeTimer(alarm.id, this.#settings.get_int('snooze-minutes') * SECONDS_PER_MINUTE);
    }

    #startSnoozeTimer(alarmId, delaySeconds) {
        const existingTimeoutId = this.#snoozeTimeoutIds.get(alarmId);
        if (existingTimeoutId) GLib.Source.remove(existingTimeoutId);

        this.#snoozeDueTimes.set(alarmId, GLib.get_real_time() + delaySeconds * MICROSECONDS_PER_SECOND);
        const timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delaySeconds, () => {
            this.#snoozeTimeoutIds.delete(alarmId);
            this.#snoozeDueTimes.delete(alarmId);
            const currentAlarm = this.#alarms.find(candidate => candidate.id === alarmId);
            if (currentAlarm && this.#canRing(currentAlarm))
                this.#triggerAlarm(currentAlarm);
            return GLib.SOURCE_REMOVE;
        });
        this.#snoozeTimeoutIds.set(alarmId, timeoutId);
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
