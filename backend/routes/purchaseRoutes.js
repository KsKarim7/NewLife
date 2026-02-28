const express = require('express');
const protect = require('../middleware/protect');
const {
  getAllPurchases,
  getPurchaseById,
  createPurchase,
} = require('../controllers/purchaseController');

const router = express.Router();

router.get('/', getAllPurchases);
router.post('/', protect, createPurchase);
router.get('/:id', getPurchaseById);

module.exports = router;

