const mongoose = require('mongoose');
require('mongoose-long')(mongoose);

const inventoryTransactionSchema = new mongoose.Schema(
  {
    movement_id: {
      type: String,
      unique: true,
    },
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product is required'],
    },
    product_code: {
      type: String,
    },
    product_name: {
      type: String,
    },
    qty: {
      type: Number,
      required: [true, 'Quantity is required'],
    },
    type: {
      type: String,
      enum: [
        'purchase_in',
        'sale_out',
        'purchase_return',
        'sale_return',
        'adjustment',
        'cancel',
      ],
    },
    before_qty: { type: Number },
    after_qty: { type: Number },
    note: { type: String },
    unit_cost_paisa: {
      type: mongoose.Schema.Types.Long,
    },
    source: {
      doc_type: { type: String },
      doc_id: { type: mongoose.Schema.Types.ObjectId },
      doc_number: { type: String },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

inventoryTransactionSchema.index({ product_id: 1, createdAt: 1 });

module.exports = mongoose.model(
  'InventoryTransaction',
  inventoryTransactionSchema
);
