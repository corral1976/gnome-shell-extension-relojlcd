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
import { ModalDialog } from 'resource:///org/gnome/shell/ui/modalDialog.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import { buildCustomTheme, buildTheme, PRESET_COLORS } from './colorUtils.js';
import {
    calculateRetroShadowOffset,
    calculateDigitShadow,
    calculateAlarmDotSize,
    calculateAlarmDotMargin
} from './renderMath.js';

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

const GHOST_SEGMENTS_OPACITY = 30;
const LAMP_TEST_PEAK_OPACITY = 220;
const LAMP_TEST_PAUSE_MS = 1800;
const LAMP_TEST_FADE_MS = 700;
const MINUTE_FLICKER_DIP_OPACITY = 90;
const MINUTE_FLICKER_DIP_MS = 60;
const MINUTE_FLICKER_RESTORE_MS = 140;
const SCANLINES_OPACITY = 0.15;
const SCANLINES_LINE_RATIO = 0.08;
const SCANLINES_MIN_SPACING = 2;

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

const AlarmDialog = GObject.registerClass(
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

const RelojLCDIndicator = GObject.registerClass(
{ GTypeName: 'RelojLCDIndicator' },
class RelojLCDIndicator extends PanelMenu.Button {
    _init(settings, openPreferences, isAlarming, stopAlarm) {
        super._init(0.5, 'RelojLCD', false);

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

        this._clickHandlerId = this.connect('button-release-event', () => {
            if (this._isAlarming()) {
                this._stopAlarm();
                return Clutter.EVENT_STOP;
            }

            this.menu.toggle();
            return Clutter.EVENT_STOP;
        });
    }

    destroy() {
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
            const item = new PopupMenu.PopupMenuItem(label);
            const swatchHex = key === 'gray' ? '#6a8a5a' : (PRESET_COLORS[key] || '#ffffff');
            item.label.set_style(`color: ${swatchHex}; font-weight: bold;`);
            item.connect('activate', () => {
                this._settings.set_string('clock-color', key);
            });
            this.menu.addMenuItem(item);
            this._colorMenuItems.set(key, item);
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
        this._isAlarming = false;
        this._alarms = [];
        this._lastAlarmStamps = new Map();
        this._pendingAlarms = [];
        this._snoozeTimeoutIds = new Map();
        this._activeNotification = null;
        this._alarmDialog = null;
        this._lastCheckedTime = null;
        this._dotState = true;
        this._alarmBlinkState = true;
        this._clockTimeoutId = null;
        this._alarmTimeoutId = null;
        this._alarmSoundTimeoutId = null;
        this._alarmSoundCancellable = null;
        this._testSoundCancellable = null;
        this._blinkTimeoutId = null;
        this._initTimeoutId = null;
        this._flickerTimeoutId = null;
        this._styleUpdateDebounceId = null;
        this._isChromeIndicator = false;
        this._dragGrab = null;
        this._dragHandler = null;
        this._releaseHandler = null;
        this._signals = [];
        this._lastAppliedStyle = null;
        this._lastAppliedShadowStyle = null;
        this._lastAppliedContainerStyle = null;
        this._alarmDot = null;
        this._alarmDotShadow = null;
        this._alarmDotWrapper = null;
        this._themeContextId = null;
        this._ghostLabel = null;
        this._lastAppliedGhostStyle = null;
        this._lampTestTimeoutId = null;
        this._lampTestMappedId = null;
        this._lampTestIdleId = null;
        this._lastMinute = -1;
        this._scanlinesActor = null;
        this._scanlinesLastHeight = 0;
        this._displayWrapper = null;

        this._migrateLegacyAlarm();
        this._alarms = this._parseAlarms();

        this._loadFont();
        this._buildIndicator();

        this._settings.connectObject(
            'changed::font-size', () => { this._invalidateStyleCache(); this._scheduleStyleUpdate(); },
            'changed::clock-color', () => { this._invalidateStyleCache(); this._updateStyle(); },
            'changed::custom-color', () => { this._invalidateStyleCache(); this._updateStyle(); },
            'changed::show-frame', () => { this._invalidateStyleCache(); this._updateStyle(); },
            'changed::glow-intensity', () => { this._invalidateStyleCache(); this._scheduleStyleUpdate(); },
            'changed::show-seconds', () => { this._invalidateStyleCache(); this._updateClock(); this._updateStyle(); },
            'changed::show-date', () => { this._invalidateStyleCache(); this._updateClock(); this._updateStyle(); },
            'changed::blink-dots', () => this._updateClock(),
            'changed::clock-format-24h', () => this._updateClock(),
            'changed::panel-position', () => this._resetView(),
            'changed::is-widget', () => this._resetView(),
            'changed::flicker-enabled', () => this._updateFlicker(),
            'changed::alarms', () => { this._alarms = this._parseAlarms(); this._updateAlarmDot(); this._updateClock(); },
            'changed::font-style', () => { this._invalidateStyleCache(); this._updateStyle(); },
            'changed::test-alarm-counter', () => this._startTestSound(),
            'changed::test-alarm-stop-counter', () => this._stopTestSound(),
            'changed::ghost-segments', () => { this._updateGhostOpacity(); this._updateAlarmDot(); },
            'changed::crt-scanlines', () => this._updateScanlines(),
            this
        );

        this._updateClock();
        this._updateFlicker();
        this._runLampTest();
    }

    _invalidateStyleCache() {
        this._lastAppliedStyle = null;
        this._lastAppliedShadowStyle = null;
        this._lastAppliedContainerStyle = null;
        this._lastAppliedGhostStyle = null;
    }

    _parseAlarms() {
        let parsed;
        try {
            parsed = JSON.parse(this._settings.get_string('alarms'));
        } catch (e) {
            parsed = [];
        }
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(alarm => {
            if (!alarm || typeof alarm.id !== 'string') return false;
            if (!Number.isInteger(alarm.hour) || alarm.hour < 0 || alarm.hour > 23) return false;
            if (!Number.isInteger(alarm.minute) || alarm.minute < 0 || alarm.minute > 59) return false;

            const hasDate = alarm.year !== undefined || alarm.month !== undefined || alarm.day !== undefined;
            if (!hasDate) return true;

            return Number.isInteger(alarm.year) && alarm.year >= 1970 && alarm.year <= 9999 &&
                Number.isInteger(alarm.month) && alarm.month >= 1 && alarm.month <= 12 &&
                Number.isInteger(alarm.day) && alarm.day >= 1 && alarm.day <= 31;
        });
    }

    _migrateLegacyAlarm() {
        if (this._settings.get_boolean('alarms-migrated')) return;
        this._settings.set_boolean('alarms-migrated', true);

        if (!this._settings.get_boolean('alarm-enabled')) return;

        const legacyAlarm = {
            id: GLib.uuid_string_random(),
            hour: this._settings.get_int('alarm-hour'),
            minute: this._settings.get_int('alarm-minute'),
            enabled: true,
            label: this._settings.get_string('alarm-message') || _('Alarm')
        };
        this._settings.set_string('alarms', JSON.stringify([legacyAlarm]));
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
        this._disconnectIndicatorSignals();

        if (this._indicator) {
            if (this._isChromeIndicator) Main.layoutManager.removeChrome(this._indicator);
            this._indicator.destroy();
            this._indicator = null;
        }
        if (this._themeContextId) {
            const themeContext = St.ThemeContext.get_for_stage(global.stage);
            themeContext.disconnect(this._themeContextId);
            this._themeContextId = null;
        }
        this._invalidateStyleCache();
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
        this._buildIndicator();
        this._updateFlicker();
    }

    disable() {
        this._stopAlarm(false);
        this._stopTestSound();

        for (const timeoutId of this._snoozeTimeoutIds.values())
            GLib.Source.remove(timeoutId);
        this._snoozeTimeoutIds.clear();

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

        this._invalidateStyleCache();
        this._alarms = [];
        this._pendingAlarms = [];
        this._lastAlarmStamps.clear();
        this._lastCheckedTime = null;
        this._lastMinute = -1;
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

    _loadFont() {
        const fontPath = this.path + '/assets/DSEG7Classic-Regular.ttf';
        const fontFile = Gio.File.new_for_path(fontPath);
        
        if (fontFile.query_exists(null)) {
            try {
                const fontMap = Clutter.FontMap.get_default();
                fontMap.add_font_file(fontPath);
            } catch (e) {
                console.error('RelojLCD: Failed to load custom font, falling back to monospace', e);
            }
        } else {
            console.error('RelojLCD: Font file not found');
        }
    }

    _addFlickerTimeout(interval, callback) {
        this._removeFlickerTimeout();
        this._flickerTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, callback);
    }

    _updateFlicker() {
        this._removeFlickerTimeout();

        if (!this._settings.get_boolean('flicker-enabled') || this._isAlarming) {
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
            if (!this._settings || !this._clockLabel || !this._settings.get_boolean('flicker-enabled') || this._isAlarming) {
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
            if (this._isAlarming) {
                this._stopAlarm();
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
        const isWidget = this._settings.get_boolean('is-widget');
        const showSeconds = this._settings.get_boolean('show-seconds');
        const showDate = this._settings.get_boolean('show-date');

        this._clockLabel = new St.Label({
            text: this._getPlaceholderText(showSeconds, showDate, isWidget),
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            style_class: 'reloj-lcd-label'
        });

        this._shadowLabel = new St.Label({
            text: this._getPlaceholderText(showSeconds, showDate, isWidget),
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            style_class: 'reloj-lcd-shadow-label'
        });

        this._ghostLabel = new St.Label({
            text: this._getPlaceholderText(showSeconds, showDate, isWidget),
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            opacity: 0,
            style_class: 'reloj-lcd-ghost-label'
        });

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
            offscreen_redirect: Clutter.OffscreenRedirect.ALWAYS
        });

        this._clockContainer.add_child(this._ghostLabel);
        this._clockContainer.add_child(this._shadowLabel);
        this._clockContainer.add_child(this._clockLabel);
        this._ghostLabel.set_reactive(false);
        this._shadowLabel.set_reactive(false);
        this._clockLabel.set_reactive(false);
        this._clockContainer.set_child_above_sibling(this._shadowLabel, this._ghostLabel);
        this._clockContainer.set_child_above_sibling(this._clockLabel, this._shadowLabel);
        this._clockLabel.show();

        this._alarmDotShadow = new St.Widget({
            reactive: false,
            visible: false,
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START
        });

        this._alarmDot = new St.Widget({
            style_class: 'reloj-lcd-alarm-dot',
            reactive: false,
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START
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
            style_class: 'reloj-lcd-container',
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
                y: widgetY,
                style: 'opacity: 1.0; -st-shadow: none;'
            });
            this._indicator.set_child(this._displayWrapper);
            this._setupDragHandlers(this._indicator);
            Main.layoutManager.addChrome(this._indicator);
            this._isChromeIndicator = true;
        } else {
            this._isChromeIndicator = false;
            const pos = this._settings.get_string('panel-position');
            this._indicator = new RelojLCDIndicator(
                this._settings,
                () => this.openPreferences(),
                () => this._isAlarming,
                () => this._stopAlarm()
            );
            this._displayWrapper.y_align = Clutter.ActorAlign.CENTER;
            this._displayWrapper.y_expand = false;
            this._indicator.add_child(this._displayWrapper);

            Main.panel.addToStatusArea('relojlcd', this._indicator, 1, pos);
        }

        this._indicator.accessible_role = Atk.Role.PUSH_BUTTON;
        this._alarmDotWrapper.accessible_role = Atk.Role.ICON;
        this._alarmDotWrapper.accessible_name = _('Alarm active');

        this._updateStyle();

        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._themeContextId = themeContext.connect('changed', () => {
            this._invalidateStyleCache();
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
            if (!this._settings || !this._clockLabel) {
                this._clockTimeoutId = null;
                return GLib.SOURCE_REMOVE;
            }

            const now = GLib.DateTime.new_now_local();
            const is24h = this._settings.get_boolean('clock-format-24h');
            const showSeconds = this._settings.get_boolean('show-seconds');
            const showDate = this._settings.get_boolean('show-date');
            const isWidget = this._settings.get_boolean('is-widget');
            const blink = this._settings.get_boolean('blink-dots');
            const colorType = this._settings.get_string('clock-color');
            const glow = this._settings.get_double('glow-intensity');

            const timeStr = this._formatTime(now, is24h, showSeconds, showDate, isWidget, blink);

            const currentMinute = now.get_minute();
            if (this._settings.get_boolean('minute-flicker') && !this._isAlarming &&
                this._lastMinute !== -1 && currentMinute !== this._lastMinute) {
                this._playMinuteFlicker();
            }
            this._lastMinute = currentMinute;

            this._clockLabel.set_text(timeStr);
            if (this._shadowLabel && colorType === 'gray' && glow >= 1) {
                this._shadowLabel.set_text(timeStr);
            }
            this._clockLabel.queue_redraw();
            this._shadowLabel?.queue_redraw();

            if (this._indicator) {
                this._indicator.accessible_name = this._formatAccessibleTime(now, is24h);
            }

            this._checkAlarm(now);
            return GLib.SOURCE_CONTINUE;
        };

        update();

        const blinkEnabled = this._settings.get_boolean('blink-dots');
        const showSeconds = this._settings.get_boolean('show-seconds');
        const interval = blinkEnabled ? 500 : (showSeconds ? 1000 : 10000);

        this._clockTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, update);
    }

    _formatTime(now, is24h, showSeconds, showDate, isWidget, blink) {
        this._dotState = blink ? !this._dotState : true;
        const sepChar = this._dotState ? ':' : ' ';
        const sep = ` ${sepChar} `;

        let timeStr;
        if (showSeconds) {
            const format = is24h ? `%H${sep}%M${sep}%S` : `%I${sep}%M${sep}%S %p`;
            timeStr = now.format(format);
        } else {
            const format = is24h ? `%H${sep}%M` : `%I${sep}%M %p`;
            timeStr = now.format(format);
        }

        if (showDate) {
            const dateStr = now.format('%d-%m-%Y');
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
        return `${_('Retro LCD Clock')}, ${now.format(format)}`;
    }

    _updateAlarmDot() {
        if (!this._alarmDotWrapper || !this._settings) return;

        const hasEnabledAlarm = this._alarms.some(alarm => alarm.enabled);
        const ghostEnabled = this._settings.get_boolean('ghost-segments');

        this._alarmDotWrapper.visible = hasEnabledAlarm || ghostEnabled;
        if (this._alarmDot) {
            this._alarmDot.opacity = hasEnabledAlarm ? 255 : GHOST_SEGMENTS_OPACITY;
        }
    }

    _disableOneTimeAlarm(alarm) {
        alarm.enabled = false;
        this._settings.set_string('alarms', JSON.stringify(this._alarms));
        this._updateAlarmDot();
    }

    _checkAlarm(now) {
        const previousCheckedTime = this._lastCheckedTime;
        this._lastCheckedTime = now;

        if (!this._alarms.length) return;

        for (const alarm of this._alarms) {
            if (!alarm.enabled) continue;

            const hasDate = alarm.year !== undefined;
            const target = hasDate
                ? GLib.DateTime.new_local(alarm.year, alarm.month, alarm.day, alarm.hour, alarm.minute, 0)
                : GLib.DateTime.new_local(now.get_year(), now.get_month(), now.get_day_of_month(), alarm.hour, alarm.minute, 0);

            if (!target) continue;

            const reachedTarget = previousCheckedTime
                ? previousCheckedTime.compare(target) < 0 && now.compare(target) >= 0
                : (hasDate
                    ? now.get_year() === alarm.year && now.get_month() === alarm.month && now.get_day_of_month() === alarm.day &&
                      now.get_hour() === alarm.hour && now.get_minute() === alarm.minute
                    : now.get_hour() === alarm.hour && now.get_minute() === alarm.minute);

            if (!reachedTarget) continue;

            const stamp = `${now.get_year()}-${now.get_day_of_year()}-${alarm.hour}:${alarm.minute}`;
            if (this._lastAlarmStamps.get(alarm.id) === stamp) continue;
            this._lastAlarmStamps.set(alarm.id, stamp);

            if (hasDate) this._disableOneTimeAlarm(alarm);

            if (this._isAlarming) {
                if (!this._pendingAlarms.some(pending => pending.id === alarm.id))
                    this._pendingAlarms.push(alarm);
            } else {
                this._triggerAlarm(alarm);
            }
        }
    }

    _playAlarmSound(cancellable = this._alarmSoundCancellable) {
        const alarmPath = this.path + '/assets/alarm.ogg';
        const alarmFile = Gio.File.new_for_path(alarmPath);

        if (!alarmFile.query_exists(null)) {
            console.error('RelojLCD: Alarm sound file not found');
            return;
        }

        try {
            global.display.get_sound_player().play_from_file(alarmFile, 'Alarm clock', cancellable);
        } catch (e) {
            console.error('RelojLCD: Failed to play alarm sound', e);
        }
    }

    _startTestSound() {
        this._stopTestSound();
        this._testSoundCancellable = new Gio.Cancellable();
        this._playAlarmSound(this._testSoundCancellable);
    }

    _stopTestSound() {
        if (this._testSoundCancellable) {
            this._testSoundCancellable.cancel();
            this._testSoundCancellable = null;
        }
    }

    _triggerAlarm(alarm) {
        this._isAlarming = true;
        this._alarmSoundCancellable = new Gio.Cancellable();

        if (this._settings.get_boolean('alarm-dialog-enabled')) {
            this._showAlarmDialog(alarm);
        } else {
            this._showAlarmNotification(alarm);
        }
        this._playAlarmSound();

        if (this._alarmSoundTimeoutId) GLib.Source.remove(this._alarmSoundTimeoutId);
        this._alarmSoundTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 8130, () => {
            this._playAlarmSound();
            return GLib.SOURCE_CONTINUE;
        });

        if (this._blinkTimeoutId) GLib.Source.remove(this._blinkTimeoutId);
        this._blinkTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._alarmBlinkState = !this._alarmBlinkState;
            const opacity = this._alarmBlinkState ? 255 : 40;
            this._clockLabel.set_opacity(opacity);
            this._alarmDotWrapper.set_opacity(opacity);
            return GLib.SOURCE_CONTINUE;
        });

        if (this._alarmTimeoutId) GLib.Source.remove(this._alarmTimeoutId);
        this._alarmTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60000, () => {
            this._stopAlarm();
            return GLib.SOURCE_REMOVE;
        });
    }

    _showAlarmNotification(alarm) {
        const source = MessageTray.getSystemSource();
        const notification = new MessageTray.Notification({
            source,
            title: _('Reloj LCD'),
            body: alarm.label || _('Alarm'),
            urgency: MessageTray.Urgency.CRITICAL
        });

        notification.addAction(_('Snooze'), () => this._snoozeAlarm(alarm));
        notification.addAction(_('Dismiss'), () => this._stopAlarm());

        const destroyHandlerId = notification.connect('destroy', () => {
            notification.disconnect(destroyHandlerId);
            if (this._activeNotification === notification)
                this._activeNotification = null;
        });

        this._activeNotification = notification;
        source.addNotification(notification);
    }

    _showAlarmDialog(alarm) {
        this._alarmDialog = new AlarmDialog(
            alarm,
            () => this._snoozeAlarm(alarm),
            () => this._stopAlarm()
        );
        this._alarmDialog.open();
    }

    _snoozeAlarm(alarm) {
        this._stopAlarm();

        const existingTimeoutId = this._snoozeTimeoutIds.get(alarm.id);
        if (existingTimeoutId) GLib.Source.remove(existingTimeoutId);

        const snoozeMinutes = this._settings.get_int('snooze-minutes');
        const timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, snoozeMinutes * 60, () => {
            this._snoozeTimeoutIds.delete(alarm.id);
            this._triggerAlarm(alarm);
            return GLib.SOURCE_REMOVE;
        });
        this._snoozeTimeoutIds.set(alarm.id, timeoutId);
    }

    _stopAlarm(triggerPending = true) {
        this._isAlarming = false;

        if (this._alarmSoundCancellable) {
            this._alarmSoundCancellable.cancel();
            this._alarmSoundCancellable = null;
        }

        if (this._alarmSoundTimeoutId) {
            GLib.Source.remove(this._alarmSoundTimeoutId);
            this._alarmSoundTimeoutId = null;
        }

        if (this._alarmTimeoutId) {
            GLib.Source.remove(this._alarmTimeoutId);
            this._alarmTimeoutId = null;
        }

        if (this._blinkTimeoutId) {
            GLib.Source.remove(this._blinkTimeoutId);
            this._blinkTimeoutId = null;
        }

        this._activeNotification?.destroy();
        this._activeNotification = null;

        if (this._alarmDialog) {
            this._alarmDialog.close();
            this._alarmDialog = null;
        }

        if (this._clockLabel) {
            this._clockLabel.set_opacity(255);
            this._invalidateStyleCache();
            this._updateStyle();
        }
        if (this._alarmDotWrapper) {
            this._alarmDotWrapper.set_opacity(255);
        }
        this._updateFlicker();

        if (triggerPending && this._pendingAlarms.length) {
            const nextAlarm = this._pendingAlarms.shift();
            this._triggerAlarm(nextAlarm);
        }
    }

    _updateStyle() {
        if (!this._clockLabel || !this._shadowLabel || !this._settings) return;

        const config = this._getStyleConfig();
        const theme = this._getTheme(config.colorType);
        const shadow = calculateDigitShadow(config.colorType, config.glow, theme.glow, config.fontSize);
        
        this._updateShadowLabelVisibility(config);
        const containerStyle = this._buildContainerStyle(config, theme);
        const clockStyle = this._buildClockStyle(config, theme);
        const shadowStyle = this._buildShadowStyle(config, shadow);
        const ghostStyle = this._buildGhostStyle(config, theme);

        this._updateGhostLabel(config, ghostStyle);
        this._applyStyles(containerStyle, clockStyle, shadowStyle, theme, config, shadow);
    }

    _buildGhostStyle(config, theme) {
        const baseProps = this._buildBaseStyleProps(config);
        const props = [...baseProps];
        props.push(`color: ${theme.main}`);
        props.push(`z-index: 0`);
        return props.join('; ') + ';';
    }

    _updateGhostLabel(config, ghostStyle) {
        if (!this._ghostLabel) return;

        this._ghostLabel.set_text(this._getPlaceholderText(config.showSeconds, config.showDate, config.isWidget));
        this._updateGhostOpacity();

        if (this._lastAppliedGhostStyle === ghostStyle) return;
        this._lastAppliedGhostStyle = ghostStyle;
        this._ghostLabel.set_style(ghostStyle);
    }

    _getStyleConfig() {
        const showSeconds = this._settings.get_boolean('show-seconds');
        const fontSize = this._settings.get_double('font-size');
        const colorType = this._settings.get_string('clock-color');
        const glow = this._settings.get_double('glow-intensity');
        return {
            fontSize: fontSize,
            colorType: colorType,
            glow: glow,
            showSeconds: showSeconds,
            showDate: this._settings.get_boolean('show-date'),
            isWidget: this._settings.get_boolean('is-widget'),
            fontStyle: this._settings.get_string('font-style'),
            showFrame: this._settings.get_boolean('show-frame'),
            horizontalPadding: this._calculateHorizontalPadding(fontSize, showSeconds, glow, colorType)
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
            this._shadowLabel.show();
            this._shadowLabel.set_text(this._getPlaceholderText(config.showSeconds, config.showDate, config.isWidget));
        } else {
            this._shadowLabel.hide();
        }
    }

    _buildContainerStyle(config, theme) {
        const props = [
            `background-color: ${theme.bg}`,
            `border-radius: 8px`,
            `box-shadow: ${this._calculateBoxShadow(config.colorType, config.glow, theme)}`,
            `padding: 2px ${config.horizontalPadding.toFixed(1)}px`,
            `position: relative`,
            `z-index: 10`
        ];

        if (config.showFrame) {
            props.push(`border: 1px solid ${theme.border}`);
        }

        if (config.showDate) {
            props.push(`text-align: center`);
            if (config.isWidget) {
                props.push(`line-height: 1.2`);
            }
        }
        
        return props.join('; ') + ';';
    }

    _buildClockStyle(config, theme) {
        const baseProps = this._buildBaseStyleProps(config);
        const props = [...baseProps];
        props.push(`color: ${theme.main}`);
        props.push(`text-shadow: 0.5px 0 0 rgba(0, 0, 0, 0.05)`);
        props.push(`-st-text-shadow: 0.5px 0 0 rgba(0, 0, 0, 0.05)`);
        props.push(`z-index: 2`);
        return props.join('; ') + ';';
    }

    _buildShadowStyle(config, shadow) {
        const baseProps = this._buildBaseStyleProps(config);
        const props = [...baseProps];
        props.push(`color: rgba(0, 0, 0, 0.01)`);
        props.push(`text-shadow: ${shadow}`);
        props.push(`-st-text-shadow: ${shadow}`);
        props.push(`z-index: 1`);
        return props.join('; ') + ';';
    }

    _buildBaseStyleProps(config) {
        let fontWeight = 'normal';
        let cssFontStyle = 'normal';
        
        if (config.fontStyle === 'italic') {
            cssFontStyle = 'italic';
        } else if (config.fontStyle === 'bold') {
            fontWeight = 'bold';
        } else if (config.fontStyle === 'italic-bold') {
            cssFontStyle = 'italic';
            fontWeight = 'bold';
        }
        
        return [
            `font-family: 'DSEG7 Classic', monospace`,
            `font-size: ${config.fontSize.toFixed(1)}em`,
            `font-weight: ${fontWeight}`,
            `font-style: ${cssFontStyle}`,
            `overflow: visible`,
            `-st-font-smoothing: enabled`,
            `-st-text-rendering: optimizeSpeed`
        ];
    }

    _calculateBoxShadow(colorType, glow, theme) {
        if (colorType === 'gray' || glow <= 0) return 'none';
        
        const glowIntensity = glow / 10;
        const withAlpha = (rgba, alpha) => rgba.replace(/[\d.]+\)$/, `${alpha})`);
        const boxGlowColor = withAlpha(theme.glow, 0.1 + glowIntensity * 0.5);
        const blurSize = 5 + glowIntensity * 35;
        return `0 0 ${blurSize.toFixed(1)}px ${boxGlowColor}`;
    }

    _applyStyles(containerStyle, clockStyle, shadowStyle, theme, config, shadow) {
        if (this._lastAppliedStyle === clockStyle && 
            this._lastAppliedShadowStyle === shadowStyle && 
            this._lastAppliedContainerStyle === containerStyle) {
            return;
        }
        
        this._lastAppliedStyle = clockStyle;
        this._lastAppliedShadowStyle = shadowStyle;
        this._lastAppliedContainerStyle = containerStyle;
        
        if (this._container) this._container.set_style(containerStyle);
        this._clockLabel.set_style(clockStyle);
        this._shadowLabel.set_style(shadowStyle);
        this._clockLabel.queue_redraw();
        this._shadowLabel.queue_redraw();
        if (this._clockContainer) this._clockContainer.queue_redraw();
        if (this._container) this._container.queue_redraw();
        if (this._indicator) this._indicator.queue_redraw();
        
        if (this._alarmDot && this._alarmDotWrapper) {
            this._updateAlarmDotAppearance(config, theme, shadow);
        }
    }

    _updateAlarmDotAppearance(config, theme, shadow) {
        const dotSize = calculateAlarmDotSize(config.fontSize);
        const dotMargin = calculateAlarmDotMargin(dotSize);
        const isRetro = config.colorType === 'gray';
        const showGhostShadow = isRetro && config.glow >= 1;
        const shadowOffset = showGhostShadow ? calculateRetroShadowOffset(config.glow, config.fontSize) : 0;

        const dotGeometryStyle =
            `width: ${dotSize.toFixed(1)}px;` +
            `height: ${dotSize.toFixed(1)}px;` +
            `min-width: ${dotSize.toFixed(1)}px;` +
            `max-width: ${dotSize.toFixed(1)}px;` +
            `min-height: ${dotSize.toFixed(1)}px;` +
            `max-height: ${dotSize.toFixed(1)}px;` +
            `border-radius: ${(dotSize / 2).toFixed(1)}px;`;

        const glowShadow = isRetro ? 'none' : shadow;
        this._alarmDot.set_style(
            `background-color: ${theme.main};` +
            `box-shadow: ${glowShadow};` +
            dotGeometryStyle
        );

        if (showGhostShadow) {
            this._alarmDotShadow.show();
            this._alarmDotShadow.set_style(
                `background-color: rgba(80, 80, 80, 0.6);` +
                dotGeometryStyle +
                `margin-left: ${shadowOffset.toFixed(1)}px;` +
                `margin-top: ${shadowOffset.toFixed(1)}px;`
            );
        } else {
            this._alarmDotShadow.hide();
        }

        this._alarmDotWrapper.set_style(`margin-right: ${dotMargin.toFixed(1)}px;`);
    }

    _getPlaceholderText(showSeconds, showDate, isWidget) {
        let timeText = showSeconds ? '88 : 88 : 88' : '88 : 88';
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
