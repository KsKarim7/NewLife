const express = require('express');
const { body } = require('express-validator');
const protect = require('../middleware/protect');
const {
  getAllExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
} = require('../controllers/expenseController');

const router = express.Router();

router.get('/', getAllExpenses);

router.post(
  '/',
  protect,
  [
    body('party_name').notEmpty().withMessage('Party name is required'),
    body('total_amount')
      .notEmpty()
      .withMessage('Total amount is required')
      .isNumeric()
      .withMessage('Total amount must be numeric'),
    body('paid_amount')
      .optional()
      .isNumeric()
      .withMessage('Paid amount must be numeric'),
  ],
  createExpense
);

router.put(
  '/:id',
  protect,
  [
    body('total_amount')
      .optional()
      .isNumeric()
      .withMessage('Total amount must be numeric'),
    body('paid_amount')
      .optional()
      .isNumeric()
      .withMessage('Paid amount must be numeric'),
  ],
  updateExpense
);

router.delete('/:id', protect, deleteExpense);

module.exports = router;

