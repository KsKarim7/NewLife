const express = require('express');
const protect = require('../middleware/protect');
const {
  getAllPurchaseReturns,
  createPurchaseReturn,
} = require('../controllers/purchaseReturnController');

const router = express.Router();

router.get('/', getAllPurchaseReturns);
router.post('/', protect, createPurchaseReturn);

module.exports = router;

