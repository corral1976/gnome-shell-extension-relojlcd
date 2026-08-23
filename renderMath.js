const BASE_FONT_SIZE = 1.8;
const BASE_DOT_SIZE = 7;
const BASE_DOT_MARGIN = 6;
const RETRO_OFFSET_PER_GLOW_UNIT = 1.2;

export function calculateSizeScale(fontSize) {
    return Math.max(0.4, Math.min(2, fontSize / BASE_FONT_SIZE));
}

export function calculateRetroShadowOffset(glow, fontSize) {
    return glow * RETRO_OFFSET_PER_GLOW_UNIT * calculateSizeScale(fontSize);
}

export function calculateShadowExtent(glow, colorType, fontSize) {
    if (colorType === 'gray')
        return glow >= 1 ? calculateRetroShadowOffset(glow, fontSize) : 0;

    if (glow <= 0) return 0;

    const sizeScale = calculateSizeScale(fontSize);
    const shadowOpacity = Math.min(1, glow / 8);
    const shadowBlur = (2 + shadowOpacity * 10) * sizeScale;
    return Math.max(4 * sizeScale, shadowBlur * 1.5);
}

export function calculateDigitShadow(colorType, glow, glowColor, fontSize) {
    if (colorType === 'gray' && glow >= 1) {
        const shadowOffset = calculateRetroShadowOffset(glow, fontSize);
        return `${shadowOffset.toFixed(1)}px ${shadowOffset.toFixed(1)}px 0 rgba(80, 80, 80, 0.6)`;
    }

    if (glow > 0) {
        const sizeScale = calculateSizeScale(fontSize);
        const shadowOpacity = Math.min(1, glow / 8);
        const shadowBlur = (2 + shadowOpacity * 10) * sizeScale;
        const maxBlur = calculateShadowExtent(glow, colorType, fontSize);
        return `0 0 ${shadowBlur.toFixed(1)}px ${glowColor}, 0 0 ${maxBlur.toFixed(1)}px ${glowColor}`;
    }

    return 'none';
}

export function calculateAlarmDotSize(fontSize) {
    return Math.max(4, Math.min(14, BASE_DOT_SIZE * (fontSize / BASE_FONT_SIZE)));
}

export function calculateAlarmDotMargin(dotSize) {
    return (dotSize / BASE_DOT_SIZE) * BASE_DOT_MARGIN;
}
