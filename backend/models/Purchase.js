const mongoose = require('mongoose');
require('mongoose-long')(mongoose);

const purchaseLineSchema = new mongoose.Schema(
  {
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    product_code: { type: String },
    product_name: { type: String },
    qty: { type: Number },
    selling_price_paisa: { type: mongoose.Schema.Types.Long },
    buying_price_paisa: { type: mongoose.Schema.Types.Long },
    line_total_paisa: { type: mongoose.Schema.Types.Long },
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    purchase_number: {
      type: String,
      unique: true,
    },
    party_name: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    lines: [purchaseLineSchema],
    note: {
      type: String,
      default: '',
    },
    net_amount_paisa: { type: mongoose.Schema.Types.Long },
    paid_amount_paisa: { type: mongoose.Schema.Types.Long },
    due_amount_paisa: { type: mongoose.Schema.Types.Long },
    inventory_movements: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InventoryTransaction',
      },
    ],
    is_deleted: {
      type: Boolean,
      default: false,
    },
    accounting_date: {
      type: Date,
      default: undefined,
    },
    status: {
      type: String,
      enum: ['Pending', 'Partially Paid', 'Paid', 'Cancelled'],
      default: 'Pending',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Purchase', purchaseSchema);
