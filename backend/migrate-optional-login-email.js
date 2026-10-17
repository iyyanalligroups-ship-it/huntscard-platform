// Converts the Clients loginEmail index from a normal unique index to a
// partial unique index. Supplied email addresses stay unique, while documents
// without loginEmail are excluded so multiple phone-only accounts can exist.
//
// Preview only (default): npm run migrate:optional-email
// Apply changes:          npm run migrate:optional-email -- --apply
require('dotenv').config();
const mongoose = require('mongoose');

const apply = process.argv.includes('--apply');

function isLoginEmailIndex(index) {
  return index?.key && Object.keys(index.key).length === 1 && index.key.loginEmail === 1;
}

function isDesiredIndex(index) {
  return Boolean(
    index?.unique
    && index?.partialFilterExpression?.loginEmail?.$type === 'string'
  );
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI);

  const clients = mongoose.connection.collection('clients');
  const indexes = await clients.indexes();
  const currentIndex = indexes.find(isLoginEmailIndex);
  const emptyEmailCount = await clients.countDocuments({
    $or: [{ loginEmail: '' }, { loginEmail: { $type: 'null' } }],
  });
  const duplicates = await clients.aggregate([
    { $match: { loginEmail: { $type: 'string', $ne: '' } } },
    { $group: { _id: { $toLower: '$loginEmail' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 5 },
  ]).toArray();

  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: clients.loginEmail optional-index migration`);
  console.log(`Current index: ${currentIndex ? currentIndex.name : 'none'}`);
  console.log(`Empty/null email values to unset: ${emptyEmailCount}`);
  console.log(`Duplicate non-empty emails: ${duplicates.length}`);

  if (duplicates.length > 0) {
    throw new Error('Duplicate login emails exist. Resolve them before changing the unique index.');
  }
  if (!apply) {
    console.log('No database changes made. Re-run with --apply to migrate.');
    return;
  }

  if (emptyEmailCount > 0) {
    await clients.updateMany(
      { $or: [{ loginEmail: '' }, { loginEmail: { $type: 'null' } }] },
      { $unset: { loginEmail: '' } }
    );
  }

  if (currentIndex && !isDesiredIndex(currentIndex)) {
    await clients.dropIndex(currentIndex.name);
  }
  if (!currentIndex || !isDesiredIndex(currentIndex)) {
    await clients.createIndex(
      { loginEmail: 1 },
      {
        name: 'loginEmail_1',
        unique: true,
        partialFilterExpression: { loginEmail: { $type: 'string' } },
      }
    );
  }

  const migratedIndex = (await clients.indexes()).find(isLoginEmailIndex);
  if (!isDesiredIndex(migratedIndex)) {
    throw new Error('loginEmail index verification failed');
  }
  console.log('Migration complete: loginEmail is optional and supplied emails remain unique.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
