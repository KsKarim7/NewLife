const mongoose = require('mongoose');
const PurchaseReturn = require('../models/PurchaseReturn');
const Product = require('../models/Product');
const InventoryTransaction = require('../models/InventoryTransaction');
const Counter = require('../models/Counter');

const buildPagination = (total, page, limit) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  return { total, page, limit, pages };
};

exports.getAllPurchaseReturns = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);

  const total = await PurchaseReturn.countDocuments({});

  const returns = await PurchaseReturn.find({})
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return res.json({
    success: true,
    data: {
      returns,
      pagination: buildPagination(total, page, limit),
    },
  });
};

exports.createPurchaseReturn = async (req, res) => {
  const { date, lines } = req.body;

  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Return lines are required',
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const return_number = await Counter.nextVal(
      'purchase_returns',
      session
    );

    const returnLines = [];
    const movementIds = [];

    for (const line of lines) {
      const { product_id, qty } = line;
      const quantity = Number(qty);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Quantity must be a positive number',
        });
      }

      const product = await Product.findOne({
        _id: product_id,
        is_deleted: false,
      }).session(session);

      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: 'Product not found',
        });
      }

      if ((product.on_hand || 0) < quantity) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock to return for: ${product.name}`,
        });
      }

      product.on_hand = (product.on_hand || 0) - quantity;
      await product.save({ session });

      const movement_id = await Counter.nextVal('movements', session);

      const [movement] = await InventoryTransaction.create(
        [
          {
            movement_id,
            product_id: product._id,
            product_code: product.product_code,
            product_name: product.name,
            qty: -quantity,
            type: 'purchase_return',
            source: {
              doc_type: 'purchase_return',
              doc_number: return_number,
            },
            createdBy: req.user ? req.user._id : undefined,
          },
        ],
        { session }
      );

      movementIds.push(movement._id);

      returnLines.push({
        product_id: product._id,
        product_code: product.product_code,
        product_name: product.name,
        qty: quantity,
      });
    }

    const [purchaseReturn] = await PurchaseReturn.create(
      [
        {
          return_number,
          date: date ? new Date(date) : undefined,
          lines: returnLines,
          inventory_movements: movementIds,
          createdBy: req.user ? req.user._id : undefined,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      data: { return: purchaseReturn },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

