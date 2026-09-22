const GLYPH_VIEWBOX_HEIGHT = 1000;

const GLYPHS = {
    '0': { viewBoxX: -10, viewBoxWidth: 826, d: 'm130 955-31-31V510h27l4 5 62 61v317zm0-470-4 5H99V76l31-31 62 62v317zm14-454 31-31h466l31 31-62 62H206zm541 484 5-4h27v413l-31 31-62-62V576zm1-470 31 31v414h-27l-5-4-61-61V107zm-14 924-31 31H175l-31-31 62-62h404z', italicMaxYDelta: 500.0 },
    '1': { viewBoxX: -10, viewBoxWidth: 826, d: 'm685 515 5-4h27v413l-31 31-62-62V576zm1-470 31 31v414h-27l-5-4-61-61V107z', italicMaxYDelta: 455.0 },
    '2': { viewBoxX: -10, viewBoxWidth: 826, d: 'm130 955-31-31V510h27l4 5 62 61v317zm14-924 31-31h466l31 31-62 62H206zm527 470-47 46v-1H192v1l-48-47 48-47v1h432zm15-456 31 31v414h-27l-5-4-61-61V107zm-14 924-31 31H175l-31-31 62-62h404z', italicMaxYDelta: 500.0 },
    '3': { viewBoxX: -10, viewBoxWidth: 826, d: 'm144 31 31-31h466l31 31-62 62H206zm527 470-47 46v-1H192v1l-48-47 48-47v1h432zm14 14 5-4h27v413l-31 31-62-62V576zm1-470 31 31v414h-27l-5-4-61-61V107zm-14 924-31 31H175l-31-31 62-62h404z', italicMaxYDelta: 500.0 },
    '4': { viewBoxX: -10, viewBoxWidth: 826, d: 'm130 485-4 5H99V76l31-31 62 62v317zm541 16-47 46v-1H192v1l-48-47 48-47v1h432zm14 14 5-4h27v413l-31 31-62-62V576zm1-470 31 31v414h-27l-5-4-61-61V107z', italicMaxYDelta: 455.0 },
    '5': { viewBoxX: -10, viewBoxWidth: 826, d: 'm130 485-4 5H99V76l31-31 62 62v317zm14-454 31-31h466l31 31-62 62H206zm527 470-47 46v-1H192v1l-48-47 48-47v1h432zm14 14 5-4h27v413l-31 31-62-62V576zm-13 454-31 31H175l-31-31 62-62h404z', italicMaxYDelta: 500.0 },
    '6': { viewBoxX: -10, viewBoxWidth: 826, d: 'm130 955-31-31V510h27l4 5 62 61v317zm0-470-4 5H99V76l31-31 62 62v317zm14-454 31-31h466l31 31-62 62H206zm527 470-47 46v-1H192v1l-48-47 48-47v1h432zm14 14 5-4h27v413l-31 31-62-62V576zm-13 454-31 31H175l-31-31 62-62h404z', italicMaxYDelta: 500.0 },
    '7': { viewBoxX: -10, viewBoxWidth: 826, d: 'm130 485-4 5H99V76l31-31 62 62v317zm14-454 31-31h466l31 31-62 62H206zm541 484 5-4h27v413l-31 31-62-62V576zm1-470 31 31v414h-27l-5-4-61-61V107z', italicMaxYDelta: 500.0 },
    '8': { viewBoxX: -10, viewBoxWidth: 826, d: 'm130 955-31-31V510h27l4 5 62 61v317zm0-470-4 5H99V76l31-31 62 62v317zm14-454 31-31h466l31 31-62 62H206zm527 470-47 46v-1H192v1l-48-47 48-47v1h432zm14 14 5-4h27v413l-31 31-62-62V576zm1-470 31 31v414h-27l-5-4-61-61V107zm-14 924-31 31H175l-31-31 62-62h404z', italicMaxYDelta: 500.0 },
    '9': { viewBoxX: -10, viewBoxWidth: 826, d: 'm130 485-4 5H99V76l31-31 62 62v317zm14-454 31-31h466l31 31-62 62H206zm527 470-47 46v-1H192v1l-48-47 48-47v1h432zm14 14 5-4h27v413l-31 31-62-62V576zm1-470 31 31v414h-27l-5-4-61-61V107zm-14 924-31 31H175l-31-31 62-62h404z', italicMaxYDelta: 500.0 },
    'A': { viewBoxX: -10, viewBoxWidth: 826, d: 'm130 955-31-31v-414h27l4 5 62 61v317zm0-470-4 5h-27v-414l31-31 62 62v317zm14-454 31-31h466l31 31-62 62h-404zm527 470-47 46v-1h-432v1l-48-47 48-47v1h432zm14 14 5-4h27v413l-31 31-62-62v-317zm1-470 31 31v414h-27l-5-4-61-61v-318z', italicMaxYDelta: 500.0 },
    'M': { viewBoxX: -10, viewBoxWidth: 826, d: 'm130 955-31-31v-414h27l4 5 62 61v317zm0-470-4 5h-27v-414l31-31 62 62v317zm14-454 31-31h466l31 31-62 62h-404zm541 484 5-4h27v413l-31 31-62-62v-317zm1-470 31 31v414h-27l-5-4-61-61v-318z', italicMaxYDelta: 500.0 },
    'P': { viewBoxX: -10, viewBoxWidth: 826, d: 'm130 955-31-31v-414h27l4 5 62 61v317zm0-470-4 5h-27v-414l31-31 62 62v317zm14-454 31-31h466l31 31-62 62h-404zm527 470-47 46v-1h-432v1l-48-47 48-47v1h432zm15-456 31 31v414h-27l-5-4-61-61v-318z', italicMaxYDelta: 500.0 },
    ':': { viewBoxX: -10, viewBoxWidth: 210, d: 'M162 307q0 12-5 24t-13 20-20 13-24 5-24-5-20-13-13-20-5-24 5-24q5-11 13-19 10-9 20-14 9-4 24-4t24 4q11 5 20 14 8 8 13 19 5 12 5 24m0 412q0 12-5 24t-13 20-20 13-24 5-24-5-20-13-13-20-5-24 5-24q5-11 13-19 10-10 20-14 9-4 24-4t24 4q11 4 20 14 8 8 13 19 5 12 5 24', italicMaxYDelta: 281.0 },
    '-': { viewBoxX: -10, viewBoxWidth: 826, d: 'M671 501 624 547v-1H192v1L144 500l48-47v1h432z', italicMaxYDelta: 47.0 },
    'alarm': { viewBoxX: 0, viewBoxWidth: 350, d: 'M175 307.4c-25.2 0-45.45 20.25-45.45 45.45v6.75c-41.4 10.35-72.45 47.7-72.45 92.7v109.8l-35.55 35.55V626h306.9v-28.35L292.9 562.1V452.3c0-45-31.05-82.35-72.45-92.7v-6.75c0-25.2-20.25-45.45-45.45-45.45m0 28.35c9.45 0 17.1 7.65 17.1 17.1v4.05h-34.2v-4.05c0-9.45 7.65-17.1 17.1-17.1m0 49.05c37.35 0 61.2 28.35 61.2 67.5v117l24.75 28.35H89.05l24.75-28.35v-117c0-39.15 23.85-67.5 61.2-67.5m0 269.55c-22.05 0-40.5 16.65-44.55 37.8h89.1c-4.05-21.15-22.5-37.8-44.55-37.8', italicMaxYDelta: 192.6 }
};

const SPACE_ADVANCE_KEY = ':';

const BASE_FONT_PT = 11;
const PT_TO_PX = 96 / 72;

const ITALIC_SKEW_DEGREES = 10;
const BOLD_STROKE_WIDTH_RATIO = 0.055;

const SEGMENT_SHAPE_GLYPHS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'M', 'P', '-']);
const BOLD_SEGMENT_OFFSET = 30;
const BOLD_SEGMENT_EDGE_BAND = 0.25;
const BOLD_SEGMENT_TOP_ROLE_MAX_Y = 250;
const BOLD_SEGMENT_BOTTOM_ROLE_MIN_Y = 750;

export function isKnownGlyph(char) {
    return Object.prototype.hasOwnProperty.call(GLYPHS, char);
}

export function isBlankGlyph(char) {
    return char === ' ' || char === '\n';
}

function calculateItalicPad(glyph) {
    const tanSkew = Math.tan(ITALIC_SKEW_DEGREES * Math.PI / 180);
    return tanSkew * glyph.italicMaxYDelta;
}

export function getGlyphAspectRatio(char, italic = false) {
    const glyph = GLYPHS[isBlankGlyph(char) ? SPACE_ADVANCE_KEY : char];
    if (!glyph) return null;
    const width = italic ? glyph.viewBoxWidth + 2 * calculateItalicPad(glyph) : glyph.viewBoxWidth;
    return width / GLYPH_VIEWBOX_HEIGHT;
}

export function resolveGlyphStyleOptions(fontStyleKey) {
    return {
        italic: fontStyleKey === 'italic' || fontStyleKey === 'italic-bold',
        bold: fontStyleKey === 'bold' || fontStyleKey === 'italic-bold'
    };
}

function parseLinearSubpaths(d) {
    const subpaths = [];
    let current = null;
    let x = 0, y = 0, startX = 0, startY = 0;
    const commandPattern = /([MLHVZmlhvz])([^MLHVZmlhvz]*)/g;
    let match;
    while ((match = commandPattern.exec(d)) !== null) {
        const letter = match[1];
        const numbers = (match[2].match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
        if (letter === 'M' || letter === 'm') {
            for (let i = 0; i < numbers.length; i += 2) {
                if (letter === 'm') { x += numbers[i]; y += numbers[i + 1]; } else { x = numbers[i]; y = numbers[i + 1]; }
                if (i === 0) { current = [[x, y]]; startX = x; startY = y; } else { current.push([x, y]); }
            }
        } else if (letter === 'L' || letter === 'l') {
            for (let i = 0; i < numbers.length; i += 2) {
                if (letter === 'l') { x += numbers[i]; y += numbers[i + 1]; } else { x = numbers[i]; y = numbers[i + 1]; }
                current.push([x, y]);
            }
        } else if (letter === 'H' || letter === 'h') {
            for (const n of numbers) {
                x = letter === 'h' ? x + n : n;
                current.push([x, y]);
            }
        } else if (letter === 'V' || letter === 'v') {
            for (const n of numbers) {
                y = letter === 'v' ? y + n : n;
                current.push([x, y]);
            }
        } else {
            subpaths.push(current);
            current = null;
            x = startX; y = startY;
        }
    }
    return subpaths;
}

// A 7-segment bar thickens toward the LED it belongs to, never toward the
// case/neighbouring-digit edge, and never at the pointed tips where two bars
// meet — that's what keeps the dark separation gap between segments intact.
// A horizontal bar's role (top/middle/bottom) comes from where it sits in the
// glyph's own 0-1000 viewBox; a vertical bar's side comes from its position
// relative to the glyph's horizontal center.
function thickenSegmentSubpath(vertices, glyphCenterX) {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const [vx, vy] of vertices) {
        if (vx < xMin) xMin = vx;
        if (vx > xMax) xMax = vx;
        if (vy < yMin) yMin = vy;
        if (vy > yMax) yMax = vy;
    }
    const width = xMax - xMin;
    const height = yMax - yMin;

    if (width >= height) {
        const centerY = (yMin + yMax) / 2;
        let growTop = false, growBottom = false;
        if (centerY <= BOLD_SEGMENT_TOP_ROLE_MAX_Y) growBottom = true;
        else if (centerY >= BOLD_SEGMENT_BOTTOM_ROLE_MIN_Y) growTop = true;
        else { growTop = true; growBottom = true; }

        return vertices.map(([vx, vy]) => {
            const t = height > 0 ? (vy - yMin) / height : 0;
            if (growTop && t <= BOLD_SEGMENT_EDGE_BAND) return [vx, vy - BOLD_SEGMENT_OFFSET];
            if (growBottom && t >= 1 - BOLD_SEGMENT_EDGE_BAND) return [vx, vy + BOLD_SEGMENT_OFFSET];
            return [vx, vy];
        });
    }

    const leftSide = (xMin + xMax) / 2 < glyphCenterX;
    return vertices.map(([vx, vy]) => {
        const t = width > 0 ? (vx - xMin) / width : 0;
        if (leftSide && t >= 1 - BOLD_SEGMENT_EDGE_BAND) return [vx + BOLD_SEGMENT_OFFSET, vy];
        if (!leftSide && t <= BOLD_SEGMENT_EDGE_BAND) return [vx - BOLD_SEGMENT_OFFSET, vy];
        return [vx, vy];
    });
}

function buildBoldSegmentPathData(d, glyphCenterX) {
    return parseLinearSubpaths(d).map(vertices => {
        const thickened = thickenSegmentSubpath(vertices, glyphCenterX);
        const [firstX, firstY] = thickened[0];
        const rest = thickened.slice(1).map(([vx, vy]) => `L${vx.toFixed(1)},${vy.toFixed(1)}`).join(' ');
        return `M${firstX.toFixed(1)},${firstY.toFixed(1)} ${rest} Z`;
    }).join(' ');
}

export function buildGlyphSvgMarkup(char, color, options = {}) {
    const glyph = GLYPHS[char];
    if (!glyph) return null;

    const { italic = false, bold = false } = options;
    const useSegmentBold = bold && SEGMENT_SHAPE_GLYPHS.has(char);

    let pathD = glyph.d;
    let pathAttrs = `fill="${color}"`;
    if (useSegmentBold) {
        pathD = buildBoldSegmentPathData(glyph.d, glyph.viewBoxX + glyph.viewBoxWidth / 2);
    } else if (bold) {
        const strokeWidth = glyph.viewBoxWidth * BOLD_STROKE_WIDTH_RATIO;
        pathAttrs += ` stroke="${color}" stroke-width="${strokeWidth.toFixed(1)}" stroke-linejoin="round"`;
    }
    let pathMarkup = `<path ${pathAttrs} d="${pathD}"/>`;

    let viewBoxX = glyph.viewBoxX;
    let viewBoxWidth = glyph.viewBoxWidth;
    if (italic) {
        const centerY = GLYPH_VIEWBOX_HEIGHT / 2;
        const tanSkew = Math.tan(ITALIC_SKEW_DEGREES * Math.PI / 180);
        // skewX() always pivots around y=500; recenter the transform there.
        const recenterX = tanSkew * centerY;
        // Pad only for this glyph's actual ink extent (italicMaxYDelta), not
        // the full 0-1000 range, so glyphs whose ink stays near the vertical
        // center (colon, dash) don't get padded as if they were full-height.
        // Kept in sync with getGlyphAspectRatio() via calculateItalicPad() —
        // a mismatch here previously made italic cells render narrower than
        // their actual (padded) SVG content, squeezing the glyph sideways.
        const pad = calculateItalicPad(glyph);
        viewBoxX -= pad;
        viewBoxWidth += pad * 2;

        pathMarkup = `<g transform="translate(${recenterX.toFixed(2)},0) skewX(-${ITALIC_SKEW_DEGREES})">${pathMarkup}</g>`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxX} 0 ${viewBoxWidth} ${GLYPH_VIEWBOX_HEIGHT}">${pathMarkup}</svg>`;
}

const ITALIC_COLON_WIDTH_RATIO = 0.67;

export function calculateCellPixelHeight(fontSize) {
    return BASE_FONT_PT * PT_TO_PX * fontSize;
}

export function calculateCellPixelWidth(fontSize, char, italic = false) {
    const aspect = getGlyphAspectRatio(char, italic);
    if (aspect === null) return 0;
    let width = calculateCellPixelHeight(fontSize) * aspect;
    if (italic && (char === ':' || char === ' '))
        width *= ITALIC_COLON_WIDTH_RATIO;
    return width;
}

export function calculateRowPixelWidth(fontSize, text, italic = false) {
    let width = 0;
    for (const char of text) {
        if (char === '\n') continue;
        width += calculateCellPixelWidth(fontSize, char, italic);
    }
    return width;
}
