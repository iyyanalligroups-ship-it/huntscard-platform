/**
 * Seeds the four real card plans: Basic, Premium, Elite, Apex.
 * Price/description are filled in for Basic and Elite (from the original
 * pricing plan); Premium and Apex are seeded blank -- fill those in from
 * the Card Plans screen in the admin webpage once you've settled on
 * pricing for them.
 *
 * Safe to run multiple times -- skips any plan whose key already exists.
 *
 * Usage: node seed-plans.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./db');
const CardPlan = require('./models/CardPlan');

const DEFAULT_PLANS = [
  {
    name: 'Basic',
    key: 'basic',
    price: '₹499–799',
    description: 'Animated 3D name + logo, floating idle, accent colour. Black PVC.',
  },
  {
    name: 'Premium',
    key: 'premium',
    price: '',
    description: '',
  },
  {
    name: 'Elite',
    key: 'elite',
    price: '₹2,499–3,499',
    description: '3D avatar, intro video, animated logo, interactive buttons. Gold or premium PVC.',
  },
  {
    name: 'Apex',
    key: 'apex',
    price: '',
    description: '',
  },
];

async function main() {
  await connectDB();

  for (const plan of DEFAULT_PLANS) {
    const existing = await CardPlan.findOne({ key: plan.key });
    if (existing) {
      console.log(`- skip (already exists): ${plan.key}`);
      continue;
    }
    await CardPlan.create(plan);
    console.log(`✅ created: ${plan.key}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed to seed plans:', err.message);
  process.exit(1);
});
