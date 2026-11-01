import { DIGIT_BLANK } from '../shared/glyphAssets.js';
import { buildDateDivider, buildSeparator } from '../shared/timeLayout.js';

const DATE_FORMATS = {
    dmy: '%d-%m-%Y',
    mdy: '%m-%d-%Y',
    ymd: '%Y-%m-%d'
};
const CLOCK_TICK_INTERVAL_MS = 1000;
const CLOCK_BLINK_TICK_INTERVAL_MS = 500;
const CLOCK_TICK_MARGIN_MS = 10;
const BLINK_ON_MICROSECONDS = 500000;

export function calculateTickDelayMs(microsecond, blink) {
    const intervalMs = blink ? CLOCK_BLINK_TICK_INTERVAL_MS : CLOCK_TICK_INTERVAL_MS;
    const elapsedMs = Math.floor(microsecond / 1000) % intervalMs;
    return intervalMs - elapsedMs + CLOCK_TICK_MARGIN_MS;
}

function formatHour(now, is24h) {
    if (is24h) return now.format('%H');

    const hour = now.get_hour() % 12 || 12;
    return hour < 10 ? `${DIGIT_BLANK}${hour}` : `${hour}`;
}

export function formatTime(now, { is24h, showSeconds, showDate, isWidget, compact, condensed }, blink, dateFormat) {
    const hour = formatHour(now, is24h);
    if (compact) return `${hour}\n${now.format('%M')}`;

    const separatorOn = !blink || now.get_microsecond() < BLINK_ON_MICROSECONDS;
    const separator = buildSeparator(separatorOn ? ':' : ' ', condensed);

    const units = [hour, now.format('%M')];
    if (showSeconds) units.push(now.format('%S'));
    let timeStr = units.join(separator);
    if (!is24h) timeStr += ` ${now.get_hour() < 12 ? 'AM' : 'PM'}`;

    if (showDate) {
        const dateStr = now.format(DATE_FORMATS[dateFormat]);
        if (isWidget) {
            timeStr = `${timeStr}\n${dateStr}`;
        } else {
            timeStr = `${timeStr}${buildDateDivider(condensed)}${dateStr}`;
        }
    }

    return timeStr;
}

export function formatAccessibleTime(now, is24h, name) {
    const format = is24h ? '%H:%M' : '%I:%M %p';
    return `${name}, ${now.format(format)}`;
}
