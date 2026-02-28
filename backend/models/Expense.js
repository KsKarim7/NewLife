const mongoose = require('mongoose');
require('mongoose-long')(mongoose);

const expenseSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    party_name: {
      type: String,
      required: [true, 'Party name is required'],
    },
    description: {
      type: String,
    },
    total_amount_paisa: {
      type: mongoose.Schema.Types.Long,
      required: [true, 'Total amount is required'],
    },
    paid_amount_paisa: {
      type: mongoose.Schema.Types.Long,
      default: 0,
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

expenseSchema.virtual('due_amount_paisa').get(function () {
  const total = Number(this.total_amount_paisa) || 0;
  const paid = Number(this.paid_amount_paisa) || 0;
  return Math.max(0, total - paid);
});

expenseSchema.set('toJSON', { virtuals: true });
expenseSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Expense', expenseSchema);
