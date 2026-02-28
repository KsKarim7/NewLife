const express = require('express');
const { body } = require('express-validator');
const protect = require('../middleware/protect');
const {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
} = require('../controllers/productController');

const router = express.Router();

router.get('/', getAllProducts);

router.post(
  '/',
  protect,
  [
    body('product_code')
      .notEmpty()
      .withMessage('Product code is required'),
    body('name').notEmpty().withMessage('Name is required'),
    body('category_id').notEmpty().withMessage('Category is required'),
    body('unit').notEmpty().withMessage('Unit is required'),
    body('selling_price')
      .notEmpty()
      .withMessage('Selling price is required'),
    body('buying_price')
      .notEmpty()
      .withMessage('Buying price is required'),
  ],
  createProduct
);

router.get('/:id', getProductById);

router.put(
  '/:id',
  protect,
  [
    body('selling_price')
      .optional()
      .isNumeric()
      .withMessage('Selling price must be numeric'),
    body('buying_price')
      .optional()
      .isNumeric()
      .withMessage('Buying price must be numeric'),
  ],
  updateProduct
);

router.delete('/:id', protect, deleteProduct);

router.post('/:id/adjust', protect, adjustStock);

module.exports = router;

