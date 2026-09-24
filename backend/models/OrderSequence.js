const mongoose = require('mongoose');

// One atomic sequence per calendar year, shared by card and Magic Poster
// checkouts. Using MongoDB's $inc keeps order numbers unique even when two
// customers start checkout at the same moment or separate server instances
// handle the requests.
const OrderSequenceSchema = new mongoose.Schema(
  {
    _id: { type: String },
    value: { type: Number, required: true, default: 0, min: 0 },
  },
  { versionKey: false }
);

module.exports = mongoose.model('OrderSequence', OrderSequenceSchema);
