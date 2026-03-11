const express = require('express');
const { body } = require('express-validator');
const {
  getSettings,
  updateStoreInfo,
  getRetention,
  updateRetention,
  getNextDayMode,
  setNextDayMode,
  uploadLogo,
  removeLogo,
  listUsers,
  createUser,
  updateUser,
  deactivateUser,
} = require('../controllers/settingsController');
const protect = require('../middleware/protect');

const router = express.Router();

// Store Information - GET accessible to all authenticated users
router.get('/', protect, getSettings);

// Store Information - PATCH owner only
router.patch('/', protect, updateStoreInfo);

// Retention Settings
router.get('/retention', protect, getRetention);
router.patch(
  '/retention',
  protect,
  [body('purge_after_days').isInt({ min: 7, max: 365 }).withMessage('Purge days must be between 7 and 365')],
  updateRetention
);

// Next Day Accounting Mode
router.get('/next-day-mode', protect, getNextDayMode);
router.post('/next-day-mode', protect, setNextDayMode);

// User Management
router.get('/users', protect, listUsers);

// Logo endpoints
router.post('/logo', protect, uploadLogo);
router.delete('/logo', protect, removeLogo);

router.post(
  '/users',
  protect,
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('role').isIn(['manager', 'staff']).withMessage('Role must be manager or staff'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  createUser
);

router.patch(
  '/users/:id',
  protect,
  [
    body('name').optional().notEmpty().withMessage('Name cannot be empty'),
    body('phone').optional(),
  ],
  updateUser
);

router.post('/users/:id/deactivate', protect, deactivateUser);

module.exports = router;
