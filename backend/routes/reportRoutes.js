const express = require('express');
const {
  getSalesReport,
  getPurchasesReport,
  getSalesReturnsReport,
  getPurchaseReturnsReport,
  getExpensesReport,
  getStockMovementsReport,
  getTopProductsReport,
} = require('../controllers/reportController');

const router = express.Router();

router.get('/sales', getSalesReport);
router.get('/purchases', getPurchasesReport);
router.get('/sales-returns', getSalesReturnsReport);
router.get('/purchase-returns', getPurchaseReturnsReport);
router.get('/expenses', getExpensesReport);
router.get('/stock-movements', getStockMovementsReport);
router.get('/top-products', getTopProductsReport);

module.exports = router;
