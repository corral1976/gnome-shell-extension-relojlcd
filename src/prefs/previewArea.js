import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { calculateRetroShadowOffset, RETRO_SHADOW_RGBA } from '../shared/renderMath.js';
import {
    calculateAlarmIconGap,
    calculateCellPixelHeight,
    calculateCellPixelWidth,
    calculateRowPixelWidth,
    resolveGlyphStyleOptions
} from '../shared/glyphAssets.js';
import { buildSeparator } from '../shared/timeLayout.js';
import { drawAlarmIcon, drawGlyphRow, drawPreviewChrome, getPreviewColors } from './previewDrawing.js';
import { parseAlarms } from './prefsHelpers.js';

const PREVIEW_MAX_FONT_SIZE = 4;

export function createPreview(settings, links) {
    const glyphPreviewCache = new Map();

    const previewArea = new Gtk.DrawingArea({
        content_width: 260,
        content_height: 80,
        halign: Gtk.Align.CENTER,
        margin_top: 6,
        margin_bottom: 6
    });

    const computePreviewLayout = () => {
        const fontSize = Math.min(settings.get_double('font-size'), PREVIEW_MAX_FONT_SIZE);
        const styleOptions = resolveGlyphStyleOptions(settings.get_string('font-style'));
        const hasEnabledAlarm = parseAlarms(settings.get_string('alarms')).some(alarm => alarm.enabled);
        const previewText = ['88', '88'].join(buildSeparator(':', settings.get_boolean('condensed-mode')));
        const cellHeight = calculateCellPixelHeight(fontSize);
        const rowWidth = calculateRowPixelWidth(fontSize, previewText, styleOptions.italic);
        const alarmSlotWidth = hasEnabledAlarm ? calculateCellPixelWidth(fontSize, 'alarm', styleOptions.italic) : 0;
        const alarmMargin = hasEnabledAlarm ? calculateAlarmIconGap(fontSize) : 0;
        return {
            fontSize, styleOptions, hasEnabledAlarm, previewText, cellHeight, rowWidth, alarmSlotWidth, alarmMargin,
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
        const scale = settings.get_boolean('sharp-digits') ? Math.max(1, area.get_scale_factor()) : 1;

        drawPreviewChrome(cr, width, height, colors, glowValue, isRetro, showFrame);

        const centerY = height / 2;
        let x = (width - layout.totalWidth) / 2;

        if (layout.hasEnabledAlarm) {
            drawAlarmIcon(cr, glyphPreviewCache, x, centerY, layout.alarmSlotWidth, layout.fontSize,
                colors, glowValue, isRetro, layout.styleOptions, scale);
            x += layout.alarmSlotWidth + layout.alarmMargin;
        }

        if (isRetro && glowValue >= 1) {
            const shadowOffset = calculateRetroShadowOffset(glowValue, layout.fontSize);
            drawGlyphRow(cr, glyphPreviewCache, layout.previewText, RETRO_SHADOW_RGBA, layout.fontSize,
                layout.styleOptions, x + shadowOffset, centerY + shadowOffset, scale);
        }

        drawGlyphRow(cr, glyphPreviewCache, layout.previewText, colors.main, layout.fontSize,
            layout.styleOptions, x, centerY, scale);
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

    const previewKeys = new Set([
        'clock-color', 'custom-color', 'glow-intensity', 'show-frame',
        'font-size', 'font-style', 'sharp-digits', 'alarms', 'condensed-mode'
    ]);
    links.connect('changed', (source, key) => {
        if (previewKeys.has(key))
            refreshPreview();
    });

    return { group: previewGroup, refresh: refreshPreview };
}
