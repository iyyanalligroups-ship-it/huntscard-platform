// Shared by the admin Activity logs and the client's own "My activity" page, so both count and group the
// same way: steps done, minutes online, "active now", and the India-time day.
const { ACTIVE_WINDOW_MS } = require('./activityLog');

const IST_TZ = '+05:30';
const activeCut = () => new Date(Date.now() - ACTIVE_WINDOW_MS);

// Steps done = all recorded steps except the "Logged in" and "Logged out" ones.
const thingsExpr = {
  $let: {
    vars: { n: { $subtract: ['$eventCount', { $add: [1, { $cond: [{ $ifNull: ['$endedAt', false] }, 1, 0] }] }] } },
    in: { $cond: [{ $gt: ['$$n', 0] }, '$$n', 0] },
  },
};
const minutesExpr = { $divide: [{ $subtract: [{ $ifNull: ['$endedAt', '$lastActivityAt'] }, '$startedAt'] }, 60000] };

// One card per India day for a match filter, newest first. `skip`/`limit` page it; `total` is the day count.
function dayCardsPipeline(match, { skip = 0, limit = 400 } = {}) {
  return [
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt', timezone: IST_TZ } },
        logins: { $sum: 1 },
        logouts: { $sum: { $cond: [{ $ifNull: ['$endedAt', false] }, 1, 0] } },
        things: { $sum: thingsExpr },
        minutes: { $sum: minutesExpr },
        lastSeen: { $max: '$lastActivityAt' },
        active: { $max: { $cond: [{ $and: [{ $eq: ['$endedAt', null] }, { $gt: ['$lastActivityAt', activeCut()] }] }, 1, 0] } },
      },
    },
    { $sort: { _id: -1 } },
    { $facet: { days: [{ $skip: skip }, { $limit: limit }], total: [{ $count: 'n' }] } },
  ];
}

const dayCardView = (d) => ({ day: d._id, logins: d.logins, logouts: d.logouts, things: d.things, minutes: Math.round(d.minutes), lastSeen: d.lastSeen, activeNow: d.active === 1 });

const sessionRow = (s) => ({
  sid: s.sid,
  platform: s.platform,
  startedAt: s.startedAt,
  endedAt: s.endedAt,
  endReason: s.endReason,
  lastActivityAt: s.lastActivityAt,
  things: Math.max(0, (s.eventCount || 0) - 1 - (s.endedAt ? 1 : 0)),
  minutes: Math.round(((s.endedAt || s.lastActivityAt) - s.startedAt) / 60000),
  active: !s.endedAt && s.lastActivityAt > activeCut(),
});

module.exports = { IST_TZ, activeCut, thingsExpr, minutesExpr, dayCardsPipeline, dayCardView, sessionRow };
