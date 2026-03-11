const mongoose = require('mongoose');
require('mongoose-long')(mongoose);

const orderLineSchema = new mongoose.Schema(
  {
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    product_code: { type: String },
    product_name: { type: String },
    qty: { type: Number },
    unit_price_paisa: { type: mongoose.Schema.Types.Long },
    vat_percent: { type: Number },
    line_total_paisa: { type: mongoose.Schema.Types.Long },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    amount_paisa: { type: mongoose.Schema.Types.Long },
    date: { type: Date, default: Date.now },
    note: { type: String },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    order_number: {
      type: String,
      unique: true,
    },
    status: {
      type: String,
      enum: ['Confirmed', 'Partially Paid', 'Paid', 'Cancelled', 'Returned'],
      default: 'Confirmed',
    },
    customer: {
      customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
      name: { type: String },
      phone: { type: String },
    },
    lines: [orderLineSchema],
    subtotal_paisa: { type: mongoose.Schema.Types.Long },
    vat_total_paisa: { type: mongoose.Schema.Types.Long },
    total_paisa: { type: mongoose.Schema.Types.Long },
    payments: [paymentSchema],
    amount_received_paisa: {
      type: mongoose.Schema.Types.Long,
      default: 0,
    },
    amount_due_paisa: { type: mongoose.Schema.Types.Long },
    has_return: {
      type: Boolean,
      default: false,
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },
    retain_until: { type: Date },
    accounting_date: {
      type: Date,
      default: undefined,
    },
  },
  { timestamps: true }
);

orderSchema.index({ createdAt: 1 });
orderSchema.index({ status: 1 });

module.exports = mongoose.model('Order', orderSchema);
