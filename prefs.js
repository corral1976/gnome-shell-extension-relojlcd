import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk';
import GdkPixbuf from 'gi://GdkPixbuf';
import { isValidHex, hexToRgba, PRESET_COLORS } from './colorUtils.js';
import { calculateRetroShadowOffset, RETRO_SHADOW_RGBA } from './renderMath.js';
import {
    buildGlyphSvgMarkup,
    resolveGlyphStyleOptions,
    isBlankGlyph,
    calculateCellPixelHeight,
    calculateCellPixelWidth,
    calculateRowPixelWidth
} from './glyphAssets.js';

const PREVIEW_MAX_FONT_SIZE = 4;
const PREVIEW_TEXT = '88:88';
const PREVIEW_ALARM_SLOT_RATIO = 0.15;
const glyphTextEncoder = new TextEncoder();

const RETRO_MAIN_COLOR = '#000000';
const RETRO_BORDER_COLOR = '#6a8a5a';
const RETRO_BG_COLOR = 'rgba(120, 150, 100, 0.95)';

function hexTo01(hex) {
    const clean = hex.replace('#', '');
    return {
        r: parseInt(clean.substring(0, 2), 16) / 255,
        g: parseInt(clean.substring(2, 4), 16) / 255,
        b: parseInt(clean.substring(4, 6), 16) / 255
    };
}

function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

function rgbaStringTo01(str) {
    const match = str.match(/rgba?\(([^)]+)\)/);
    const parts = match[1].split(',').map(v => parseFloat(v.trim()));
    return { r: parts[0] / 255, g: parts[1] / 255, b: parts[2] / 255, a: parts[3] ?? 1 };
}

function getPreviewColors(colorType, customHex) {
    if (colorType === 'gray') {
        return { main: RETRO_MAIN_COLOR, border: RETRO_BORDER_COLOR, bg: RETRO_BG_COLOR };
    }
    const base = colorType === 'custom'
        ? (isValidHex(customHex) ? customHex : '#00ff00')
        : (PRESET_COLORS[colorType] || PRESET_COLORS.green);
    return { main: base, border: base, bg: hexToRgba(base, 0.2) };
}

function drawPreviewChrome(cr, width, height, colors, glowValue, isRetro, showFrame) {
    const radius = 10;
    const roundedRect = (x, y, w, h, r) => {
        cr.newSubPath();
        cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
        cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
        cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
        cr.arc(x + r, y + r, r, Math.PI, 3 * Math.PI / 2);
        cr.closePath();
    };

    const bg = rgbaStringTo01(colors.bg);
    roundedRect(4, 4, width - 8, height - 8, radius);
    cr.setSourceRGBA(bg.r, bg.g, bg.b, bg.a);
    if (showFrame) {
        cr.fillPreserve();
        const border = hexTo01(colors.border);
        cr.setSourceRGBA(border.r, border.g, border.b, 1);
        cr.setLineWidth(1.5);
        cr.stroke();
    } else {
        cr.fill();
    }

    if (glowValue > 0 && !isRetro) {
        const glow = hexTo01(colors.main);
        const steps = 4;
        for (let i = steps; i >= 1; i--) {
            const alpha = (glowValue / 10) * 0.15 * (i / steps);
            roundedRect(4 - i * 1.5, 4 - i * 1.5, width - 8 + i * 3, height - 8 + i * 3, radius + i);
            cr.setSourceRGBA(glow.r, glow.g, glow.b, alpha);
            cr.setLineWidth(2);
            cr.stroke();
        }
    }
}

// GTK-process counterpart of glyphTexture.js's GlyphTextureCache — that one
// targets St.ImageContent/Cogl, unavailable outside the Shell process.
function rasterizeGlyph(cache, char, color, pixelWidth, pixelHeight, options) {
    const width = Math.max(1, Math.round(pixelWidth));
    const height = Math.max(1, Math.round(pixelHeight));
    const key = `${char}|${color}|${width}|${height}|${options.italic ? 1 : 0}${options.bold ? 1 : 0}`;

    let pixbuf = cache.get(key);
    if (pixbuf) return pixbuf;

    const markup = buildGlyphSvgMarkup(char, color, options);
    if (!markup) return null;

    const stream = Gio.MemoryInputStream.new_from_bytes(
        GLib.Bytes.new(glyphTextEncoder.encode(markup)));
    pixbuf = GdkPixbuf.Pixbuf.new_from_stream_at_scale(stream, width, height, false, null);
    cache.set(key, pixbuf);
    return pixbuf;
}

function drawGlyph(cr, cache, char, color, fontSize, styleOptions, x, centerY) {
    const cellHeight = calculateCellPixelHeight(fontSize);
    const cellWidth = calculateCellPixelWidth(fontSize, char, styleOptions.italic);

    if (!isBlankGlyph(char)) {
        const pixbuf = rasterizeGlyph(cache, char, color, cellWidth, cellHeight, styleOptions);
        if (pixbuf) {
            cr.save();
            cr.translate(x, centerY - cellHeight / 2);
            Gdk.cairo_set_source_pixbuf(cr, pixbuf, 0, 0);
            cr.paint();
            cr.restore();
        }
    }

    return cellWidth;
}

// For multi-character text only — a single glyph key like 'alarm' must go
// through drawGlyph() directly, or this iterates its letters one by one.
function drawGlyphRow(cr, cache, text, color, fontSize, styleOptions, startX, centerY) {
    let x = startX;
    for (const char of text)
        x += drawGlyph(cr, cache, char, color, fontSize, styleOptions, x, centerY);
    return x - startX;
}

function drawAlarmIcon(cr, cache, slotX, centerY, slotWidth, fontSize, colors, glowValue, isRetro, styleOptions) {
    const iconOptions = { ...styleOptions, bold: true };
    const iconWidth = calculateCellPixelWidth(fontSize, 'alarm');
    const iconX = slotX + (slotWidth - iconWidth) / 2;

    if (isRetro && glowValue >= 1) {
        const shadowOffset = calculateRetroShadowOffset(glowValue, fontSize);
        drawGlyph(cr, cache, 'alarm', RETRO_SHADOW_RGBA, fontSize, iconOptions,
            iconX + shadowOffset, centerY + shadowOffset);
    }

    drawGlyph(cr, cache, 'alarm', colors.main, fontSize, iconOptions, iconX, centerY);
}

function parseAlarms(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        parsed = [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(alarm => alarm && typeof alarm.id === 'string');
}

export default class RelojLCDPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const glyphPreviewCache = new Map();

        const generalPage = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic'
        });
        const appearancePage = new Adw.PreferencesPage({
            title: _('Appearance'),
            icon_name: 'applications-graphics-symbolic'
        });
        const alarmsPage = new Adw.PreferencesPage({
            title: _('Alarms'),
            icon_name: 'alarm-symbolic'
        });
        const aboutPage = new Adw.PreferencesPage({
            title: _('About'),
            icon_name: 'help-about-symbolic'
        });

        const dateGroup = new Adw.PreferencesGroup({
            title: _('Current Date')
        });
        generalPage.add(dateGroup);

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
        generalPage.add(behaviorGroup);

        const widgetRow = new Adw.ActionRow({
            title: _('Desktop Widget Mode'),
            subtitle: _('Show clock on desktop instead of the top bar')
        });
        const widgetSwitch = new Gtk.Switch({
            active: settings.get_boolean('is-widget'),
            valign: Gtk.Align.CENTER
        });

        const verticalLayoutRow = new Adw.ActionRow({
            title: _('Vertical Panel Layout'),
            subtitle: _('Compact layout (bell, hours, minutes stacked, no seconds or date) for a panel docked to the left or right edge of the screen. Not used in desktop widget mode.')
        });
        const verticalLayoutSwitch = new Gtk.Switch({
            active: settings.get_boolean('vertical-panel-layout'),
            sensitive: !settings.get_boolean('is-widget'),
            valign: Gtk.Align.CENTER
        });
        verticalLayoutSwitch.connect('notify::active', (w) => {
            settings.set_boolean('vertical-panel-layout', w.active);
        });
        verticalLayoutRow.add_suffix(verticalLayoutSwitch);

        widgetSwitch.connect('notify::active', (w) => {
            settings.set_boolean('is-widget', w.active);
            verticalLayoutSwitch.set_sensitive(!w.active);
        });
        widgetRow.add_suffix(widgetSwitch);
        behaviorGroup.add(widgetRow);
        behaviorGroup.add(verticalLayoutRow);

        const formatRow = new Adw.ActionRow({
            title: _('24-Hour Format'),
            subtitle: _('Display time in 24-hour format instead of AM/PM')
        });
        const formatSwitch = new Gtk.Switch({
            active: settings.get_boolean('clock-format-24h'),
            valign: Gtk.Align.CENTER
        });
        formatSwitch.connect('notify::active', (w) => {
            settings.set_boolean('clock-format-24h', w.active);
        });
        formatRow.add_suffix(formatSwitch);
        behaviorGroup.add(formatRow);

        const secondsRow = new Adw.ActionRow({
            title: _('Show Seconds'),
            subtitle: _('Display seconds in the time display')
        });
        const secondsSwitch = new Gtk.Switch({
            active: settings.get_boolean('show-seconds'),
            valign: Gtk.Align.CENTER
        });
        secondsSwitch.connect('notify::active', (w) => {
            settings.set_boolean('show-seconds', w.active);
        });
        secondsRow.add_suffix(secondsSwitch);
        behaviorGroup.add(secondsRow);

        const dateRow = new Adw.ActionRow({
            title: _('Show Date'),
            subtitle: _('Display current date below the time')
        });
        const dateSwitch = new Gtk.Switch({
            active: settings.get_boolean('show-date'),
            valign: Gtk.Align.CENTER
        });
        dateSwitch.connect('notify::active', (w) => {
            settings.set_boolean('show-date', w.active);
        });
        dateRow.add_suffix(dateSwitch);
        behaviorGroup.add(dateRow);

        const positionRow = new Adw.ComboRow({
            title: _('Panel Position'),
            subtitle: _('Choose where the clock appears on the panel'),
            model: new Gtk.StringList({ strings: [_('Left'), _('Center'), _('Right')] }),
            selected: ['left', 'center', 'right'].indexOf(settings.get_string('panel-position'))
        });
        positionRow.connect('notify::selected', (w) => {
            const positions = ['left', 'center', 'right'];
            settings.set_string('panel-position', positions[w.selected]);
        });
        behaviorGroup.add(positionRow);

        const colorKeys = ['green', 'amber', 'gray', 'ruby', 'sapphire', 'white', 'violet', 'gold', 'teal', 'orange', 'custom'];

        const previewArea = new Gtk.DrawingArea({
            content_width: 260,
            content_height: 80,
            halign: Gtk.Align.CENTER,
            margin_top: 6,
            margin_bottom: 6
        });

        // Shared by both the size request and draw_func below so they never
        // disagree on the layout numbers.
        const computePreviewLayout = () => {
            const fontSize = Math.min(settings.get_double('font-size'), PREVIEW_MAX_FONT_SIZE);
            const styleOptions = resolveGlyphStyleOptions(settings.get_string('font-style'));
            const hasEnabledAlarm = parseAlarms(settings.get_string('alarms')).some(alarm => alarm.enabled);
            const cellHeight = calculateCellPixelHeight(fontSize);
            const rowWidth = calculateRowPixelWidth(fontSize, PREVIEW_TEXT, styleOptions.italic);
            const alarmSlotWidth = hasEnabledAlarm ? calculateCellPixelWidth(fontSize, '8') : 0;
            const alarmMargin = hasEnabledAlarm ? alarmSlotWidth * PREVIEW_ALARM_SLOT_RATIO : 0;
            return {
                fontSize, styleOptions, hasEnabledAlarm, cellHeight, rowWidth, alarmSlotWidth, alarmMargin,
                totalWidth: alarmSlotWidth + alarmMargin + rowWidth
            };
        };

        previewArea.set_draw_func((area, cr, width, height) => {
            const colorType = settings.get_string('clock-color');
            const colors = getPreviewColors(colorType, settings.get_string('custom-color'));
            const glowValue = settings.get_double('glow-intensity');
            const isRetro = colorType === 'gray';
            const showFrame = settings.get_boolean('show-frame');
            const layout = computePreviewLayout();

            drawPreviewChrome(cr, width, height, colors, glowValue, isRetro, showFrame);

            const centerY = height / 2;
            let x = (width - layout.totalWidth) / 2;

            if (layout.hasEnabledAlarm) {
                drawAlarmIcon(cr, glyphPreviewCache, x, centerY, layout.alarmSlotWidth, layout.fontSize,
                    colors, glowValue, isRetro, layout.styleOptions);
                x += layout.alarmSlotWidth + layout.alarmMargin;
            }

            if (isRetro && glowValue >= 1) {
                const shadowOffset = calculateRetroShadowOffset(glowValue, layout.fontSize);
                drawGlyphRow(cr, glyphPreviewCache, PREVIEW_TEXT, RETRO_SHADOW_RGBA, layout.fontSize,
                    layout.styleOptions, x + shadowOffset, centerY + shadowOffset);
            }

            drawGlyphRow(cr, glyphPreviewCache, PREVIEW_TEXT, colors.main, layout.fontSize,
                layout.styleOptions, x, centerY);
        });

        const refreshPreview = () => {
            const layout = computePreviewLayout();
            previewArea.set_content_width(Math.round(layout.totalWidth) + 56);
            previewArea.set_content_height(Math.round(layout.cellHeight) + 24);
            previewArea.queue_draw();
        };
        refreshPreview();

        const previewGroup = new Adw.PreferencesGroup({ description: _('Live preview') });
        previewGroup.add(previewArea);
        appearancePage.add(previewGroup);

        const colorGroup = new Adw.PreferencesGroup({
            title: _('Color & Glow'),
            description: _('Pick a theme and tune how it glows')
        });
        appearancePage.add(colorGroup);

        const colorRow = new Adw.ComboRow({
            title: _('Color Theme'),
            subtitle: _('Choose your preferred LCD color style'),
            model: new Gtk.StringList({ strings: [_('Neon Green'), _('Vintage Amber'), _('Retro LCD'), _('Red Ruby'), _('Blue Sapphire'), _('White LED'), _('Violet Purple'), _('Gold'), _('VFD Teal'), _('Nixie Orange'), _('Custom Color')] }),
            selected: colorKeys.indexOf(settings.get_string('clock-color'))
        });
        colorGroup.add(colorRow);

        const customColorRow = new Adw.ActionRow({
            title: _('Custom Color'),
            subtitle: _('Applies to digits, separators, alarm dot and border')
        });
        const initialRgba = new Gdk.RGBA();
        initialRgba.parse(isValidHex(settings.get_string('custom-color')) ? settings.get_string('custom-color') : '#00ff00');
        const colorButton = new Gtk.ColorButton({
            rgba: initialRgba,
            use_alpha: false,
            valign: Gtk.Align.CENTER
        });
        colorButton.connect('color-set', (w) => {
            const rgba = w.get_rgba();
            const hex = '#' + [rgba.red, rgba.green, rgba.blue]
                .map(v => Math.round(v * 255).toString(16).padStart(2, '0'))
                .join('');
            settings.set_string('custom-color', hex);
            refreshPreview();
        });
        customColorRow.add_suffix(colorButton);
        customColorRow.set_visible(settings.get_string('clock-color') === 'custom');
        colorGroup.add(customColorRow);

        colorRow.connect('notify::selected', (w) => {
            const color = colorKeys[w.selected];
            settings.set_string('clock-color', color);
            customColorRow.set_visible(color === 'custom');
            updateGlowLimit(color);
            refreshPreview();
        });

        const glowAdjustment = new Gtk.Adjustment({ lower: 0, upper: 10, step_increment: 1, value: settings.get_double('glow-intensity') });
        const glowRow = new Adw.ActionRow({
            title: _('Glow / Shadow Intensity'),
            subtitle: _('Control glow for colored themes or shadow strength for Retro LCD')
        });
        const glowSpin = new Gtk.SpinButton({
            adjustment: glowAdjustment,
            digits: 0,
            valign: Gtk.Align.CENTER
        });

        const updateGlowLimit = (color) => {
            const isRetro = color === 'gray';
            glowAdjustment.set_upper(isRetro ? 5 : 10);
            if (isRetro && glowAdjustment.get_value() > 5) {
                glowAdjustment.set_value(5);
                settings.set_double('glow-intensity', 5);
            }
        };

        updateGlowLimit(settings.get_string('clock-color'));

        glowSpin.connect('value-changed', (w) => {
            const intensity = Math.floor(w.get_value());
            settings.set_double('glow-intensity', intensity);
            refreshPreview();
        });
        glowRow.add_suffix(glowSpin);
        colorGroup.add(glowRow);

        const frameRow = new Adw.ActionRow({
            title: _('Display Border'),
            subtitle: _('Hide the border outline around the display; the background and glow stay visible')
        });
        const frameSwitch = new Gtk.Switch({
            active: settings.get_boolean('show-frame'),
            valign: Gtk.Align.CENTER
        });
        frameSwitch.connect('notify::active', (w) => {
            settings.set_boolean('show-frame', w.active);
            refreshPreview();
        });
        frameRow.add_suffix(frameSwitch);
        colorGroup.add(frameRow);

        const textGroup = new Adw.PreferencesGroup({
            title: _('Font & Effects'),
            description: _('Adjust size, style and vintage display effects')
        });
        appearancePage.add(textGroup);

        const fontRow = new Adw.ActionRow({
            title: _('Font Size'),
            subtitle: _('Adjust the clock display size')
        });
        const fontSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({ lower: 0.5, upper: 10.0, step_increment: 0.1, value: settings.get_double('font-size') }),
            digits: 1,
            valign: Gtk.Align.CENTER
        });
        fontSpin.connect('value-changed', (w) => {
            const size = Math.round(w.get_value() * 10) / 10;
            settings.set_double('font-size', size);
            refreshPreview();
        });
        fontRow.add_suffix(fontSpin);
        textGroup.add(fontRow);

        const fontStyleKeys = ['regular', 'italic', 'bold', 'italic-bold'];
        const fontStyleRow = new Adw.ComboRow({
            title: _('Font Style'),
            subtitle: _('Choose the font style (synthetic bold/italic)'),
            model: new Gtk.StringList({ strings: [_('Regular'), _('Italic'), _('Bold'), _('Italic Bold')] }),
            selected: fontStyleKeys.indexOf(settings.get_string('font-style'))
        });
        fontStyleRow.connect('notify::selected', (w) => {
            const style = fontStyleKeys[w.selected];
            settings.set_string('font-style', style);
            refreshPreview();
        });
        textGroup.add(fontStyleRow);

        const blinkRow = new Adw.ActionRow({
            title: _('Blinking Separators'),
            subtitle: _('Make the time separators blink for classic LCD effect')
        });
        const blinkSwitch = new Gtk.Switch({
            active: settings.get_boolean('blink-dots'),
            valign: Gtk.Align.CENTER
        });
        blinkSwitch.connect('notify::active', (w) => {
            settings.set_boolean('blink-dots', w.active);
        });
        blinkRow.add_suffix(blinkSwitch);
        textGroup.add(blinkRow);

        const flickerRow = new Adw.ActionRow({
            title: _('Flicker Effect'),
            subtitle: _('Add subtle random flicker for vintage LCD display feel')
        });
        const flickerSwitch = new Gtk.Switch({
            active: settings.get_boolean('flicker-enabled'),
            valign: Gtk.Align.CENTER
        });
        flickerSwitch.connect('notify::active', (w) => {
            settings.set_boolean('flicker-enabled', w.active);
        });
        flickerRow.add_suffix(flickerSwitch);
        textGroup.add(flickerRow);

        const ghostRow = new Adw.ActionRow({
            title: _('Ghost Segments'),
            subtitle: _('Show the unlit 7-segment pattern faintly behind the digits')
        });
        const ghostSwitch = new Gtk.Switch({
            active: settings.get_boolean('ghost-segments'),
            valign: Gtk.Align.CENTER
        });
        ghostSwitch.connect('notify::active', (w) => {
            settings.set_boolean('ghost-segments', w.active);
        });
        ghostRow.add_suffix(ghostSwitch);
        textGroup.add(ghostRow);

        const lampTestRow = new Adw.ActionRow({
            title: _('Lamp Test on Startup'),
            subtitle: _('Briefly flash all segments when the extension starts')
        });
        const lampTestSwitch = new Gtk.Switch({
            active: settings.get_boolean('startup-lamp-test'),
            valign: Gtk.Align.CENTER
        });
        lampTestSwitch.connect('notify::active', (w) => {
            settings.set_boolean('startup-lamp-test', w.active);
        });
        lampTestRow.add_suffix(lampTestSwitch);
        textGroup.add(lampTestRow);

        const minuteFlickerRow = new Adw.ActionRow({
            title: _('Minute Flicker'),
            subtitle: _('Dip the brightness briefly whenever the minute changes')
        });
        const minuteFlickerSwitch = new Gtk.Switch({
            active: settings.get_boolean('minute-flicker'),
            valign: Gtk.Align.CENTER
        });
        minuteFlickerSwitch.connect('notify::active', (w) => {
            settings.set_boolean('minute-flicker', w.active);
        });
        minuteFlickerRow.add_suffix(minuteFlickerSwitch);
        textGroup.add(minuteFlickerRow);

        const scanlinesRow = new Adw.ActionRow({
            title: _('CRT Scanlines'),
            subtitle: _('Overlay faint horizontal scanlines for a CRT/VFD look')
        });
        const scanlinesSwitch = new Gtk.Switch({
            active: settings.get_boolean('crt-scanlines'),
            valign: Gtk.Align.CENTER
        });
        scanlinesSwitch.connect('notify::active', (w) => {
            settings.set_boolean('crt-scanlines', w.active);
        });
        scanlinesRow.add_suffix(scanlinesSwitch);
        textGroup.add(scanlinesRow);

        const alarmGroup = new Adw.PreferencesGroup({
            title: _('Alarms'),
            description: _('Add one or more alarms; each one can be snoozed independently')
        });
        alarmsPage.add(alarmGroup);

        let alarms = parseAlarms(settings.get_string('alarms'));
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
                title: alarm.label || _('Alarm'),
                subtitle: formatAlarmSubtitle(alarm)
            });

            const enabledSwitch = new Gtk.Switch({
                active: alarm.enabled,
                valign: Gtk.Align.CENTER
            });
            enabledSwitch.connect('notify::active', (w) => {
                alarm.enabled = w.active;
                saveAlarms();
            });
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

            const specificDateRow = new Adw.ActionRow({
                title: _('Specific Date'),
                subtitle: _('Ring once on a chosen date instead of every day')
            });
            const specificDateSwitch = new Gtk.Switch({
                active: hasSpecificDate(alarm),
                valign: Gtk.Align.CENTER
            });
            specificDateRow.add_suffix(specificDateSwitch);
            row.add_row(specificDateRow);

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
                row.set_title(alarm.label || _('Alarm'));
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

        const alarmSettingsGroup = new Adw.PreferencesGroup({
            title: _('Sound & Snooze')
        });
        alarmsPage.add(alarmSettingsGroup);

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
                testSoundTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 8200, () => {
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
            adjustment: new Gtk.Adjustment({ lower: 1, upper: 60, step_increment: 1, value: settings.get_int('snooze-minutes') }),
            valign: Gtk.Align.CENTER
        });
        snoozeSpin.connect('value-changed', (w) => {
            settings.set_int('snooze-minutes', Math.floor(w.get_value()));
        });
        snoozeRow.add_suffix(snoozeSpin);
        alarmSettingsGroup.add(snoozeRow);

        const alarmDialogRow = new Adw.ActionRow({
            title: _('On-Screen Alarm Dialog'),
            subtitle: _('Show a dialog instead of a notification when an alarm rings, so it is not missed if notifications are silenced')
        });
        const alarmDialogSwitch = new Gtk.Switch({
            active: settings.get_boolean('alarm-dialog-enabled'),
            valign: Gtk.Align.CENTER
        });
        alarmDialogSwitch.connect('notify::active', (w) => {
            settings.set_boolean('alarm-dialog-enabled', w.active);
        });
        alarmDialogRow.add_suffix(alarmDialogSwitch);
        alarmSettingsGroup.add(alarmDialogRow);

        const aboutGroup = new Adw.PreferencesGroup({
            title: _('About'),
            description: _('Information and credits')
        });
        aboutPage.add(aboutGroup);

        const versionRow = new Adw.ActionRow({
            title: _('Version'),
            subtitle: `${this.metadata.name} v${this.metadata.version}`
        });
        versionRow.set_sensitive(false);
        aboutGroup.add(versionRow);

        const authorRow = new Adw.ActionRow({
            title: _('Author'),
            subtitle: 'Carlos Corral'
        });
        authorRow.set_sensitive(false);
        aboutGroup.add(authorRow);

        const repoRow = new Adw.ActionRow({
            title: _('Source Code'),
            subtitle: _('View on GitLab')
        });
        const repoButton = new Gtk.Button({
            label: _('Open Repository'),
            valign: Gtk.Align.CENTER
        });
        repoButton.connect('clicked', () => {
            const uri = this.metadata.url;
            if (uri) {
                Gio.app_info_launch_default_for_uri(uri, null);
            }
        });
        repoRow.add_suffix(repoButton);
        aboutGroup.add(repoRow);

        const supportGroup = new Adw.PreferencesGroup({
            title: _('Support Us')
        });
        aboutPage.add(supportGroup);

        const kofiRow = new Adw.ActionRow({
            title: _('Support on Ko-fi'),
            subtitle: _('Buy the developer a coffee')
        });
        const kofiButton = new Gtk.Button({
            label: _('Open Ko-fi'),
            valign: Gtk.Align.CENTER
        });
        kofiButton.connect('clicked', () => {
            const kofiUser = this.metadata.donations?.kofi;
            if (kofiUser) {
                Gio.app_info_launch_default_for_uri(`https://ko-fi.com/${kofiUser}`, null);
            }
        });
        kofiRow.add_suffix(kofiButton);
        supportGroup.add(kofiRow);

        const resetGroup = new Adw.PreferencesGroup({
            title: _('Reset'),
            description: _('Restore appearance and clock settings to their defaults. Your alarms are not affected.')
        });
        aboutPage.add(resetGroup);

        const resetRow = new Adw.ActionRow({ title: _('Reset to Defaults') });
        const resetButton = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action']
        });

        const resetToDefaults = () => {
            const keysToReset = [
                'font-size', 'clock-color', 'custom-color', 'glow-intensity',
                'clock-format-24h', 'show-seconds', 'show-date', 'panel-position',
                'is-widget', 'vertical-panel-layout', 'flicker-enabled', 'font-style', 'ghost-segments',
                'startup-lamp-test', 'minute-flicker', 'crt-scanlines', 'show-frame',
                'blink-dots', 'snooze-minutes', 'alarm-dialog-enabled'
            ];
            for (const key of keysToReset)
                settings.reset(key);

            widgetSwitch.set_active(settings.get_boolean('is-widget'));
            verticalLayoutSwitch.set_active(settings.get_boolean('vertical-panel-layout'));
            formatSwitch.set_active(settings.get_boolean('clock-format-24h'));
            secondsSwitch.set_active(settings.get_boolean('show-seconds'));
            dateSwitch.set_active(settings.get_boolean('show-date'));
            positionRow.set_selected(['left', 'center', 'right'].indexOf(settings.get_string('panel-position')));

            const color = settings.get_string('clock-color');
            colorRow.set_selected(colorKeys.indexOf(color));
            customColorRow.set_visible(color === 'custom');
            const defaultRgba = new Gdk.RGBA();
            defaultRgba.parse(settings.get_string('custom-color'));
            colorButton.set_rgba(defaultRgba);
            updateGlowLimit(color);
            glowSpin.set_value(settings.get_double('glow-intensity'));
            frameSwitch.set_active(settings.get_boolean('show-frame'));
            fontSpin.set_value(settings.get_double('font-size'));
            fontStyleRow.set_selected(fontStyleKeys.indexOf(settings.get_string('font-style')));
            blinkSwitch.set_active(settings.get_boolean('blink-dots'));
            flickerSwitch.set_active(settings.get_boolean('flicker-enabled'));
            ghostSwitch.set_active(settings.get_boolean('ghost-segments'));
            lampTestSwitch.set_active(settings.get_boolean('startup-lamp-test'));
            minuteFlickerSwitch.set_active(settings.get_boolean('minute-flicker'));
            scanlinesSwitch.set_active(settings.get_boolean('crt-scanlines'));
            snoozeSpin.set_value(settings.get_int('snooze-minutes'));
            alarmDialogSwitch.set_active(settings.get_boolean('alarm-dialog-enabled'));

            refreshPreview();
        };

        resetButton.connect('clicked', () => {
            const dialog = new Adw.MessageDialog({
                heading: _('Reset to Defaults?'),
                body: _('This will restore appearance and clock settings to their defaults. Your alarms will not be affected.'),
                transient_for: window,
                modal: true
            });
            dialog.add_response('cancel', _('Cancel'));
            dialog.add_response('reset', _('Reset'));
            dialog.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
            dialog.set_default_response('cancel');
            dialog.set_close_response('cancel');
            dialog.connect('response', (_dialog, response) => {
                if (response === 'reset') resetToDefaults();
            });
            dialog.present();
        });
        resetRow.add_suffix(resetButton);
        resetGroup.add(resetRow);

        // Settings changed elsewhere (e.g. the panel's quick color menu, a
        // separate process) propagate here via dconf, so this window needs
        // to listen instead of only reacting to its own widgets.
        //
        // `connectObject()` is a convenience the Shell process monkey-patches
        // onto GObject.Object; it does not exist in this separate Preferences
        // process, so plain `connect()` + manual disconnect on window close
        // is used instead.
        const externalSyncHandlerIds = [
            settings.connect('changed::clock-color', () => {
                const color = settings.get_string('clock-color');
                colorRow.set_selected(colorKeys.indexOf(color));
                customColorRow.set_visible(color === 'custom');
                updateGlowLimit(color);
                refreshPreview();
            }),
            settings.connect('changed::custom-color', () => {
                const rgba = new Gdk.RGBA();
                rgba.parse(isValidHex(settings.get_string('custom-color')) ? settings.get_string('custom-color') : '#00ff00');
                colorButton.set_rgba(rgba);
                refreshPreview();
            }),
            settings.connect('changed::glow-intensity', () => {
                glowSpin.set_value(settings.get_double('glow-intensity'));
                refreshPreview();
            }),
            settings.connect('changed::show-frame', () => {
                frameSwitch.set_active(settings.get_boolean('show-frame'));
                refreshPreview();
            }),
            settings.connect('changed::font-size', () => {
                fontSpin.set_value(settings.get_double('font-size'));
                refreshPreview();
            }),
            settings.connect('changed::font-style', () => {
                fontStyleRow.set_selected(fontStyleKeys.indexOf(settings.get_string('font-style')));
                refreshPreview();
            }),
            settings.connect('changed::alarms', () => refreshPreview())
        ];

        window.connect('close-request', () => {
            for (const id of externalSyncHandlerIds)
                settings.disconnect(id);
            return false;
        });

        window.add(generalPage);
        window.add(appearancePage);
        window.add(alarmsPage);
        window.add(aboutPage);
    }
}
