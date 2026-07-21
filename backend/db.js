const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
  }

  mongoose.connection.on('connected', () => {
    console.log('[db] connected to MongoDB');
  });
  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error:', err.message);
  });

  await mongoose.connect(uri);
}

module.exports = connectDB;
