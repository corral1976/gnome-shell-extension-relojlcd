import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { isValidHex } from '../shared/colorUtils.js';
import { createPreview } from './previewArea.js';
import { addSwitchRow, bindChoiceRow, escapeMarkup } from './prefsHelpers.js';

const COLOR_KEYS = ['green', 'amber', 'gray', 'ruby', 'sapphire', 'white', 'violet', 'gold', 'teal', 'orange', 'custom'];
const FONT_STYLE_KEYS = ['regular', 'italic', 'bold', 'italic-bold'];

export function buildAppearancePage(settings, links) {
    const page = new Adw.PreferencesPage({
        title: _('Appearance'),
        icon_name: 'applications-graphics-symbolic'
    });

    const preview = createPreview(settings, links);
    page.add(preview.group);

    const colorGroup = new Adw.PreferencesGroup({
        title: escapeMarkup(_('Color & Glow')),
        description: _('Pick a theme and tune how it glows')
    });
    page.add(colorGroup);

    const colorRow = new Adw.ComboRow({
        title: _('Color Theme'),
        subtitle: _('Choose your preferred LCD color style'),
        model: new Gtk.StringList({
        strings: [
            _('Neon Green'), _('Vintage Amber'), _('Retro LCD'), _('Red Ruby'), _('Blue Sapphire'), _('White LED'),
            _('Violet Purple'), _('Gold'), _('VFD Teal'), _('Nixie Orange'), _('Custom Color')
        ]
    })
    });
    bindChoiceRow(settings, links, colorRow, 'clock-color', COLOR_KEYS);
    colorGroup.add(colorRow);

    const readCustomColor = () => {
        const rgba = new Gdk.RGBA();
        rgba.parse(isValidHex(settings.get_string('custom-color')) ? settings.get_string('custom-color') : '#00ff00');
        return rgba;
    };

    const customColorRow = new Adw.ActionRow({
        title: _('Custom Color'),
        subtitle: _('Applies to digits, separators, alarm bell and border')
    });
    const colorButton = new Gtk.ColorDialogButton({
        dialog: new Gtk.ColorDialog({ with_alpha: false }),
        rgba: readCustomColor(),
        valign: Gtk.Align.CENTER
    });
    colorButton.connect('notify::rgba', (w) => {
        const rgba = w.get_rgba();
        const hex = '#' + [rgba.red, rgba.green, rgba.blue]
            .map(v => Math.round(v * 255).toString(16).padStart(2, '0'))
            .join('');
        if (hex !== settings.get_string('custom-color'))
            settings.set_string('custom-color', hex);
    });
    links.connect('changed::custom-color', () => {
        colorButton.set_rgba(readCustomColor());
    });
    customColorRow.add_suffix(colorButton);
    colorGroup.add(customColorRow);

    const glowAdjustment = new Gtk.Adjustment({ lower: 0, upper: 10, step_increment: 1 });
    const glowRow = new Adw.ActionRow({
        title: _('Glow / Shadow Intensity'),
        subtitle: _('Control glow for colored themes or shadow strength for Retro LCD')
    });
    const glowSpin = new Gtk.SpinButton({
        adjustment: glowAdjustment,
        digits: 0,
        valign: Gtk.Align.CENTER
    });
    settings.bind('glow-intensity', glowSpin, 'value', Gio.SettingsBindFlags.DEFAULT);
    glowRow.add_suffix(glowSpin);
    colorGroup.add(glowRow);

    const syncColorDependents = () => {
        const color = settings.get_string('clock-color');
        customColorRow.set_visible(color === 'custom');

        const glowLimit = color === 'gray' ? 5 : 10;
        glowAdjustment.set_upper(glowLimit);
        if (settings.get_double('glow-intensity') > glowLimit)
            settings.set_double('glow-intensity', glowLimit);
    };
    syncColorDependents();
    links.connect('changed::clock-color', syncColorDependents);

    addSwitchRow(settings, colorGroup, 'show-frame',
        _('Display Border'),
        _('Hide the border outline around the display; the background and glow stay visible'));

    const textGroup = new Adw.PreferencesGroup({
        title: escapeMarkup(_('Font & Effects')),
        description: _('Adjust size, style and vintage display effects')
    });
    page.add(textGroup);

    const fontRow = new Adw.ActionRow({
        title: _('Font Size'),
        subtitle: _('Adjust the clock display size')
    });
    const fontSpin = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({ lower: 0.5, upper: 10.0, step_increment: 0.1, value: settings.get_double('font-size') }),
        digits: 1,
        valign: Gtk.Align.CENTER
    });
    fontSpin.connect('notify::value', (w) => {
        const size = Math.round(w.value * 10) / 10;
        if (size !== settings.get_double('font-size'))
            settings.set_double('font-size', size);
    });
    links.connect('changed::font-size', () => {
        const size = settings.get_double('font-size');
        if (Math.abs(fontSpin.value - size) > 1e-6)
            fontSpin.set_value(size);
    });
    fontRow.add_suffix(fontSpin);
    textGroup.add(fontRow);

    const fontStyleRow = new Adw.ComboRow({
        title: _('Font Style'),
        subtitle: _('Choose the font style (synthetic bold/italic)'),
        model: new Gtk.StringList({ strings: [_('Regular'), _('Italic'), _('Bold'), _('Italic Bold')] })
    });
    bindChoiceRow(settings, links, fontStyleRow, 'font-style', FONT_STYLE_KEYS);
    textGroup.add(fontStyleRow);

    addSwitchRow(settings, textGroup, 'sharp-digits',
        _('Sharp Digits (HiDPI)'),
        _('Draw the digits at the native screen resolution. Turn off for a softer, retro look on high-resolution screens. No effect on screens without scaling'));
    addSwitchRow(settings, textGroup, 'blink-dots',
        _('Blinking Separators'),
        _('Make the time separators blink for classic LCD effect'));
    addSwitchRow(settings, textGroup, 'flicker-enabled',
        _('Flicker Effect'),
        _('Add subtle random flicker for vintage LCD display feel'));
    addSwitchRow(settings, textGroup, 'ghost-segments',
        _('Ghost Segments'),
        _('Show the unlit 7-segment pattern faintly behind the digits'));
    addSwitchRow(settings, textGroup, 'startup-lamp-test',
        _('Lamp Test on Startup'),
        _('Briefly flash all segments when the extension starts'));
    addSwitchRow(settings, textGroup, 'minute-flicker',
        _('Minute Flicker'),
        _('Dip the brightness briefly whenever the minute changes'));
    addSwitchRow(settings, textGroup, 'crt-scanlines',
        _('CRT Scanlines'),
        _('Overlay faint horizontal scanlines for a CRT/VFD look'));

    return { page, refreshPreview: preview.refresh };
}
