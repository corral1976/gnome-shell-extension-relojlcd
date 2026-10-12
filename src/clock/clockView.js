import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { calculateRetroShadowOffset } from '../shared/renderMath.js';
import { calculateRowPixelWidth, resolveGlyphStyleOptions } from '../shared/glyphAssets.js';
import { ClockDisplay } from '../ui/clockDisplay.js';
import { ClockHost, getClampedWidgetPosition } from '../ui/clockHost.js';
import { DateTooltip } from '../ui/dateTooltip.js';
import { COMPACT_HORIZONTAL_PADDING, readLayoutFlags } from './clockConfig.js';
import { DisplayEffects } from './displayEffects.js';
import { calculateTickDelayMs, formatAccessibleTime, formatTime } from './timeFormat.js';

const COMPACT_MIN_FONT_SIZE = 0.4;
const LABEL_HORIZONTAL_MARGIN = 8;
const CONTAINER_BORDER_WIDTH = 2;
const STYLE_UPDATE_DEBOUNCE_MS = 50;
const POST_BUILD_REFRESH_MS = 100;

export class ClockView {
    #extension;
    #settings;
    #alarmManager;
    #display;
    #host;
    #effects;
    #tooltip;
    #rasterScale;
    #effectiveFontSize = 0;
    #lastMinute = -1;
    #themeContextId = 0;
    #clockTimeoutId = null;
    #styleUpdateDebounceId = null;
    #panelFitIdleId = null;
    #initTimeoutId = null;

    constructor(extension, settings, alarmManager, textureCache) {
        this.#extension = extension;
        this.#settings = settings;
        this.#alarmManager = alarmManager;
        this.#host = null;

        this.#rasterScale = this.#getRasterScale();
        this.#display = new ClockDisplay(settings, textureCache, this.#rasterScale, this.#getEffectiveFontSize());
        this.#host = new ClockHost(extension, settings, alarmManager, this.#display.actor, () => this.#schedulePanelFit());
        this.#effects = new DisplayEffects(settings, this.#display, alarmManager);
        this.#tooltip = new DateTooltip(settings, this.#host.actor);

        this.#updateAlarmDot();
        this.#updateStyle();

        this.#themeContextId = St.ThemeContext.get_for_stage(global.stage).connect('changed', () => this.#updateStyle());

        settings.connectObject(
            'changed::font-size', () => this.#scheduleStyleUpdate(),
            'changed::clock-color', () => { this.#updateStyle(); this.#updateClock(); this.#effects.updateFlicker(); },
            'changed::custom-color', () => { this.#updateStyle(); this.#updateClock(); },
            'changed::show-frame', () => this.#updateStyle(),
            'changed::glow-intensity', () => this.#scheduleStyleUpdate(),
            'changed::show-seconds', () => { this.#updateClock(); this.#updateStyle(); },
            'changed::show-date', () => { this.#updateClock(); this.#updateStyle(); },
            'changed::date-format', () => this.#updateClock(),
            'changed::vertical-panel-layout', () => { this.#updateClock(); this.#updateStyle(); },
            'changed::blink-dots', () => this.#updateClock(),
            'changed::clock-format-24h', () => { this.#updateClock(); this.#updateStyle(); },
            'changed::flicker-enabled', () => this.#effects.updateFlicker(),
            'changed::font-style', () => { this.#updateStyle(); this.#updateClock(); },
            'changed::sharp-digits', () => this.#updateClock(),
            'changed::ghost-segments', () => { this.#display.updateGhostOpacity(); this.#updateAlarmDot(); },
            'changed::crt-scanlines', () => this.#display.updateScanlines(),
            this
        );

        this.#updateClock();
        this.#effects.updateFlicker();
        if (alarmManager.isRinging)
            this.#effects.startAlarmBlink();

        this.#initTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POST_BUILD_REFRESH_MS, () => {
            this.#initTimeoutId = null;
            this.#updateClock();
            this.#effects.updateFlicker();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        this.#settings.disconnectObject(this);
        St.ThemeContext.get_for_stage(global.stage).disconnect(this.#themeContextId);
        this.#themeContextId = 0;

        if (this.#clockTimeoutId) {
            GLib.Source.remove(this.#clockTimeoutId);
            this.#clockTimeoutId = null;
        }

        if (this.#styleUpdateDebounceId) {
            GLib.Source.remove(this.#styleUpdateDebounceId);
            this.#styleUpdateDebounceId = null;
        }

        if (this.#panelFitIdleId) {
            GLib.Source.remove(this.#panelFitIdleId);
            this.#panelFitIdleId = null;
        }

        if (this.#initTimeoutId) {
            GLib.Source.remove(this.#initTimeoutId);
            this.#initTimeoutId = null;
        }

        this.#tooltip.destroy();
        this.#tooltip = null;
        this.#effects.destroy();
        this.#effects = null;
        this.#display.destroy();
        this.#display = null;
        this.#host.destroy();
        this.#host = null;
    }

    runLampTest() {
        this.#effects.runLampTest();
    }

    refreshAlarms() {
        this.#updateAlarmDot();
        this.#updateClock();
    }

    setRinging(isRinging) {
        if (isRinging) {
            this.#effects.startAlarmBlink();
            return;
        }

        this.#effects.stopAlarmBlink();
        this.#display.clockLabel.set_opacity(255);
        this.#updateStyle();
        this.#display.alarmDotWrapper.set_opacity(255);
        this.#effects.updateFlicker();
    }

    #updateAlarmDot() {
        this.#display.updateAlarmDot(this.#alarmManager.hasEnabledAlarm);
    }

    #updateStyle() {
        this.#effectiveFontSize = this.#getEffectiveFontSize();
        this.#display.updateStyle(this.#effectiveFontSize);
    }

    #scheduleStyleUpdate() {
        if (this.#styleUpdateDebounceId) {
            GLib.Source.remove(this.#styleUpdateDebounceId);
            this.#styleUpdateDebounceId = null;
        }
        this.#styleUpdateDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, STYLE_UPDATE_DEBOUNCE_MS, () => {
            this.#styleUpdateDebounceId = null;
            this.#updateStyle();
            this.#updateClock();
            return GLib.SOURCE_REMOVE;
        });
    }

    #schedulePanelFit() {
        if (this.#panelFitIdleId) return;
        this.#panelFitIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.#panelFitIdleId = null;
            if (this.#getEffectiveFontSize() === this.#effectiveFontSize) return GLib.SOURCE_REMOVE;
            this.#updateStyle();
            this.#updateClock();
            return GLib.SOURCE_REMOVE;
        });
    }

    #updateClock() {
        if (this.#clockTimeoutId) {
            GLib.Source.remove(this.#clockTimeoutId);
            this.#clockTimeoutId = null;
        }

        const now = GLib.DateTime.new_now_local();
        const blink = this.#settings.get_boolean('blink-dots');
        this.#clockTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, calculateTickDelayMs(now.get_microsecond(), blink), () => {
                this.#clockTimeoutId = null;
                this.#updateClock();
                return GLib.SOURCE_REMOVE;
            });

        this.#renderTime(now, blink);
    }

    #renderTime(now, blink) {
        const layout = readLayoutFlags(this.#settings);
        const fontSize = this.#getEffectiveFontSize();

        if (this.#applyRasterScale())
            this.#updateStyle();

        const timeStr = formatTime(now, layout, blink, this.#settings.get_string('date-format'));

        const currentMinute = now.get_minute();
        if (this.#settings.get_boolean('minute-flicker') && !this.#alarmManager.isRinging &&
            this.#lastMinute !== -1 && currentMinute !== this.#lastMinute) {
            this.#effects.playMinuteFlicker();
        }
        this.#lastMinute = currentMinute;

        this.#display.setTime(timeStr, fontSize);
        this.#host.actor.accessible_name = formatAccessibleTime(now, layout.is24h, this.#extension.metadata.name);
        this.#alarmManager.checkAlarms(now);
    }

    #getRasterScale() {
        if (!this.#settings.get_boolean('sharp-digits')) return 1;

        let monitor = Main.layoutManager.primaryMonitor;
        if (this.#settings.get_boolean('is-widget')) {
            const [x, y] = this.#host
                ? [this.#host.actor.x, this.#host.actor.y]
                : getClampedWidgetPosition(this.#settings);
            monitor = Main.layoutManager.monitors.find(candidate =>
                x >= candidate.x && x < candidate.x + candidate.width &&
                y >= candidate.y && y < candidate.y + candidate.height) ?? monitor;
        }
        return Math.max(1, global.display.get_monitor_scale(monitor.index));
    }

    #applyRasterScale() {
        const scale = this.#getRasterScale();
        if (scale === this.#rasterScale) return false;

        this.#rasterScale = scale;
        this.#display.setRasterScale(scale);
        return true;
    }

    #getEffectiveFontSize() {
        const fontSize = this.#settings.get_double('font-size');
        const parentWidth = readLayoutFlags(this.#settings).compact ? (this.#host?.getParentWidth() ?? 0) : 0;
        if (parentWidth <= 0) return fontSize;

        const italic = resolveGlyphStyleOptions(this.#settings.get_string('font-style')).italic;
        const glow = this.#settings.get_double('glow-intensity');
        const shadowOffset = this.#settings.get_string('clock-color') === 'gray' && glow >= 1
            ? calculateRetroShadowOffset(glow, fontSize)
            : 0;
        const availableWidth = parentWidth - this.#host.getHorizontalPadding() -
            2 * COMPACT_HORIZONTAL_PADDING - CONTAINER_BORDER_WIDTH - LABEL_HORIZONTAL_MARGIN - shadowOffset;
        const naturalWidth = calculateRowPixelWidth(fontSize, '88', italic);
        if (availableWidth >= naturalWidth) return fontSize;

        const fitted = Math.floor(fontSize * Math.max(0, availableWidth) / naturalWidth * 20) / 20;
        return Math.min(fontSize, Math.max(COMPACT_MIN_FONT_SIZE, fitted));
    }
}
