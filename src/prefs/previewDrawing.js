import Gdk from 'gi://Gdk';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { hexToRgba, isValidHex, PRESET_COLORS } from '../shared/colorUtils.js';
import { calculateRetroShadowOffset, RETRO_SHADOW_RGBA } from '../shared/renderMath.js';
import {
    buildGlyphSvgMarkup,
    calculateCellPixelHeight,
    calculateCellPixelWidth,
    isBlankGlyph
} from '../shared/glyphAssets.js';

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

function rgbaStringTo01(str) {
    const match = str.match(/rgba?\(([^)]+)\)/);
    const parts = match[1].split(',').map(v => parseFloat(v.trim()));
    return { r: parts[0] / 255, g: parts[1] / 255, b: parts[2] / 255, a: parts[3] ?? 1 };
}

export function getPreviewColors(colorType, customHex) {
    if (colorType === 'gray') {
        return { main: RETRO_MAIN_COLOR, border: RETRO_BORDER_COLOR, bg: RETRO_BG_COLOR };
    }
    const base = colorType === 'custom'
        ? (isValidHex(customHex) ? customHex : '#00ff00')
        : (PRESET_COLORS[colorType] || PRESET_COLORS.green);
    return { main: base, border: base, bg: hexToRgba(base, 0.2) };
}

export function drawPreviewChrome(cr, width, height, colors, glowValue, isRetro, showFrame) {
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

function drawGlyph(cr, cache, char, color, fontSize, styleOptions, x, centerY, scale = 1) {
    const cellHeight = calculateCellPixelHeight(fontSize);
    const cellWidth = calculateCellPixelWidth(fontSize, char, styleOptions.italic);

    if (!isBlankGlyph(char)) {
        const pixbuf = rasterizeGlyph(cache, char, color, cellWidth * scale, cellHeight * scale, styleOptions);
        if (pixbuf) {
            cr.save();
            cr.translate(x, centerY - cellHeight / 2);
            if (scale > 1)
                cr.scale(cellWidth / pixbuf.get_width(), cellHeight / pixbuf.get_height());
            Gdk.cairo_set_source_pixbuf(cr, pixbuf, 0, 0);
            cr.paint();
            cr.restore();
        }
    }

    return cellWidth;
}

export function drawGlyphRow(cr, cache, text, color, fontSize, styleOptions, startX, centerY, scale = 1) {
    let x = startX;
    for (const char of text)
        x += drawGlyph(cr, cache, char, color, fontSize, styleOptions, x, centerY, scale);
    return x - startX;
}

export function drawAlarmIcon(cr, cache, slotX, centerY, slotWidth, fontSize, colors, glowValue, isRetro, styleOptions, scale = 1) {
    const iconOptions = { ...styleOptions, bold: true };
    const iconWidth = calculateCellPixelWidth(fontSize, 'alarm');
    const iconX = slotX + (slotWidth - iconWidth) / 2;

    if (isRetro && glowValue >= 1) {
        const shadowOffset = calculateRetroShadowOffset(glowValue, fontSize);
        drawGlyph(cr, cache, 'alarm', RETRO_SHADOW_RGBA, fontSize, iconOptions,
            iconX + shadowOffset, centerY + shadowOffset, scale);
    }

    drawGlyph(cr, cache, 'alarm', colors.main, fontSize, iconOptions, iconX, centerY, scale);
}
