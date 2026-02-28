const express = require('express');
const { body } = require('express-validator');
const protect = require('../middleware/protect');
const {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('../controllers/categoryController');

const router = express.Router();

router.get('/', getAllCategories);

router.post(
  '/',
  protect,
  [body('name').isLength({ min: 2 }).withMessage('Name must be at least 2 characters')],
  createCategory
);

router.put(
  '/:id',
  protect,
  [
    body('name')
      .optional()
      .isLength({ min: 2 })
      .withMessage('Name must be at least 2 characters'),
  ],
  updateCategory
);

router.delete('/:id', protect, deleteCategory);

module.exports = router;

