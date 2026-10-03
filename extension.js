import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Atk from 'gi://Atk';
import GObject from 'gi://GObject';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import { buildCustomTheme, buildTheme, PRESET_COLORS } from './colorUtils.js';
import {
    calculateRetroShadowOffset,
    RETRO_SHADOW_RGBA
} from './renderMath.js';
import { AlarmManager } from './alarmManager.js';
import { GlyphTextureCache } from './glyphTexture.js';
import { SevenSegmentRow } from './sevenSegmentRow.js';
import {
    resolveGlyphStyleOptions,
    calculateCellPixelHeight,
    calculateCellPixelWidth,
    calculateRowPixelWidth,
    getGlyphAspectRatio
} from './glyphAssets.js';

const THEME_MAP = {
    gray: {
        main: '#000000',
        bg: 'rgba(120, 150, 100, 0.95)',
        border: '#6a8a5a'
    },
    ...Object.fromEntries(
        Object.entries(PRESET_COLORS).map(([key, hex]) => [key, buildTheme(hex)])
    )
};

const COMPACT_HORIZONTAL_PADDING = 3;
const COMPACT_MIN_FONT_SIZE = 0.4;
const LABEL_HORIZONTAL_MARGIN = 8;
const CONTAINER_BORDER_WIDTH = 2;
const GHOST_SEGMENTS_OPACITY = 30;
const ALARM_ICON_MIN_RASTER_SIZE = 48;
const LAMP_TEST_PEAK_OPACITY = 220;
const LAMP_TEST_PAUSE_MS = 1800;
const LAMP_TEST_FADE_MS = 700;
const MINUTE_FLICKER_DIP_OPACITY = 90;
const MINUTE_FLICKER_DIP_MS = 60;
const MINUTE_FLICKER_RESTORE_MS = 140;
const SCANLINES_OPACITY = 0.15;
const SCANLINES_LINE_RATIO = 0.08;
const SCANLINES_MIN_SPACING = 2;
const ALARM_BLINK_INTERVAL_MS = 500;
const ALARM_BLINK_DIM_OPACITY = 40;
const DATE_FORMATS = {
    dmy: '%d-%m-%Y',
    mdy: '%m-%d-%Y',
    ymd: '%Y-%m-%d'
};
const CLOCK_TICK_INTERVAL_MS = 1000;
const CLOCK_BLINK_TICK_INTERVAL_MS = 500;
const CLOCK_TICK_MARGIN_MS = 10;
const BLINK_ON_MICROSECONDS = 500000;

function calculateTickDelayMs(microsecond, intervalMs) {
    const elapsedMs = Math.floor(microsecond / 1000) % intervalMs;
    return intervalMs - elapsedMs + CLOCK_TICK_MARGIN_MS;
}

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

const RelojLCDIndicator = GObject.registerClass(
{ GTypeName: 'RelojLCDIndicator' },
class RelojLCDIndicator extends PanelMenu.Button {
    _init(name, settings, openPreferences, isAlarming, stopAlarm) {
        super._init(0.5, name, false);

        this._settings = settings;
        this._openPreferences = openPreferences;
        this._isAlarming = isAlarming;
        this._stopAlarm = stopAlarm;
        this.menu.sourceActor = this;
        this._colorMenuItems = new Map();

        this._buildQuickColorMenu();

        this._menuOpenStateId = this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen) this._refreshQuickColorMenu();
        });

        this._capturedEventId = this.connect('captured-event', (actor, event) => {
            if (!this._isAlarming()) return Clutter.EVENT_PROPAGATE;

            switch (event.type()) {
            case Clutter.EventType.BUTTON_PRESS:
            case Clutter.EventType.TOUCH_BEGIN:
                return Clutter.EVENT_STOP;
            case Clutter.EventType.BUTTON_RELEASE:
            case Clutter.EventType.TOUCH_END:
                this._stopAlarm();
                return Clutter.EVENT_STOP;
            default:
                return Clutter.EVENT_PROPAGATE;
            }
        });

        this._clickHandlerId = this.connect('button-release-event', () => {
            this.menu.toggle();
            return Clutter.EVENT_STOP;
        });
    }

    destroy() {
        if (this._capturedEventId) {
            this.disconnect(this._capturedEventId);
            this._capturedEventId = 0;
        }
        if (this._clickHandlerId) {
            this.disconnect(this._clickHandlerId);
            this._clickHandlerId = 0;
        }
        if (this._menuOpenStateId) {
            this.menu.disconnect(this._menuOpenStateId);
            this._menuOpenStateId = 0;
        }
        super.destroy();
    }

    _buildQuickColorMenu() {
        const colorEntries = [
            ['green', _('Neon Green')],
            ['amber', _('Vintage Amber')],
            ['gray', _('Retro LCD')],
            ['ruby', _('Red Ruby')],
            ['sapphire', _('Blue Sapphire')],
            ['white', _('White LED')],
            ['violet', _('Violet Purple')],
            ['gold', _('Gold')],
            ['teal', _('VFD Teal')],
            ['orange', _('Nixie Orange')]
        ];

        for (const [key, label] of colorEntries) {
            const colorMenuItem = new PopupMenu.PopupMenuItem(label);
            const swatchHex = key === 'gray' ? '#6a8a5a' : (PRESET_COLORS[key] || '#ffffff');
            colorMenuItem.label.set_style(`color: ${swatchHex}; font-weight: bold;`);
            colorMenuItem.connect('activate', () => {
                this._settings.set_string('clock-color', key);
            });
            this.menu.addMenuItem(colorMenuItem);
            this._colorMenuItems.set(key, colorMenuItem);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const prefsItem = new PopupMenu.PopupMenuItem(_('More Settings…'));
        prefsItem.connect('activate', () => this._openPreferences());
        this.menu.addMenuItem(prefsItem);

        this._refreshQuickColorMenu();
    }

    _refreshQuickColorMenu() {
        const currentColor = this._settings.get_string('clock-color');
        for (const [key, item] of this._colorMenuItems)
            item.setOrnament(key === currentColor ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
    }
});

export default class RelojLCDExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._alarmManager = null;
        this._alarmBlinkState = true;
        this._clockTimeoutId = null;
        this._blinkTimeoutId = null;
        this._initTimeoutId = null;
        this._panelFitIdleId = null;
        this._effectiveFontSize = 0;
        this._flickerTimeoutId = null;
        this._styleUpdateDebounceId = null;
        this._isChromeIndicator = false;
        this._dragGrab = null;
        this._dragHandler = null;
        this._releaseHandler = null;
        this._signals = [];
        this._alarmDot = null;
        this._alarmDotShadow = null;
        this._alarmDotWrapper = null;
        this._themeContextId = null;
        this._teardownInProgress = false;
        this._skipInitialRedraw = false;
        this._ghostLabel = null;
        this._lampTestTimeoutId = null;
        this._lampTestMappedId = null;
        this._lampTestIdleId = null;
        this._lastMinute = -1;
        this._scanlinesActor = null;
        this._scanlinesLastHeight = 0;
        this._displayWrapper = null;
        this._glyphTextureCache = null;
        this._horizontalCenteringOffset = 0;
        this._retroShadowOffset = 0;
        this._rasterScale = 1;

        this._alarmManager = new AlarmManager(this._settings, {
            title: this.metadata.name,
            onRingingChanged: isRinging => this._onAlarmRingingChanged(isRinging),
            onAlarmsChanged: () => { this._updateAlarmDot(); this._updateClock(); }
        });

        this._glyphTextureCache = new GlyphTextureCache();
        this._buildIndicator();

        Main.layoutManager.connectObject('monitors-changed', () => this._relocateWidget(), this);

        this._settings.connectObject(
            'changed::font-size', () => this._scheduleStyleUpdate(),
            'changed::clock-color', () => this._updateStyle(),
            'changed::custom-color', () => this._updateStyle(),
            'changed::show-frame', () => this._updateStyle(),
            'changed::glow-intensity', () => this._scheduleStyleUpdate(),
            'changed::show-seconds', () => { this._updateClock(); this._updateStyle(); },
            'changed::show-date', () => { this._updateClock(); this._updateStyle(); },
            'changed::date-format', () => this._updateClock(),
            'changed::vertical-panel-layout', () => { this._updateClock(); this._updateStyle(); },
            'changed::blink-dots', () => this._updateClock(),
            'changed::clock-format-24h', () => { this._updateClock(); this._updateStyle(); },
            'changed::panel-position', () => this._resetView(),
            'changed::is-widget', () => this._resetView(),
            'changed::flicker-enabled', () => this._updateFlicker(),
            'changed::font-style', () => this._updateStyle(),
            'changed::sharp-digits', () => this._updateClock(),
            'changed::ghost-segments', () => { this._updateGhostOpacity(); this._updateAlarmDot(); },
            'changed::crt-scanlines', () => this._updateScanlines(),
            this
        );

        this._updateClock();
        this._updateFlicker();
        this._runLampTest();
        this._checkVersionAndNotify();
    }

    disable() {
        Main.layoutManager.disconnectObject(this);
        this._teardownInProgress = true;
        this._alarmManager.destroy();
        this._alarmManager = null;
        this._stopAlarmBlink();

        this._removeClockTimeout();
        this._removeFlickerTimeout();
        this._removeStyleUpdateDebounce();

        if (this._lampTestTimeoutId) {
            GLib.Source.remove(this._lampTestTimeoutId);
            this._lampTestTimeoutId = null;
        }

        if (this._lampTestMappedId) {
            this._ghostLabel?.disconnect(this._lampTestMappedId);
            this._lampTestMappedId = null;
        }

        if (this._lampTestIdleId) {
            GLib.Source.remove(this._lampTestIdleId);
            this._lampTestIdleId = null;
        }

        if (this._themeContextId) {
            const themeContext = St.ThemeContext.get_for_stage(global.stage);
            themeContext.disconnect(this._themeContextId);
            this._themeContextId = null;
        }

        if (this._initTimeoutId) {
            GLib.Source.remove(this._initTimeoutId);
            this._initTimeoutId = null;
        }

        this._removePanelFitIdle();
        this._disconnectIndicatorSignals();

        this._clockLabel?.destroy();
        this._clockLabel = null;

        this._shadowLabel?.destroy();
        this._shadowLabel = null;

        this._ghostLabel?.destroy();
        this._ghostLabel = null;

        this._scanlinesActor?.destroy();
        this._scanlinesActor = null;
        this._scanlinesLastHeight = 0;

        this._alarmDot?.destroy();
        this._alarmDot = null;

        this._alarmDotShadow?.destroy();
        this._alarmDotShadow = null;

        this._alarmDotWrapper?.destroy();
        this._alarmDotWrapper = null;

        this._clockContainer?.destroy();
        this._clockContainer = null;

        this._container?.destroy();
        this._container = null;

        this._displayWrapper?.destroy();
        this._displayWrapper = null;

        if (this._indicator) {
            if (this._isChromeIndicator) Main.layoutManager.removeChrome(this._indicator);
            this._indicator.destroy();
            this._indicator = null;
        }

        this._settings?.disconnectObject(this);
        this._settings = null;

        this._glyphTextureCache?.clear();
        this._glyphTextureCache = null;

        this._lastMinute = -1;
    }

    _connect(obj, signal, callback) {
        const id = obj.connect(signal, callback);
        this._signals.push({ obj, id });
        return id;
    }

    _disconnectIndicatorSignals() {
        if (this._dragGrab) {
            this._dragGrab.dismiss();
            this._dragGrab = null;
        }

        if (this._indicator && this._dragHandler) {
            this._indicator.disconnect(this._dragHandler);
            this._dragHandler = null;
        }

        if (this._indicator && this._releaseHandler) {
            this._indicator.disconnect(this._releaseHandler);
            this._releaseHandler = null;
        }

        for (const { obj, id } of this._signals)
            obj.disconnect(id);
        this._signals = [];
    }

    _resetView() {
        this._teardownInProgress = true;
        this._removePanelFitIdle();
        this._disconnectIndicatorSignals();

        if (this._themeContextId) {
            const themeContext = St.ThemeContext.get_for_stage(global.stage);
            themeContext.disconnect(this._themeContextId);
            this._themeContextId = null;
        }
        this._clockContainer = null;
        this._clockLabel = null;
        this._shadowLabel = null;
        this._ghostLabel = null;
        this._scanlinesActor = null;
        this._scanlinesLastHeight = 0;
        this._container = null;
        this._displayWrapper = null;
        this._alarmDot = null;
        this._alarmDotShadow = null;
        this._alarmDotWrapper = null;
        this._horizontalCenteringOffset = 0;
        this._retroShadowOffset = 0;

        if (this._indicator) {
            if (this._isChromeIndicator) Main.layoutManager.removeChrome(this._indicator);
            this._indicator.destroy();
            this._indicator = null;
        }

        this._teardownInProgress = false;
        this._buildIndicator();
        this._updateFlicker();
    }

    _removeClockTimeout() {
        if (this._clockTimeoutId) {
            GLib.Source.remove(this._clockTimeoutId);
            this._clockTimeoutId = null;
        }
    }

    _removeFlickerTimeout() {
        if (this._flickerTimeoutId) {
            GLib.Source.remove(this._flickerTimeoutId);
            this._flickerTimeoutId = null;
        }
    }

    _removeStyleUpdateDebounce() {
        if (this._styleUpdateDebounceId) {
            GLib.Source.remove(this._styleUpdateDebounceId);
            this._styleUpdateDebounceId = null;
        }
    }

    _scheduleStyleUpdate() {
        this._removeStyleUpdateDebounce();
        this._styleUpdateDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            this._styleUpdateDebounceId = null;
            this._updateStyle();
            return GLib.SOURCE_REMOVE;
        });
    }

    _addFlickerTimeout(interval, callback) {
        this._removeFlickerTimeout();
        this._flickerTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, callback);
    }

    _updateFlicker() {
        this._removeFlickerTimeout();

        if (!this._settings.get_boolean('flicker-enabled') || this._alarmManager.isRinging) {
            if (this._clockLabel) {
                this._clockLabel.set_opacity(255);
            }
            if (this._shadowLabel) {
                this._shadowLabel.set_opacity(255);
            }
            return;
        }

        const colorType = this._settings.get_string('clock-color');
        const isRetro = colorType === 'gray';
        const thresholds = FLICKER_THRESHOLDS[colorType] || FLICKER_THRESHOLDS.default;

        const flicker = () => {
            if (this._teardownInProgress || !this._settings || !this._clockLabel || !this._settings.get_boolean('flicker-enabled') || this._alarmManager.isRinging) {
                this._flickerTimeoutId = null;
                return GLib.SOURCE_REMOVE;
            }

            const random = Math.random();
            const opacity = thresholds.find(t => random < t.threshold)?.opacity || 255;

            this._clockLabel.set_opacity(opacity);

            if (isRetro && this._shadowLabel) {
                this._shadowLabel.set_opacity(opacity);
            }

            const nextInterval = 50 + Math.floor(Math.random() * 150);
            this._addFlickerTimeout(nextInterval, flicker);
            return GLib.SOURCE_REMOVE;
        };

        this._addFlickerTimeout(100, flicker);
    }

    _updateGhostOpacity() {
        if (!this._ghostLabel) return;
        this._ghostLabel.set_opacity(this._settings.get_boolean('ghost-segments') ? GHOST_SEGMENTS_OPACITY : 0);
    }

    _updateScanlines() {
        if (!this._scanlinesActor) return;
        this._scanlinesActor.visible = this._settings.get_boolean('crt-scanlines');
    }

    _removePanelFitIdle() {
        if (this._panelFitIdleId) {
            GLib.Source.remove(this._panelFitIdleId);
            this._panelFitIdleId = null;
        }
    }

    _isCompactLayout() {
        return !this._settings.get_boolean('is-widget') && this._settings.get_boolean('vertical-panel-layout');
    }

    _getRasterScale() {
        if (!this._settings.get_boolean('sharp-digits')) return 1;

        let monitor = Main.layoutManager.primaryMonitor;
        if (this._settings.get_boolean('is-widget')) {
            const [x, y] = this._indicator
                ? [this._indicator.x, this._indicator.y]
                : this._getClampedWidgetPosition();
            monitor = Main.layoutManager.monitors.find(candidate =>
                x >= candidate.x && x < candidate.x + candidate.width &&
                y >= candidate.y && y < candidate.y + candidate.height) ?? monitor;
        }
        return Math.max(1, global.display.get_monitor_scale(monitor.index));
    }

    _applyRasterScale() {
        const scale = this._getRasterScale();
        if (scale === this._rasterScale) return false;

        this._rasterScale = scale;
        this._clockLabel?.setRasterScale(scale);
        this._shadowLabel?.setRasterScale(scale);
        this._ghostLabel?.setRasterScale(scale);
        return true;
    }

    _getEffectiveFontSize() {
        const fontSize = this._settings.get_double('font-size');
        const parentWidth = this._isCompactLayout() ? (this._indicator?.get_parent()?.get_width() ?? 0) : 0;
        if (parentWidth <= 0) return fontSize;

        const italic = resolveGlyphStyleOptions(this._settings.get_string('font-style')).italic;
        const glow = this._settings.get_double('glow-intensity');
        const shadowOffset = this._settings.get_string('clock-color') === 'gray' && glow >= 1
            ? calculateRetroShadowOffset(glow, fontSize)
            : 0;
        const availableWidth = parentWidth - this._indicator.get_theme_node().get_horizontal_padding() -
            2 * COMPACT_HORIZONTAL_PADDING - CONTAINER_BORDER_WIDTH - LABEL_HORIZONTAL_MARGIN - shadowOffset;
        const naturalWidth = calculateRowPixelWidth(fontSize, '88', italic);
        if (availableWidth >= naturalWidth) return fontSize;

        const fitted = Math.floor(fontSize * Math.max(0, availableWidth) / naturalWidth * 20) / 20;
        return Math.min(fontSize, Math.max(COMPACT_MIN_FONT_SIZE, fitted));
    }

    _schedulePanelFit() {
        if (this._panelFitIdleId) return;
        this._panelFitIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._panelFitIdleId = null;
            if (this._teardownInProgress || !this._settings || !this._clockLabel) return GLib.SOURCE_REMOVE;
            if (this._getEffectiveFontSize() === this._effectiveFontSize) return GLib.SOURCE_REMOVE;
            this._updateStyle();
            this._updateClock();
            return GLib.SOURCE_REMOVE;
        });
    }

    _updateHorizontalCentering() {
        if (!this._clockContainer || !this._clockLabel || !this._ghostLabel || !this._shadowLabel) return;

        const [availableWidth] = this._clockContainer.get_size();
        if (availableWidth <= 0) return;

        const [, naturalWidth] = this._clockLabel.get_preferred_width(-1);
        const overflow = Math.max(0, naturalWidth - availableWidth);
        this._horizontalCenteringOffset = -overflow / 2;
        this._clockContainer.clip_to_allocation = overflow > 0.5;

        this._clockLabel.set_translation(this._horizontalCenteringOffset, 0, 0);
        this._ghostLabel.set_translation(this._horizontalCenteringOffset, 0, 0);
        this._applyShadowLabelTranslation();
    }

    _applyShadowLabelTranslation() {
        if (!this._shadowLabel) return;
        this._shadowLabel.set_translation(
            this._horizontalCenteringOffset + this._retroShadowOffset,
            this._retroShadowOffset,
            0);
    }

    _rebuildScanlines(height) {
        this._scanlinesActor.remove_all_children();

        const lineSpacing = Math.max(SCANLINES_MIN_SPACING, Math.round(height * SCANLINES_LINE_RATIO));
        const barCount = Math.floor(height / lineSpacing);
        this._scanlinesActor.layout_manager.spacing = Math.max(0, lineSpacing - 1);

        for (let i = 0; i < barCount; i++) {
            this._scanlinesActor.add_child(new St.Widget({
                style: `background-color: rgba(0, 0, 0, ${SCANLINES_OPACITY}); height: 1px;`,
                x_expand: true
            }));
        }
    }

    _runLampTest() {
        if (!this._settings.get_boolean('startup-lamp-test') || !this._ghostLabel) return;

        if (this._ghostLabel.mapped) {
            this._scheduleLampTest();
            return;
        }

        this._lampTestMappedId = this._ghostLabel.connect('notify::mapped', () => {
            this._ghostLabel.disconnect(this._lampTestMappedId);
            this._lampTestMappedId = null;
            this._scheduleLampTest();
        });
    }

    _scheduleLampTest() {
        this._lampTestIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._lampTestIdleId = null;
            this._startLampTest();
            return GLib.SOURCE_REMOVE;
        });
    }

    _startLampTest() {
        this._ghostLabel.set_opacity(LAMP_TEST_PEAK_OPACITY);

        this._lampTestTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, LAMP_TEST_PAUSE_MS, () => {
            this._lampTestTimeoutId = null;
            this._ghostLabel?.ease({
                opacity: this._settings.get_boolean('ghost-segments') ? GHOST_SEGMENTS_OPACITY : 0,
                duration: LAMP_TEST_FADE_MS,
                mode: Clutter.AnimationMode.EASE_IN_QUAD
            });
            return GLib.SOURCE_REMOVE;
        });
    }

    _checkVersionAndNotify() {
        const currentVersion = this.metadata.version.toString();
        const lastVersion = this._settings.get_string('last-version');
        this._settings.set_string('last-version', currentVersion);

        if (lastVersion === '' || lastVersion === currentVersion) return;

        const source = MessageTray.getSystemSource();
        const notification = new MessageTray.Notification({
            source,
            title: _('%s updated').format(this.metadata.name),
            body: _('Now running version %s.').format(currentVersion),
            gicon: Gio.ThemedIcon.new('preferences-system-time-symbolic')
        });
        source.addNotification(notification);
    }

    _playMinuteFlicker() {
        this._clockLabel.ease({
            opacity: MINUTE_FLICKER_DIP_OPACITY,
            duration: MINUTE_FLICKER_DIP_MS,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                this._clockLabel?.ease({
                    opacity: 255,
                    duration: MINUTE_FLICKER_RESTORE_MS,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD
                });
            }
        });
    }

    _relocateWidget() {
        if (!this._isChromeIndicator || !this._indicator) return;

        const [x, y] = this._getClampedWidgetPosition();
        this._indicator.set_position(x, y);
    }

    _getClampedWidgetPosition() {
        const x = this._settings.get_int('widget-x');
        const y = this._settings.get_int('widget-y');

        const isOnAnyMonitor = Main.layoutManager.monitors.some(monitor =>
            x >= monitor.x && x < monitor.x + monitor.width &&
            y >= monitor.y && y < monitor.y + monitor.height
        );

        if (isOnAnyMonitor) return [x, y];

        const primary = Main.layoutManager.primaryMonitor;
        return [primary.x + 100, primary.y + 100];
    }

    _setupDragHandlers(actor) {
        this._connect(actor, 'button-press-event', (actor, event) => {
            if (this._alarmManager.isRinging) {
                this._alarmManager.stopRinging();
                return Clutter.EVENT_STOP;
            }

            if (event.get_button() === Clutter.BUTTON_PRIMARY) {
                let [x, y] = event.get_coords();
                let [sx, sy] = actor.get_transformed_position();
                let grabX = x - sx;
                let grabY = y - sy;

                this._dragGrab = global.stage.grab(actor);

                this._dragHandler = actor.connect('motion-event', (dragActor, motionEvent) => {
                    let [mx, my] = motionEvent.get_coords();
                    let [width, height] = dragActor.get_size();
                    let monitor = Main.layoutManager.currentMonitor;

                    let newX = Math.max(monitor.x, Math.min(mx - grabX, monitor.x + monitor.width - width));
                    let newY = Math.max(monitor.y, Math.min(my - grabY, monitor.y + monitor.height - height));

                    dragActor.set_position(newX, newY);
                    return Clutter.EVENT_STOP;
                });

                this._releaseHandler = actor.connect('button-release-event', (dragActor, releaseEvent) => {
                    if (releaseEvent.get_button() === Clutter.BUTTON_PRIMARY) {
                        let [newX, newY] = dragActor.get_position();
                        this._settings.set_int('widget-x', newX);
                        this._settings.set_int('widget-y', newY);
                        if (this._dragGrab) {
                            this._dragGrab.dismiss();
                            this._dragGrab = null;
                        }
                        if (this._dragHandler) {
                            dragActor.disconnect(this._dragHandler);
                            this._dragHandler = null;
                        }
                        if (this._releaseHandler) {
                            dragActor.disconnect(this._releaseHandler);
                            this._releaseHandler = null;
                        }
                        return Clutter.EVENT_STOP;
                    }
                    return Clutter.EVENT_PROPAGATE;
                });

                return Clutter.EVENT_STOP;
            }

            if (event.get_button() === Clutter.BUTTON_SECONDARY) {
                this.openPreferences();
                return Clutter.EVENT_STOP;
            }

            return Clutter.EVENT_PROPAGATE;
        });
    }

    _buildIndicator() {
        this._skipInitialRedraw = true;
        const isWidget = this._settings.get_boolean('is-widget');
        const compact = !isWidget && this._settings.get_boolean('vertical-panel-layout');
        const showSeconds = compact ? false : this._settings.get_boolean('show-seconds');
        const showDate = compact ? false : this._settings.get_boolean('show-date');
        const is24h = this._settings.get_boolean('clock-format-24h');
        const glyphOptions = resolveGlyphStyleOptions(this._settings.get_string('font-style'));
        this._rasterScale = this._getRasterScale();

        this._clockLabel = new SevenSegmentRow(this._glyphTextureCache, {
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            style_class: 'reloj-lcd-label'
        });
        this._clockLabel.setRasterScale(this._rasterScale);
        this._clockLabel.setText(
            this._getPlaceholderText(showSeconds, showDate, isWidget, is24h, compact),
            this._getTheme(this._settings.get_string('clock-color')).main,
            this._getEffectiveFontSize(),
            glyphOptions);

        this._shadowLabel = new SevenSegmentRow(this._glyphTextureCache, {
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            style_class: 'reloj-lcd-shadow-label'
        });
        this._shadowLabel.setRasterScale(this._rasterScale);
        this._shadowLabel.setText(
            this._getPlaceholderText(showSeconds, showDate, isWidget, is24h, compact),
            RETRO_SHADOW_RGBA,
            this._getEffectiveFontSize(),
            glyphOptions);

        this._ghostLabel = new SevenSegmentRow(this._glyphTextureCache, {
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            opacity: 0,
            style_class: 'reloj-lcd-ghost-label'
        });
        this._ghostLabel.setRasterScale(this._rasterScale);
        this._ghostLabel.setText(
            this._getPlaceholderText(showSeconds, showDate, isWidget, is24h, compact),
            this._getTheme(this._settings.get_string('clock-color')).main,
            this._getEffectiveFontSize(),
            glyphOptions);

        this._scanlinesActor = new St.Widget({
            layout_manager: new Clutter.BoxLayout({ orientation: Clutter.Orientation.VERTICAL }),
            reactive: false,
            visible: this._settings.get_boolean('crt-scanlines'),
            x_expand: true,
            y_expand: true,
            clip_to_allocation: true
        });

        this._connect(this._scanlinesActor, 'notify::allocation', () => {
            const [, height] = this._scanlinesActor.get_size();
            const roundedHeight = Math.round(height);
            if (roundedHeight > 0 && roundedHeight !== this._scanlinesLastHeight) {
                this._scanlinesLastHeight = roundedHeight;
                this._rebuildScanlines(roundedHeight);
            }
        });

        this._clockContainer = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            offscreen_redirect: Clutter.OffscreenRedirect.ALWAYS,
            x_align: Clutter.ActorAlign.CENTER
        });

        this._connect(this._clockContainer, 'notify::allocation', () => this._updateHorizontalCentering());

        this._clockContainer.add_child(this._ghostLabel);
        this._clockContainer.add_child(this._shadowLabel);
        this._clockContainer.add_child(this._clockLabel);
        this._ghostLabel.set_reactive(false);
        this._shadowLabel.set_reactive(false);
        this._clockLabel.set_reactive(false);
        this._clockContainer.set_child_above_sibling(this._shadowLabel, this._ghostLabel);
        this._clockContainer.set_child_above_sibling(this._clockLabel, this._shadowLabel);
        this._clockLabel.show();

        this._alarmDotShadow = new Clutter.Actor({
            reactive: false,
            visible: false,
            x_expand: false,
            y_expand: false,
            content_gravity: Clutter.ContentGravity.RESIZE_FILL,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });

        this._alarmDot = new Clutter.Actor({
            reactive: false,
            x_expand: false,
            y_expand: false,
            content_gravity: Clutter.ContentGravity.RESIZE_FILL,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });

        this._alarmDotWrapper = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            reactive: false,
            visible: false,
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER
        });
        this._alarmDotWrapper.add_child(this._alarmDotShadow);
        this._alarmDotWrapper.add_child(this._alarmDot);

        this._container = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            clip_to_allocation: false,
            x_expand: true,
            y_expand: true
        });

        this._container.add_child(this._alarmDotWrapper);
        this._container.add_child(this._clockContainer);
        this._updateAlarmDot();

        this._displayWrapper = new St.Widget({
            layout_manager: new Clutter.BinLayout()
        });
        this._displayWrapper.add_child(this._container);
        this._displayWrapper.add_child(this._scanlinesActor);
        this._displayWrapper.set_child_above_sibling(this._scanlinesActor, this._container);

        if (isWidget) {
            const [widgetX, widgetY] = this._getClampedWidgetPosition();
            this._indicator = new St.Bin({
                reactive: true,
                can_focus: true,
                track_hover: true,
                x: widgetX,
                y: widgetY
            });
            this._indicator.set_child(this._displayWrapper);
            this._setupDragHandlers(this._indicator);
            Main.layoutManager.addChrome(this._indicator);
            this._isChromeIndicator = true;
        } else {
            this._isChromeIndicator = false;
            const pos = this._settings.get_string('panel-position');
            this._indicator = new RelojLCDIndicator(
                this.metadata.name,
                this._settings,
                () => this.openPreferences(),
                () => this._alarmManager.isRinging,
                () => this._alarmManager.stopRinging()
            );
            this._displayWrapper.y_align = Clutter.ActorAlign.CENTER;
            this._displayWrapper.y_expand = false;
            this._indicator.add_child(this._displayWrapper);

            Main.panel.addToStatusArea(this.uuid, this._indicator, 1, pos);
            this._connect(this._indicator.get_parent(), 'notify::allocation', () => this._schedulePanelFit());
        }

        this._indicator.accessible_role = Atk.Role.PUSH_BUTTON;
        this._alarmDotWrapper.accessible_role = Atk.Role.ICON;
        this._alarmDotWrapper.accessible_name = _('Alarm active');

        this._updateStyle();
        this._skipInitialRedraw = false;

        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._themeContextId = themeContext.connect('changed', () => {
            if (this._teardownInProgress) return;
            this._updateStyle();
        });

        if (this._initTimeoutId) GLib.Source.remove(this._initTimeoutId);
        this._initTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._updateClock();
            this._updateFlicker();
            this._initTimeoutId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    _updateClock() {
        this._removeClockTimeout();

        const update = () => {
            this._clockTimeoutId = null;
            if (this._teardownInProgress || !this._settings || !this._clockLabel)
                return GLib.SOURCE_REMOVE;

            const now = GLib.DateTime.new_now_local();
            const blink = this._settings.get_boolean('blink-dots');
            const tickIntervalMs = blink ? CLOCK_BLINK_TICK_INTERVAL_MS : CLOCK_TICK_INTERVAL_MS;
            this._clockTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT, calculateTickDelayMs(now.get_microsecond(), tickIntervalMs), update);

            const is24h = this._settings.get_boolean('clock-format-24h');
            const isWidget = this._settings.get_boolean('is-widget');
            const compact = !isWidget && this._settings.get_boolean('vertical-panel-layout');
            const showSeconds = compact ? false : this._settings.get_boolean('show-seconds');
            const showDate = compact ? false : this._settings.get_boolean('show-date');
            const colorType = this._settings.get_string('clock-color');
            const glow = this._settings.get_double('glow-intensity');
            const fontSize = this._getEffectiveFontSize();
            const glyphOptions = resolveGlyphStyleOptions(this._settings.get_string('font-style'));

            if (this._applyRasterScale()) {
                this._updateStyle();
            }

            const timeStr = this._formatTime(now, is24h, showSeconds, showDate, isWidget, blink, compact);

            const currentMinute = now.get_minute();
            if (this._settings.get_boolean('minute-flicker') && !this._alarmManager.isRinging &&
                this._lastMinute !== -1 && currentMinute !== this._lastMinute) {
                this._playMinuteFlicker();
            }
            this._lastMinute = currentMinute;

            this._clockLabel.setText(timeStr, this._getTheme(colorType).main, fontSize, glyphOptions);
            if (this._shadowLabel && colorType === 'gray' && glow >= 1) {
                this._shadowLabel.setText(timeStr, RETRO_SHADOW_RGBA, fontSize, glyphOptions);
            }

            if (this._indicator) {
                this._indicator.accessible_name = this._formatAccessibleTime(now, is24h);
            }

            this._updateHorizontalCentering();
            this._alarmManager.checkAlarms(now);
            return GLib.SOURCE_REMOVE;
        };

        update();
    }

    _formatTime(now, is24h, showSeconds, showDate, isWidget, blink, compact = false) {
        if (compact) {
            const format = is24h ? '%H\n%M' : '%I\n%M';
            return now.format(format);
        }

        const separatorOn = !blink || now.get_microsecond() < BLINK_ON_MICROSECONDS;
        const sepChar = separatorOn ? ':' : ' ';
        const sep = ` ${sepChar} `;

        const meridiem = now.get_hour() < 12 ? 'AM' : 'PM';

        let timeStr;
        if (showSeconds) {
            const format = is24h ? `%H${sep}%M${sep}%S` : `%I${sep}%M${sep}%S ${meridiem}`;
            timeStr = now.format(format);
        } else {
            const format = is24h ? `%H${sep}%M` : `%I${sep}%M ${meridiem}`;
            timeStr = now.format(format);
        }

        if (showDate) {
            const dateStr = now.format(DATE_FORMATS[this._settings.get_string('date-format')]);
            if (isWidget) {
                timeStr = `${timeStr}\n${dateStr}`;
            } else {
                timeStr = `${timeStr}  --  ${dateStr}`;
            }
        }

        return timeStr;
    }

    _formatAccessibleTime(now, is24h) {
        const format = is24h ? '%H:%M' : '%I:%M %p';
        return `${this.metadata.name}, ${now.format(format)}`;
    }

    _updateAlarmDot() {
        if (!this._alarmDotWrapper || !this._settings) return;

        const hasEnabledAlarm = this._alarmManager.hasEnabledAlarm;
        const ghostEnabled = this._settings.get_boolean('ghost-segments');

        this._alarmDotWrapper.visible = hasEnabledAlarm || ghostEnabled;
        if (this._alarmDot) {
            this._alarmDot.opacity = hasEnabledAlarm ? 255 : GHOST_SEGMENTS_OPACITY;
        }
    }

    _onAlarmRingingChanged(isRinging) {
        if (isRinging) {
            this._startAlarmBlink();
            return;
        }

        this._stopAlarmBlink();

        if (this._clockLabel) {
            this._clockLabel.set_opacity(255);
            this._updateStyle();
        }
        if (this._alarmDotWrapper) {
            this._alarmDotWrapper.set_opacity(255);
        }
        this._updateFlicker();
    }

    _startAlarmBlink() {
        this._stopAlarmBlink();
        this._blinkTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ALARM_BLINK_INTERVAL_MS, () => {
            this._alarmBlinkState = !this._alarmBlinkState;
            const opacity = this._alarmBlinkState ? 255 : ALARM_BLINK_DIM_OPACITY;
            this._clockLabel.set_opacity(opacity);
            this._alarmDotWrapper.set_opacity(opacity);
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopAlarmBlink() {
        if (this._blinkTimeoutId) {
            GLib.Source.remove(this._blinkTimeoutId);
            this._blinkTimeoutId = null;
        }
    }

    _updateStyle() {
        if (this._teardownInProgress || !this._clockLabel || !this._shadowLabel || !this._settings) return;

        const config = this._getStyleConfig();
        const theme = this._getTheme(config.colorType);

        this._applyContainerOrientation(config);
        this._updateShadowLabelVisibility(config);
        const containerStyle = this._buildContainerStyle(config, theme);

        this._updateGhostLabel(config, theme);
        this._applyStyles(containerStyle, theme, config);
        this._updateHorizontalCentering();
    }

    _applyContainerOrientation(config) {
        if (this._container) {
            this._container.orientation = config.compact ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;
        }
        if (this._alarmDotWrapper) {
            this._alarmDotWrapper.x_align = config.compact ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START;
        }
    }

    _updateGhostLabel(config, theme) {
        if (!this._ghostLabel) return;

        if (!this._skipInitialRedraw) {
            this._ghostLabel.setText(
                this._getPlaceholderText(config.showSeconds, config.showDate, config.isWidget, config.is24h, config.compact),
                theme.main,
                config.fontSize,
                resolveGlyphStyleOptions(config.fontStyle));
        }
        this._updateGhostOpacity();
    }

    _getStyleConfig() {
        const isWidget = this._settings.get_boolean('is-widget');
        const compact = !isWidget && this._settings.get_boolean('vertical-panel-layout');
        const showSeconds = compact ? false : this._settings.get_boolean('show-seconds');
        const showDate = compact ? false : this._settings.get_boolean('show-date');
        const fontSize = this._getEffectiveFontSize();
        this._effectiveFontSize = fontSize;
        const colorType = this._settings.get_string('clock-color');
        const glow = this._settings.get_double('glow-intensity');
        return {
            fontSize: fontSize,
            colorType: colorType,
            glow: glow,
            showSeconds: showSeconds,
            showDate: showDate,
            isWidget: isWidget,
            is24h: this._settings.get_boolean('clock-format-24h'),
            compact: compact,
            fontStyle: this._settings.get_string('font-style'),
            showFrame: this._settings.get_boolean('show-frame'),
            horizontalPadding: compact ? COMPACT_HORIZONTAL_PADDING : this._calculateHorizontalPadding(fontSize, showSeconds, glow, colorType)
        };
    }

    _calculateHorizontalPadding(fontSize, showSeconds, glow, colorType) {
        const baseFontSize = 1.8;
        const basePadding = showSeconds ? 16 : 24;
        const minPadding = 6;
        const maxPadding = 50;
        const proportionalPadding = basePadding * (fontSize / baseFontSize);
        const isRetro = colorType === 'gray';
        const shadowSafetyMargin = isRetro && glow >= 1
            ? calculateRetroShadowOffset(glow, fontSize) + 4
            : 0;
        const padding = Math.max(proportionalPadding, shadowSafetyMargin);
        return Math.max(minPadding, Math.min(maxPadding, padding));
    }

    _getTheme(colorType) {
        if (colorType === 'custom') {
            return buildCustomTheme(this._settings.get_string('custom-color'));
        }
        return THEME_MAP[colorType] || THEME_MAP.green;
    }

    _updateShadowLabelVisibility(config) {
        if (!this._shadowLabel) return;

        const isRetro = config.colorType === 'gray';
        if (isRetro && config.glow >= 1) {
            this._retroShadowOffset = calculateRetroShadowOffset(config.glow, config.fontSize);
            this._applyShadowLabelTranslation();
            if (!this._skipInitialRedraw) {
                this._shadowLabel.setText(
                    this._getPlaceholderText(config.showSeconds, config.showDate, config.isWidget, config.is24h, config.compact),
                    RETRO_SHADOW_RGBA,
                    config.fontSize,
                    resolveGlyphStyleOptions(config.fontStyle));
            }
            this._shadowLabel.show();
        } else {
            this._retroShadowOffset = 0;
            this._shadowLabel.hide();
        }
    }

    _buildContainerStyle(config, theme) {
        const props = [
            `background-color: ${theme.bg}`,
            `border-radius: 8px`,
            `box-shadow: ${this._calculateBoxShadow(config.colorType, config.glow, theme)}`,
            `padding: 2px ${config.horizontalPadding.toFixed(1)}px`
        ];

        if (config.showFrame)
            props.push(`border: 1px solid ${theme.border}`);

        return props.join('; ') + ';';
    }

    _calculateBoxShadow(colorType, glow, theme) {
        if (colorType === 'gray' || glow <= 0) return 'none';

        const glowIntensity = glow / 10;
        const withAlpha = (rgba, alpha) => rgba.replace(/[\d.]+\)$/, `${alpha})`);
        const boxGlowColor = withAlpha(theme.glow, 0.1 + glowIntensity * 0.5);
        const blurSize = 5 + glowIntensity * 35;
        return `0 0 ${blurSize.toFixed(1)}px ${boxGlowColor}`;
    }

    _applyStyles(containerStyle, theme, config) {
        if (this._container) this._container.set_style(containerStyle);

        if (this._alarmDot && this._alarmDotWrapper)
            this._updateAlarmDotAppearance(config, theme);
    }

    _updateAlarmDotAppearance(config, theme) {
        const slotHeight = calculateCellPixelHeight(config.fontSize);
        const slotWidth = calculateCellPixelWidth(config.fontSize, '8');
        const isRetro = config.colorType === 'gray';
        const showGhostShadow = isRetro && config.glow >= 1;
        const shadowOffset = showGhostShadow ? calculateRetroShadowOffset(config.glow, config.fontSize) : 0;

        const glyphOptions = resolveGlyphStyleOptions(config.fontStyle);
        const iconOptions = { ...glyphOptions, bold: true };

        const iconAspect = getGlyphAspectRatio('alarm', glyphOptions.italic);
        const iconHeight = Math.max(1, Math.round(slotHeight));
        const iconWidth = Math.max(1, Math.round(slotHeight * iconAspect));

        const rasterWidth = Math.max(iconWidth * this._rasterScale, ALARM_ICON_MIN_RASTER_SIZE * iconAspect);
        const rasterHeight = Math.max(iconHeight * this._rasterScale, ALARM_ICON_MIN_RASTER_SIZE);

        this._alarmDotWrapper.set_size(Math.max(1, Math.round(slotWidth)), Math.max(1, Math.round(slotHeight)));
        const marginSide = config.compact ? 'margin-bottom' : 'margin-right';
        this._alarmDotWrapper.set_style(`${marginSide}: ${(slotWidth * 0.15).toFixed(1)}px;`);

        this._alarmDot.set_size(iconWidth, iconHeight);
        this._alarmDot.set_content(
            this._glyphTextureCache.getImage('alarm', theme.main, rasterWidth, rasterHeight, iconOptions));

        if (showGhostShadow) {
            this._alarmDotShadow.set_size(iconWidth, iconHeight);
            this._alarmDotShadow.set_content(
                this._glyphTextureCache.getImage('alarm', RETRO_SHADOW_RGBA, rasterWidth, rasterHeight, iconOptions));
            this._alarmDotShadow.set_translation(shadowOffset, shadowOffset, 0);
            this._alarmDotShadow.show();
        } else {
            this._alarmDotShadow.hide();
        }
    }

    _getPlaceholderText(showSeconds, showDate, isWidget, is24h, compact = false) {
        if (compact) return '88\n88';

        let timeText = showSeconds ? '88 : 88 : 88' : '88 : 88';
        if (!is24h) timeText += ' 88';
        if (showDate) {
            if (isWidget) {
                timeText += '\n88-88-8888';
            } else {
                timeText += '  --  88-88-8888';
            }
        }
        return timeText;
    }
}
