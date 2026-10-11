import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

const LAMP_TEST_PEAK_OPACITY = 220;
const LAMP_TEST_PAUSE_MS = 1800;
const LAMP_TEST_FADE_MS = 700;
const MINUTE_FLICKER_DIP_OPACITY = 90;
const MINUTE_FLICKER_DIP_MS = 60;
const MINUTE_FLICKER_RESTORE_MS = 140;
const ALARM_BLINK_INTERVAL_MS = 500;
const ALARM_BLINK_DIM_OPACITY = 40;

const FLICKER_THRESHOLDS = {
    white: [
        { threshold: 0.80, opacity: 255 },
        { threshold: 0.90, opacity: 200 },
        { threshold: 0.96, opacity: 150 },
        { threshold: 1.00, opacity: 100 }
    ],
    gray: [
        { threshold: 0.85, opacity: 255 },
        { threshold: 0.92, opacity: 230 },
        { threshold: 0.97, opacity: 200 },
        { threshold: 1.00, opacity: 170 }
    ],
    default: [
        { threshold: 0.85, opacity: 255 },
        { threshold: 0.92, opacity: 240 },
        { threshold: 0.97, opacity: 220 },
        { threshold: 1.00, opacity: 200 }
    ]
};

export class DisplayEffects {
    #settings;
    #display;
    #alarmManager;
    #flickerTimeoutId = null;
    #blinkTimeoutId = null;
    #alarmBlinkState = true;
    #lampTestMappedId = null;
    #lampTestIdleId = null;
    #lampTestTimeoutId = null;

    constructor(settings, display, alarmManager) {
        this.#settings = settings;
        this.#display = display;
        this.#alarmManager = alarmManager;
    }

    destroy() {
        if (this.#flickerTimeoutId) {
            GLib.Source.remove(this.#flickerTimeoutId);
            this.#flickerTimeoutId = null;
        }

        if (this.#blinkTimeoutId) {
            GLib.Source.remove(this.#blinkTimeoutId);
            this.#blinkTimeoutId = null;
        }

        if (this.#lampTestTimeoutId) {
            GLib.Source.remove(this.#lampTestTimeoutId);
            this.#lampTestTimeoutId = null;
        }

        if (this.#lampTestIdleId) {
            GLib.Source.remove(this.#lampTestIdleId);
            this.#lampTestIdleId = null;
        }

        if (this.#lampTestMappedId) {
            this.#display.ghostLabel.disconnect(this.#lampTestMappedId);
            this.#lampTestMappedId = null;
        }
    }

    updateFlicker() {
        if (this.#flickerTimeoutId) {
            GLib.Source.remove(this.#flickerTimeoutId);
            this.#flickerTimeoutId = null;
        }

        if (!this.#settings.get_boolean('flicker-enabled') || this.#alarmManager.isRinging) {
            this.#display.clockLabel.set_opacity(255);
            this.#display.shadowLabel.set_opacity(255);
            return;
        }

        const colorType = this.#settings.get_string('clock-color');
        const isRetro = colorType === 'gray';
        const thresholds = FLICKER_THRESHOLDS[colorType] || FLICKER_THRESHOLDS.default;

        const flicker = () => {
            this.#flickerTimeoutId = null;
            if (!this.#settings.get_boolean('flicker-enabled') || this.#alarmManager.isRinging)
                return GLib.SOURCE_REMOVE;

            const random = Math.random();
            const opacity = thresholds.find(t => random < t.threshold)?.opacity || 255;

            this.#display.clockLabel.set_opacity(opacity);
            if (isRetro)
                this.#display.shadowLabel.set_opacity(opacity);

            this.#scheduleFlicker(50 + Math.floor(Math.random() * 150), flicker);
            return GLib.SOURCE_REMOVE;
        };

        this.#scheduleFlicker(100, flicker);
    }

    playMinuteFlicker() {
        const clockLabel = this.#display.clockLabel;
        clockLabel.ease({
            opacity: MINUTE_FLICKER_DIP_OPACITY,
            duration: MINUTE_FLICKER_DIP_MS,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                clockLabel.ease({
                    opacity: 255,
                    duration: MINUTE_FLICKER_RESTORE_MS,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD
                });
            }
        });
    }

    runLampTest() {
        if (!this.#settings.get_boolean('startup-lamp-test')) return;

        const ghostLabel = this.#display.ghostLabel;
        if (ghostLabel.mapped) {
            this.#scheduleLampTest();
            return;
        }

        this.#lampTestMappedId = ghostLabel.connect('notify::mapped', () => {
            ghostLabel.disconnect(this.#lampTestMappedId);
            this.#lampTestMappedId = null;
            this.#scheduleLampTest();
        });
    }

    startAlarmBlink() {
        this.stopAlarmBlink();
        this.#blinkTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ALARM_BLINK_INTERVAL_MS, () => {
            this.#alarmBlinkState = !this.#alarmBlinkState;
            const opacity = this.#alarmBlinkState ? 255 : ALARM_BLINK_DIM_OPACITY;
            this.#display.clockLabel.set_opacity(opacity);
            this.#display.alarmDotWrapper.set_opacity(opacity);
            return GLib.SOURCE_CONTINUE;
        });
    }

    stopAlarmBlink() {
        if (this.#blinkTimeoutId) {
            GLib.Source.remove(this.#blinkTimeoutId);
            this.#blinkTimeoutId = null;
        }
    }

    #scheduleFlicker(interval, callback) {
        if (this.#flickerTimeoutId) {
            GLib.Source.remove(this.#flickerTimeoutId);
            this.#flickerTimeoutId = null;
        }
        this.#flickerTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, callback);
    }

    #scheduleLampTest() {
        this.#lampTestIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.#lampTestIdleId = null;
            this.#startLampTest();
            return GLib.SOURCE_REMOVE;
        });
    }

    #startLampTest() {
        this.#display.ghostLabel.set_opacity(LAMP_TEST_PEAK_OPACITY);

        this.#lampTestTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, LAMP_TEST_PAUSE_MS, () => {
            this.#lampTestTimeoutId = null;
            this.#display.ghostLabel.ease({
                opacity: this.#display.getGhostOpacity(),
                duration: LAMP_TEST_FADE_MS,
                mode: Clutter.AnimationMode.EASE_IN_QUAD
            });
            return GLib.SOURCE_REMOVE;
        });
    }
}
