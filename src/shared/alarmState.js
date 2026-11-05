const MILLISECONDS_PER_MINUTE = 60000;

export function isAlarmPending(alarm, nowMs) {
    if (!alarm.enabled) return false;
    if (alarm.year === undefined) return true;

    const dueMs = new Date(alarm.year, alarm.month - 1, alarm.day, alarm.hour, alarm.minute).getTime();
    return dueMs + MILLISECONDS_PER_MINUTE > nowMs;
}
