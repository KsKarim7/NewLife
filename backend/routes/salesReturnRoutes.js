const express = require('express');
const protect = require('../middleware/protect');
const {
  getAllSalesReturns,
  getSalesReturnById,
  createSalesReturn,
} = require('../controllers/salesReturnController');

const router = express.Router();

router.get('/', getAllSalesReturns);
router.post('/', protect, createSalesReturn);
router.get('/:id', getSalesReturnById);

module.exports = router;

