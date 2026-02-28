const mongoose = require('mongoose');

const purchaseReturnLineSchema = new mongoose.Schema(
  {
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    product_code: { type: String },
    product_name: { type: String },
    qty: { type: Number },
  },
  { _id: false }
);

const purchaseReturnSchema = new mongoose.Schema(
  {
    return_number: {
      type: String,
      unique: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    lines: [purchaseReturnLineSchema],
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

module.exports = mongoose.model('PurchaseReturn', purchaseReturnSchema);
