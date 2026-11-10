/* global jest, describe, test, expect, beforeEach, afterEach, afterAll */
import { AppState } from 'react-native';

// A login token the tracker can read (it never checks the signature; the server does).
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const makeToken = (claims) => `h.${b64url(claims)}.s`;
const UPGRADED = makeToken({ type: 'client', clientId: 'c1', sid: 'sid-new' });

jest.mock('../src/api/client.js', () => ({
  API_URL: 'http://api.test',
  readSession: jest.fn(),
  refreshSession: jest.fn(),
}));
const client = require('../src/api/client.js');
const T = require('../src/lib/activityTracker.js');

const GOOD = makeToken({ type: 'client', clientId: 'c1', sid: 'sid-1' });
let fetchMock;

beforeEach(() => {
  T._reset();
  fetchMock = jest.fn(() => Promise.resolve({ status: 204 }));
  T._setDeps({ fetch: fetchMock });
  client.refreshSession.mockReset();
  client.readSession.mockReset();
});
afterEach(() => { jest.useRealTimers(); });
afterAll(() => { T._reset(); });

const sentLabels = () => fetchMock.mock.calls.flatMap(([, init]) => JSON.parse(init.body).events.map((e) => e.label));

describe('activity tracker (phone app)', () => {
  test('records nothing while nobody is logged in', async () => {
    T.recordScreen('Contacts');
    T.recordTap('Save');
    await T.flushActivity();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('sends screens and taps in one batch, with the token and the app marker', async () => {
    T.setActivityToken(GOOD);
    T.recordScreen('Appointment Requests');
    T.recordTap('Save contact');
    await T.flushActivity();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/api/profile/activity-events');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${GOOD}`);
    expect(init.headers['X-Client-Platform']).toBe('app');
    const events = JSON.parse(init.body).events;
    expect(events.map((e) => e.label)).toEqual(['Opened screen: Appointment Requests', 'Tapped "Save contact"']);
    expect(events[0].page).toBe('/screen/appointment-requests');
    expect(typeof events[0].at).toBe('number');
  });

  test('a double tap is one step; a different button is another', () => {
    T.setActivityToken(GOOD);
    T.recordTap('Save');
    T.recordTap('Save');
    T.recordTap('Cancel');
    expect(T._queued().map((e) => e.label)).toEqual(['Tapped "Save"', 'Tapped "Cancel"']);
  });

  test('empty or non-text labels are ignored, long labels are shortened', () => {
    T.setActivityToken(GOOD);
    T.recordTap('');
    T.recordTap(undefined);
    T.recordTap({ not: 'text' });
    T.recordTap('x'.repeat(200));
    const q = T._queued();
    expect(q).toHaveLength(1);
    expect(q[0].label.length).toBeLessThanOrEqual(70);
    expect(q[0].label.endsWith('…"')).toBe(true);
  });

  test('an admin viewing as the user is never tracked', async () => {
    T.setActivityToken(makeToken({ type: 'client', clientId: 'c1', sid: 's', impersonatedBy: 'admin@example.com' }));
    T.recordScreen('Dashboard');
    await T.flushActivity();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('logging out clears what was waiting', async () => {
    T.setActivityToken(GOOD);
    T.recordTap('Something');
    T.setActivityToken(null);
    await T.flushActivity();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(T._queued()).toEqual([]);
  });

  test('an old login without a session id is upgraded once, and steps wait for the new token', async () => {
    const OLD = makeToken({ type: 'client', clientId: 'c1' });
    client.refreshSession.mockResolvedValue(true);
    client.readSession.mockResolvedValue({ token: UPGRADED });
    T.setActivityToken(OLD);
    T.recordScreen('Dashboard');
    await T.flushActivity({ timeoutMs: 50 }); // still the old token: nothing is sent yet
    expect(fetchMock).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 20)); // the upgrade finishes
    expect(client.refreshSession).toHaveBeenCalledTimes(1);
    await T.flushActivity();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${UPGRADED}`);
    expect(sentLabels()).toEqual(['Opened screen: Dashboard']);
  });

  test('offline: the batch waits and is sent when the connection is back', async () => {
    T.setActivityToken(GOOD);
    T.recordTap('Pay');
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('Network request failed')));
    await T.flushActivity();
    expect(T._queued().map((e) => e.label)).toEqual(['Tapped "Pay"']);
    await T.flushActivity();
    expect(fetchMock).toHaveBeenCalledTimes(2); // the failed try, then the one that worked
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).events.map((e) => e.label)).toEqual(['Tapped "Pay"']);
    expect(T._queued()).toEqual([]);
  });

  test('a server error is retried, a refusal (4xx) is dropped', async () => {
    T.setActivityToken(GOOD);
    T.recordTap('One');
    fetchMock.mockImplementationOnce(() => Promise.resolve({ status: 503 }));
    await T.flushActivity();
    expect(T._queued()).toHaveLength(1);
    fetchMock.mockImplementationOnce(() => Promise.resolve({ status: 401 }));
    await T.flushActivity();
    expect(T._queued()).toEqual([]);
  });

  test('at most 40 steps per call; the rest follow in the next call', async () => {
    T.setActivityToken(GOOD);
    for (let i = 0; i < 55; i += 1) T.recordTap(`Button ${i}`);
    await T.flushActivity();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).events).toHaveLength(40);
    await T.flushActivity();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).events).toHaveLength(15);
  });

  test('the queue never grows without limit', () => {
    T.setActivityToken(GOOD);
    for (let i = 0; i < 400; i += 1) T.recordTap(`Button ${i}`);
    expect(T._queued().length).toBeLessThanOrEqual(200);
  });

  test('steps are sent by themselves after the 4 second window', async () => {
    jest.useFakeTimers();
    T.setActivityToken(GOOD);
    T.recordTap('Auto');
    expect(fetchMock).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(4100);
    expect(sentLabels()).toEqual(['Tapped "Auto"']);
  });

  test('leaving the app sends at once and notes it; coming back is noted too', async () => {
    let handler;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, h) => { handler = h; return { remove: jest.fn() }; });
    const stop = T.startActivityTracking();
    T.setActivityToken(GOOD);
    handler('background');
    await new Promise((r) => setTimeout(r, 10));
    expect(sentLabels()).toEqual(['Left the app']);
    handler('active');
    expect(T._queued().map((e) => e.label)).toEqual(['Came back to the app']);
    stop();
    spy.mockRestore();
  });

  test('never throws, even when everything fails', async () => {
    T.setActivityToken(GOOD);
    fetchMock.mockImplementation(() => { throw new Error('boom'); });
    T.recordTap('x');
    await expect(T.flushActivity()).resolves.not.toThrow();
  });
});
