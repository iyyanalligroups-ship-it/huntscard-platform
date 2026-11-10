/* global describe, test, expect */
import { dayKeyOf, fmtDay, fmtTime, minutesText, plural } from '../src/lib/activityFormat.js';

describe('My activity formatting (India time)', () => {
  test('times are shown in IST, 12-hour', () => {
    expect(fmtTime('2026-11-02T04:30:00Z')).toBe('10:00:00 am');
    expect(fmtTime('2026-11-02T18:30:00Z')).toBe('12:00:00 am'); // India midnight
    expect(fmtTime('2026-11-02T06:30:05Z')).toBe('12:00:05 pm');
    expect(fmtTime('2026-11-02T18:20:00Z')).toBe('11:50:00 pm');
    expect(fmtTime(null)).toBe('—');
  });

  test('a day key is shown with its weekday', () => {
    expect(fmtDay('2026-11-02')).toBe('Mon, 02 Nov 2026');
    expect(fmtDay('2026-12-31')).toBe('Thu, 31 Dec 2026');
    expect(fmtDay('')).toBe('');
  });

  test('minutes and plurals', () => {
    expect(minutesText(0)).toBe('0 min');
    expect(minutesText(33)).toBe('33 min');
    expect(minutesText(65)).toBe('1 h 5 min');
    expect(plural(1, 'time')).toBe('1 time');
    expect(plural(3, 'time')).toBe('3 times');
    expect(plural(2, 'day')).toBe('2 days');
  });

  test('a picked date becomes YYYY-MM-DD in the person\'s own calendar', () => {
    expect(dayKeyOf(new Date(2026, 10, 5))).toBe('2026-11-05');
    expect(dayKeyOf(null)).toBe('');
  });
});
