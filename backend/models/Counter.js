const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, 'Key is required'],
      unique: true,
    },
    seq: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

const FORMATS = {
  orders: (seq) => 'ORD-' + seq.toString().padStart(4, '0'),
  purchases: (seq) => 'PUR-' + seq.toString().padStart(4, '0'),
  sales_returns: (seq) => 'SR-' + seq.toString().padStart(4, '0'),
  purchase_returns: (seq) => 'PR-' + seq.toString().padStart(4, '0'),
  movements: (seq) => 'MOV-' + seq.toString().padStart(6, '0'),
};

counterSchema.statics.nextVal = async function (key, session) {
  const options = { upsert: true, new: true };
  if (session) {
    options.session = session;
  }
  const doc = await this.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    options
  );
  const formatter = FORMATS[key];
  return formatter ? formatter(doc.seq) : doc.seq.toString();
};

module.exports = mongoose.model('Counter', counterSchema);
