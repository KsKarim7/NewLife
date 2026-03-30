const mongoose = require('mongoose');
require('mongoose-long')(mongoose);

const productSchema = new mongoose.Schema(
  {
    product_code: {
      type: String,
      default: '',
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
    },
    description: {
      type: String,
    },
    category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    unit: {
      type: String,
      required: [true, 'Unit is required'],
    },
    selling_price_paisa: {
      type: mongoose.Schema.Types.Long,
      required: [true, 'Selling price is required'],
    },
    buying_price_paisa: {
      type: mongoose.Schema.Types.Long,
      required: [true, 'Buying price is required'],
    },
    vat_enabled: {
      type: Boolean,
      default: false,
    },
    vat_percent: {
      type: Number,
      default: 0,
    },
    on_hand: {
      type: Number,
      default: 0,
    },
    reserved: {
      type: Number,
      default: 0,
    },
    image_url: {
      type: String,
    },
    weight: {
      type: Number,
    },
    weight_unit: {
      type: String,
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

productSchema.virtual('available').get(function () {
  return Math.max(0, (this.on_hand || 0) - (this.reserved || 0));
});

productSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Product', productSchema);
