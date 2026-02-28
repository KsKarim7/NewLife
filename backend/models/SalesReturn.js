const mongoose = require('mongoose');

const salesReturnLineSchema = new mongoose.Schema(
  {
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    product_code: { type: String },
    product_name: { type: String },
    qty: { type: Number },
  },
  { _id: false }
);

const salesReturnSchema = new mongoose.Schema(
  {
    return_number: {
      type: String,
      unique: true,
    },
    customer: {
      customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
      name: { type: String },
      phone: { type: String },
    },
    original_order_ref: {
      type: String,
    },
    lines: [salesReturnLineSchema],
    return_date: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
    },
    inventory_movements: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InventoryTransaction',
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SalesReturn', salesReturnSchema);
