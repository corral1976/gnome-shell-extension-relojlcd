import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk';
import { isValidHex, hexToRgba } from './colorUtils.js';

const PRESET_COLORS = {
    green: '#00ff00',
    amber: '#ffb000',
    gray: '#1a1a1a',
    ruby: '#ff5555',
    sapphire: '#0088ff',
    white: '#ffffff',
    violet: '#8b5cf6',
    gold: '#ffd700'
};

function hexTo01(hex) {
    const clean = hex.replace('#', '');
    return {
        r: parseInt(clean.substring(0, 2), 16) / 255,
        g: parseInt(clean.substring(2, 4), 16) / 255,
        b: parseInt(clean.substring(4, 6), 16) / 255
    };
}

function rgbaStringTo01(str) {
    const match = str.match(/rgba?\(([^)]+)\)/);
    const parts = match[1].split(',').map(v => parseFloat(v.trim()));
    return { r: parts[0] / 255, g: parts[1] / 255, b: parts[2] / 255, a: parts[3] ?? 1 };
}

function getPreviewColors(colorType, customHex) {
    if (colorType === 'gray') {
        return { main: '#1a1a1a', border: '#6a8a5a', bg: 'rgba(120, 150, 100, 0.95)' };
    }
    const base = colorType === 'custom'
        ? (isValidHex(customHex) ? customHex : '#00ff00')
        : (PRESET_COLORS[colorType] || PRESET_COLORS.green);
    return { main: base, border: base, bg: hexToRgba(base, 0.2) };
}

function drawClockPreview(cr, width, height, colors, glowValue, isRetro) {
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
    cr.fillPreserve();

    const border = hexTo01(colors.border);
    cr.setSourceRGBA(border.r, border.g, border.b, 1);
    cr.setLineWidth(1.5);
    cr.stroke();

    if (glowValue > 0 && !isRetro) {
        const glow = hexTo01(colors.main);
        const steps = 4;
        for (let i = steps; i >= 1; i--) {
            const alpha = (glowValue / 20) * 0.15 * (i / steps);
            roundedRect(4 - i * 1.5, 4 - i * 1.5, width - 8 + i * 3, height - 8 + i * 3, radius + i);
            cr.setSourceRGBA(glow.r, glow.g, glow.b, alpha);
            cr.setLineWidth(2);
            cr.stroke();
        }
    }

    const main = hexTo01(colors.main);

    cr.arc(width - 16, 16, 4, 0, 2 * Math.PI);
    cr.setSourceRGBA(main.r, main.g, main.b, 1);
    cr.fill();
}

function fontNeedsUpdate(sourceFile, destFile) {
    try {
        const sourceInfo = sourceFile.query_info('standard::size,time::modified', Gio.FileQueryInfoFlags.NONE, null);
        const destInfo = destFile.query_info('standard::size,time::modified', Gio.FileQueryInfoFlags.NONE, null);

        if (sourceInfo.get_size() !== destInfo.get_size())
            return true;

        return sourceInfo.get_modification_date_time().compare(destInfo.get_modification_date_time()) > 0;
    } catch (e) {
        return true;
    }
}

function installPreviewFonts(extensionPath) {
    const filenames = ['DSEG7Classic-Regular.ttf'];
    const fontsDirPath = GLib.build_filenamev([GLib.get_user_data_dir(), 'fonts']);
    const fontsDir = Gio.File.new_for_path(fontsDirPath);

    try {
        if (!fontsDir.query_exists(null))
            fontsDir.make_directory_with_parents(null);
    } catch (e) {
        return false;
    }

    let anyInstalled = false;
    for (const filename of filenames) {
        try {
            const sourceFile = Gio.File.new_for_path(GLib.build_filenamev([extensionPath, 'assets', filename]));
            if (!sourceFile.query_exists(null))
                continue;

            const destFile = fontsDir.get_child(filename);
            if (!destFile.query_exists(null) || fontNeedsUpdate(sourceFile, destFile))
                sourceFile.copy(destFile, Gio.FileCopyFlags.OVERWRITE, null, null);
            anyInstalled = true;
        } catch (e) {
            continue;
        }
    }
    return anyInstalled;
}

export default class RelojLCDPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();

        const previewFontOk = installPreviewFonts(this.path);
        const previewFontFamily = previewFontOk ? 'DSEG7 Classic' : 'Monospace';

        const dateGroup = new Adw.PreferencesGroup({
            title: _('Current Date'),
            description: GLib.DateTime.new_now_local().format('%A, %d %B %Y')
        });
        page.add(dateGroup);

        const displayGroup = new Adw.PreferencesGroup({
            title: _('Visual Appearance'),
            description: _('Customize the clock display and colors')
        });
        page.add(displayGroup);

        const widgetRow = new Adw.ActionRow({
            title: _('Desktop Widget Mode'),
            subtitle: _('Show clock on desktop instead of the top bar')
        });
        const widgetSwitch = new Gtk.Switch({
            active: settings.get_boolean('is-widget'),
            valign: Gtk.Align.CENTER
        });
        widgetSwitch.connect('notify::active', (w) => {
            settings.set_boolean('is-widget', w.active);
        });
        widgetRow.add_suffix(widgetSwitch);
        displayGroup.add(widgetRow);

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
        displayGroup.add(formatRow);

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
        displayGroup.add(secondsRow);

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
        displayGroup.add(dateRow);

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
        displayGroup.add(blinkRow);

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
        displayGroup.add(flickerRow);

        const fontRow = new Adw.ActionRow({
            title: _('Font Size'),
            subtitle: _('Adjust the clock display size')
        });
        const fontSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({ lower: 1.0, upper: 10.0, step_increment: 0.1, value: settings.get_double('font-size') }),
            digits: 1,
            valign: Gtk.Align.CENTER
        });
        fontSpin.connect('value-changed', (w) => {
            const size = Math.round(w.get_value() * 10) / 10;
            settings.set_double('font-size', size);
            updatePreviewLabel();
        });
        fontRow.add_suffix(fontSpin);
        displayGroup.add(fontRow);

        const fontStyleKeys = ['regular', 'italic', 'bold', 'italic-bold'];
        const fontStyleRow = new Adw.ComboRow({
            title: _('Font Style'),
            subtitle: _('Choose the font style (synthetic bold/italic by Pango)'),
            model: new Gtk.StringList({ strings: [_('Regular'), _('Italic'), _('Bold'), _('Italic Bold')] }),
            selected: fontStyleKeys.indexOf(settings.get_string('font-style'))
        });
        fontStyleRow.connect('notify::selected', (w) => {
            const style = fontStyleKeys[w.selected];
            settings.set_string('font-style', style);
            updatePreviewLabel();
        });
        displayGroup.add(fontStyleRow);

        const colorKeys = ['green', 'amber', 'gray', 'ruby', 'sapphire', 'white', 'violet', 'gold', 'custom'];

        const previewArea = new Gtk.DrawingArea({
            content_width: 260,
            content_height: 80,
            halign: Gtk.Align.CENTER
        });
        previewArea.set_draw_func((area, cr, width, height) => {
            const colorType = settings.get_string('clock-color');
            const colors = getPreviewColors(colorType, settings.get_string('custom-color'));
            drawClockPreview(cr, width, height, colors, settings.get_double('glow-intensity'), colorType === 'gray');
        });

        const previewLabel = new Gtk.Label({
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER
        });

        const previewOverlay = new Gtk.Overlay({
            halign: Gtk.Align.CENTER,
            margin_top: 6,
            margin_bottom: 6
        });
        previewOverlay.set_child(previewArea);
        previewOverlay.add_overlay(previewLabel);

        const updatePreviewLabel = () => {
            const colorType = settings.get_string('clock-color');
            const colors = getPreviewColors(colorType, settings.get_string('custom-color'));
            const fontSize = Math.max(1.0, Math.min(settings.get_double('font-size'), 3.0));
            const sizePt = Math.round(22 * fontSize * 1024);
            const fontStyle = settings.get_string('font-style');
            let pangoWeight = 'normal';
            let pangoStyle = 'normal';
            if (fontStyle === 'italic') {
                pangoStyle = 'italic';
            } else if (fontStyle === 'bold') {
                pangoWeight = 'bold';
            } else if (fontStyle === 'italic-bold') {
                pangoStyle = 'italic';
                pangoWeight = 'bold';
            }
            previewLabel.set_markup(
                `<span font_family="${previewFontFamily}" size="${sizePt}" style="${pangoStyle}" weight="${pangoWeight}" foreground="${colors.main}">88:88</span>`
            );
        };
        updatePreviewLabel();

        const previewRow = new Adw.PreferencesGroup({ description: _('Live preview') });
        previewRow.add(previewOverlay);
        displayGroup.add(previewRow);

        const colorRow = new Adw.ComboRow({
            title: _('Color Theme'),
            subtitle: _('Choose your preferred LCD color style'),
            model: new Gtk.StringList({ strings: [_('Neon Green'), _('Vintage Amber'), _('Retro LCD'), _('Red Ruby'), _('Blue Sapphire'), _('White LED'), _('Violet Purple'), _('Gold'), _('Custom Color')] }),
            selected: colorKeys.indexOf(settings.get_string('clock-color'))
        });
        displayGroup.add(colorRow);

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
            previewArea.queue_draw();
            updatePreviewLabel();
        });
        customColorRow.add_suffix(colorButton);
        customColorRow.set_visible(settings.get_string('clock-color') === 'custom');
        displayGroup.add(customColorRow);

        colorRow.connect('notify::selected', (w) => {
            const color = colorKeys[w.selected];
            settings.set_string('clock-color', color);
            customColorRow.set_visible(color === 'custom');
            updateGlowLimit(color);
            previewArea.queue_draw();
            updatePreviewLabel();
        });

        const glowAdjustment = new Gtk.Adjustment({ lower: 0, upper: 20, step_increment: 1, value: settings.get_double('glow-intensity') });
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
            glowAdjustment.set_upper(isRetro ? 10 : 20);
            if (isRetro && glowAdjustment.get_value() > 10) {
                glowAdjustment.set_value(10);
                settings.set_double('glow-intensity', 10);
            }
        };

        updateGlowLimit(settings.get_string('clock-color'));

        glowSpin.connect('value-changed', (w) => {
            const intensity = Math.floor(w.get_value());
            settings.set_double('glow-intensity', intensity);
            previewArea.queue_draw();
        });
        glowRow.add_suffix(glowSpin);
        displayGroup.add(glowRow);

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
        displayGroup.add(positionRow);

        const alarmGroup = new Adw.PreferencesGroup({
            title: _('Alarm Configuration'),
            description: _('Configure alarm time and notification settings')
        });
        page.add(alarmGroup);

        const alarmEnabledRow = new Adw.ActionRow({
            title: _('Enable Alarm'),
            subtitle: _('Turn on the alarm functionality')
        });
        const alarmEnabledSwitch = new Gtk.Switch({
            active: settings.get_boolean('alarm-enabled'),
            valign: Gtk.Align.CENTER
        });
        alarmEnabledSwitch.connect('notify::active', (w) => {
            settings.set_boolean('alarm-enabled', w.active);
        });
        alarmEnabledRow.add_suffix(alarmEnabledSwitch);
        alarmGroup.add(alarmEnabledRow);

        const alarmTimeRow = new Adw.ActionRow({
            title: _('Alarm Time'),
            subtitle: _('Set the hour and minute for the alarm')
        });
        const hourSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 23, step_increment: 1, value: settings.get_int('alarm-hour') }),
            valign: Gtk.Align.CENTER,
            wrap: true
        });
        const minuteSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 59, step_increment: 1, value: settings.get_int('alarm-minute') }),
            valign: Gtk.Align.CENTER,
            wrap: true
        });
        hourSpin.connect('value-changed', (w) => {
            const hour = Math.floor(w.get_value());
            settings.set_int('alarm-hour', hour);
        });
        minuteSpin.connect('value-changed', (w) => {
            const minute = Math.floor(w.get_value());
            settings.set_int('alarm-minute', minute);
        });
        alarmTimeRow.add_suffix(hourSpin);
        alarmTimeRow.add_suffix(new Gtk.Label({ label: ' : ' }));
        alarmTimeRow.add_suffix(minuteSpin);
        alarmGroup.add(alarmTimeRow);

        const alarmMessageRow = new Adw.EntryRow({
            title: _('Alarm Message'),
            text: settings.get_string('alarm-message')
        });
        alarmMessageRow.connect('changed', (w) => settings.set_string('alarm-message', w.get_text()));
        alarmGroup.add(alarmMessageRow);

        const aboutGroup = new Adw.PreferencesGroup({
            title: _('About'),
            description: _('Information and credits')
        });
        page.add(aboutGroup);

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

        window.add(page);
    }
}
