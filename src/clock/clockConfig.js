import { buildCustomTheme, buildTheme, PRESET_COLORS } from '../shared/colorUtils.js';
import { calculateRetroShadowOffset } from '../shared/renderMath.js';

export const COMPACT_HORIZONTAL_PADDING = 3;

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

export function getTheme(settings, colorType) {
    if (colorType === 'custom')
        return buildCustomTheme(settings.get_string('custom-color'));
    return THEME_MAP[colorType] || THEME_MAP.green;
}

export function readLayoutFlags(settings) {
    const isWidget = settings.get_boolean('is-widget');
    const compact = !isWidget && settings.get_boolean('vertical-panel-layout');
    return {
        isWidget,
        compact,
        showSeconds: compact ? false : settings.get_boolean('show-seconds'),
        showDate: compact ? false : settings.get_boolean('show-date'),
        is24h: settings.get_boolean('clock-format-24h')
    };
}

export function getPlaceholderText({ showSeconds, showDate, isWidget, is24h, compact }) {
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

function calculateHorizontalPadding(fontSize, showSeconds, glow, colorType) {
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

export function readStyleConfig(settings, fontSize) {
    const layout = readLayoutFlags(settings);
    const colorType = settings.get_string('clock-color');
    const glow = settings.get_double('glow-intensity');
    return {
        ...layout,
        fontSize,
        colorType,
        glow,
        fontStyle: settings.get_string('font-style'),
        showFrame: settings.get_boolean('show-frame'),
        horizontalPadding: layout.compact
            ? COMPACT_HORIZONTAL_PADDING
            : calculateHorizontalPadding(fontSize, layout.showSeconds, glow, colorType)
    };
}
