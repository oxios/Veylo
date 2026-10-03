const mongoose = require("mongoose");

// Atomic sequences, e.g. "<venueId>:<day>" → last guest number of that day.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
}, { versionKey: false, collection: "counters" });

const Counter = mongoose.model("Counter", counterSchema);

async function nextSeq(key) {
  const doc = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return doc.seq;
}

module.exports = Counter;
module.exports.nextSeq = nextSeq;
