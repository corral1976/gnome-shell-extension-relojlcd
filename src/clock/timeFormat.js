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

export function formatTime(now, { is24h, showSeconds, showDate, isWidget, compact }, blink, dateFormat) {
    if (compact) {
        const format = is24h ? '%H\n%M' : '%I\n%M';
        return now.format(format);
    }

    const separatorOn = !blink || now.get_microsecond() < BLINK_ON_MICROSECONDS;
    const sepChar = separatorOn ? ':' : ' ';
    const sep = ` ${sepChar} `;

    const meridiem = now.get_hour() < 12 ? 'AM' : 'PM';

    let timeStr;
    if (showSeconds) {
        const format = is24h ? `%H${sep}%M${sep}%S` : `%I${sep}%M${sep}%S ${meridiem}`;
        timeStr = now.format(format);
    } else {
        const format = is24h ? `%H${sep}%M` : `%I${sep}%M ${meridiem}`;
        timeStr = now.format(format);
    }

    if (showDate) {
        const dateStr = now.format(DATE_FORMATS[dateFormat]);
        if (isWidget) {
            timeStr = `${timeStr}\n${dateStr}`;
        } else {
            timeStr = `${timeStr}  --  ${dateStr}`;
        }
    }

    return timeStr;
}

export function formatAccessibleTime(now, is24h, name) {
    const format = is24h ? '%H:%M' : '%I:%M %p';
    return `${name}, ${now.format(format)}`;
}
