const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHex(hex) {
    return typeof hex === 'string' && HEX_RE.test(hex);
}

export function hexToRgba(hex, alpha) {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function buildCustomTheme(hex) {
    const base = isValidHex(hex) ? hex : '#00ff00';
    return {
        main: base,
        bg: hexToRgba(base, 0.2),
        border: base,
        glow: hexToRgba(base, 0.8)
    };
}
