// One-off cleanup: removes data left behind by clients that were deleted before client deletion cascaded.
// Safe by default: it only REPORTS what it would delete. Pass --apply to actually delete.
//
//   node scripts/purge-orphans.js            (dry run, nothing is deleted)
//   node scripts/purge-orphans.js --apply    (deletes the orphaned rows and their uploaded files)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Client = require('../models/Client');
const { deleteClientData, targets } = require('../utils/clientCascade');

(async () => {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI);
  const live = new Set((await Client.find({}).select('clientId').lean()).map((c) => c.clientId));

  // Every client id mentioned anywhere that no longer has a Client record.
  const orphanIds = new Set();
  for (const [, Model] of targets('x')) {
    const fields = Model.schema.path('clientId') ? ['clientId'] : Model.schema.path('user') ? ['user'] : ['fromClientId', 'toClientId'];
    for (const field of fields) {
      (await Model.distinct(field)).forEach((id) => id && !live.has(id) && orphanIds.add(id));
    }
  }

  console.log(`${live.size} live clients, ${orphanIds.size} deleted client id(s) with leftover data.${apply ? '' : ' (dry run)'}`);
  const totals = {};
  for (const clientId of orphanIds) {
    const report = await deleteClientData({ clientId }, { dryRun: !apply });
    Object.entries(report).forEach(([k, v]) => { totals[k] = (totals[k] || 0) + v; });
  }
  console.log(apply ? 'Deleted:' : 'Would delete:', totals);
  if (!apply) console.log('Nothing was changed. Run again with --apply to delete.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
