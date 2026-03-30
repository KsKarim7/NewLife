const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
    },
    shop_name: {
      type: String,
    },
    address: {
      type: String,
    },
    debit_paisa: {
      type: Number,
      default: 0,
    },
    credit_paisa: {
      type: Number,
      default: 0,
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Customer', customerSchema);
