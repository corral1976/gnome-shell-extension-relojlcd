const BASE_FONT_SIZE = 1.8;
const RETRO_OFFSET_PER_GLOW_UNIT = 1.2;

export const RETRO_SHADOW_RGBA = 'rgba(80, 80, 80, 0.6)';

export function calculateSizeScale(fontSize) {
    return Math.max(0.4, Math.min(2, fontSize / BASE_FONT_SIZE));
}

export function calculateRetroShadowOffset(glow, fontSize) {
    return glow * RETRO_OFFSET_PER_GLOW_UNIT * calculateSizeScale(fontSize);
}


