// One-off: seeds the FaqEntry collection with the questions that used to
// be a hardcoded array in client-app's Faq.jsx, now that FAQ content is
// admin-managed (see routes/admin.js's /faq routes). Safe to run once;
// does nothing if entries already exist, so it's harmless to re-run.
require('dotenv').config();
const mongoose = require('mongoose');
const FaqEntry = require('./models/FaqEntry');

const SEED = [
  {
    question: 'What is HuntsTAG?',
    answer:
      "An NFC smart card that shares your profile with a tap — no app needed on the other person's phone. A QR code on the card works the same way for phones without NFC.",
  },
  {
    question: "What if the other person's phone doesn't support NFC?",
    answer: 'Every card also has a QR code printed on it. Scanning that opens the exact same profile page as tapping does.',
  },
  {
    question: 'Can I update my profile after I order a card?',
    answer:
      'Yes — your card links to your live profile, so anything you change in your dashboard (photo, links, details) updates instantly for everyone who taps or scans, without reprinting anything.',
  },
  {
    question: 'What plans are available?',
    answer: 'Head to the Shop page to see every tier, its price, and the card styles available for it. You can upgrade to a different plan at any time.',
  },
  {
    question: 'How do I track my order?',
    answer: 'Once logged in, the Track page in your dashboard shows exactly where your order is, from payment to delivery.',
  },
  {
    question: 'What are Zing and Magic AR?',
    answer:
      "Zing and Magic AR are extra features some plans include — an animated, augmented-reality layer on top of your card. They're highlighted on the plan you choose in the Shop.",
  },
  {
    question: 'What is HuntsWorld?',
    answer:
      'HuntsWorld is a separate business listing platform. If you have a listing there, your HuntsTAG profile can link straight to it. See the "What is HuntsWorld?" page for more.',
  },
  {
    question: 'Still have a question?',
    answer: "Use the Contact Us page and we'll get back to you.",
  },
];

mongoose
  .connect(process.env.MONGODB_URI || process.env.MONGO_URI)
  .then(async () => {
    const existing = await FaqEntry.countDocuments();
    if (existing > 0) {
      console.log(`FaqEntry already has ${existing} entries -- not seeding again.`);
      process.exit(0);
    }
    const docs = SEED.map((entry, i) => ({ ...entry, order: i }));
    await FaqEntry.insertMany(docs);
    console.log(`Seeded ${docs.length} FAQ entries.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
