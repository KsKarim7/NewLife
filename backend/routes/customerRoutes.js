const express = require('express');
const { body } = require('express-validator');
const protect = require('../middleware/protect');
const {
  getAllCustomers,
  getCustomerById,
  getCustomerOrders,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} = require('../controllers/customerController');

const router = express.Router();

router.get('/', getAllCustomers);

router.post(
  '/',
  protect,
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('phone').notEmpty().withMessage('Phone is required'),
  ],
  createCustomer
);

router.get('/:id', getCustomerById);

router.put(
  '/:id',
  protect,
  [
    body('name').optional().notEmpty().withMessage('Name is required'),
    body('phone').optional().notEmpty().withMessage('Phone is required'),
  ],
  updateCustomer
);

router.delete('/:id', protect, deleteCustomer);

router.get('/:id/orders', getCustomerOrders);

module.exports = router;

