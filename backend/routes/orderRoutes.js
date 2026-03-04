const express = require('express');
const protect = require('../middleware/protect');
const {
  getAllOrders,
  getOrderById,
  createOrder,
  addPayment,
  cancelOrder,
  deleteOrder,
} = require('../controllers/orderController');

const router = express.Router();

router.get('/', getAllOrders);
router.post('/', protect, createOrder);
router.get('/:id', getOrderById);
router.post('/:id/pay', protect, addPayment);
router.post('/:id/cancel', protect, cancelOrder);
router.delete('/:id', protect, deleteOrder);

module.exports = router;

