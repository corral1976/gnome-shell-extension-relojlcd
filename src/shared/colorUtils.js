const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const PRESET_COLORS = {
    green: '#00ff00',
    amber: '#ffb000',
    ruby: '#ff5555',
    sapphire: '#0088ff',
    white: '#ffffff',
    violet: '#8b5cf6',
    gold: '#ffd700',
    teal: '#00e5c7',
    orange: '#ff7518'
};

export const THEME_KEYS = ['green', 'amber', 'gray', 'ruby', 'sapphire', 'white', 'violet', 'gold', 'teal', 'orange'];

export const RETRO_THEME = {
    main: '#000000',
    bg: 'rgba(120, 150, 100, 0.95)',
    border: '#6a8a5a'
};

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

export function buildTheme(hex) {
    return {
        main: hex,
        bg: hexToRgba(hex, 0.2),
        border: hex,
        glow: hexToRgba(hex, 0.8)
    };
}

export function buildCustomTheme(hex) {
    const base = isValidHex(hex) ? hex : '#00ff00';
    return buildTheme(base);
}
