const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    store_info: {
      store_name: String,
      owner_name: String,
      phone_number: String,
      email_address: String,
      physical_address: String,
      city: String,
      logo_url: String,
      currency_symbol: {
        type: String,
        default: '৳',
      },
    },
    purge_after_days: {
      type: Number,
      default: 30,
      min: 7,
      max: 365,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
