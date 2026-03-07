const mongoose = require('mongoose');
const PurchaseReturn = require('../models/PurchaseReturn');
const Product = require('../models/Product');
const InventoryTransaction = require('../models/InventoryTransaction');
const Counter = require('../models/Counter');
const Purchase = require('../models/Purchase');

const buildPagination = (total, page, limit) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  return { total, page, limit, pages };
};

exports.getAllPurchaseReturns = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
  const { from, to } = req.query;

  const filter = {};

  if (from || to) {
    filter.date = {};
    if (from) {
      const fromDate = new Date(from);
      fromDate.setHours(0, 0, 0, 0);
      filter.date.$gte = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      filter.date.$lte = toDate;
    }
  }

  const total = await PurchaseReturn.countDocuments(filter);

  const returns = await PurchaseReturn.find(filter)
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

exports.getPurchaseReturnById = async (req, res) => {
  const { id } = req.params;

  const purchaseReturn = await PurchaseReturn.findById(id);

  if (!purchaseReturn) {
    return res
      .status(404)
      .json({ success: false, message: 'Purchase return not found' });
  }

  return res.json({
    success: true,
    data: { return: purchaseReturn },
  });
};

exports.createPurchaseReturn = async (req, res) => {
  const {
    purchase_number,
    lines,
    date,
  } = req.body;

  if (!purchase_number) {
    return res.status(400).json({
      success: false,
      message: 'Purchase number is required',
    });
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Return lines are required',
    });
  }

  const session = await mongoose.startSession();
  let useTransaction = true;

  try {
    session.startTransaction();
  } catch (err) {
    // MongoDB not running as replica set, proceed without transaction
    useTransaction = false;
  }

  try {
    // Validation 1: Check if purchase exists and get it
    const purchaseQuery = Purchase.findOne({
      purchase_number,
      is_deleted: false,
    });
    if (useTransaction) purchaseQuery.session(session);
    const originalPurchase = await purchaseQuery;

    if (!originalPurchase) {
      if (useTransaction) {
        await session.abortTransaction();
      }
      session.endSession();
      return res.status(404).json({
        success: false,
        message: `Purchase not found: ${purchase_number}`,
      });
    }

    // Pre-fetch all products for the return request
    const productIds = lines.map(l => l.product_id);
    const productsMap = {};
    for (const productId of productIds) {
      const productQuery = Product.findOne({
        _id: productId,
        is_deleted: false,
      });
      if (useTransaction) productQuery.session(session);
      const product = await productQuery;
      if (product) {
        productsMap[product._id.toString()] = product;
      }
    }

    // Validation 2, 3, 4, 5: For each line, validate against purchase
    for (const line of lines) {
      const { product_id, qty } = line;
      const quantity = Number(qty);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        if (useTransaction) {
          await session.abortTransaction();
        }
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Quantity must be a positive number',
        });
      }

      // Product must exist
      if (!productsMap[product_id.toString()]) {
        if (useTransaction) {
          await session.abortTransaction();
        }
        session.endSession();
        return res.status(404).json({
          success: false,
          message: 'Product not found',
        });
      }

      const product = productsMap[product_id.toString()];

      // Validation 3: Product must be in original purchase
      const purchaseLine = originalPurchase.lines.find(l => l.product_id.toString() === product_id.toString());
      if (!purchaseLine) {
        if (useTransaction) {
          await session.abortTransaction();
        }
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `${product.name} was not part of purchase ${purchase_number}`,
        });
      }

      // Validation 4: Return quantity cannot exceed purchased quantity
      if (quantity > purchaseLine.qty) {
        if (useTransaction) {
          await session.abortTransaction();
        }
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Cannot return ${quantity} units of ${product.name} — only ${purchaseLine.qty} were purchased`,
        });
      }

      // Validation 5: Check total returns (including this one) don't exceed purchased quantity
      const previousReturnsQuery = PurchaseReturn.find({
        purchase_number,
        'lines.product_id': mongoose.Types.ObjectId(product_id),
      });
      if (useTransaction) previousReturnsQuery.session(session);
      const previousReturns = await previousReturnsQuery;

      let totalPreviouslyReturned = 0;
      for (const prevReturn of previousReturns) {
        const prevReturnLine = prevReturn.lines.find(l => l.product_id.toString() === product_id.toString());
        if (prevReturnLine) {
          totalPreviouslyReturned += prevReturnLine.qty;
        }
      }

      const remainingReturnable = purchaseLine.qty - totalPreviouslyReturned;
      if (quantity > remainingReturnable) {
        if (useTransaction) {
          await session.abortTransaction();
        }
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Cannot return ${quantity} units of ${product.name} — only ${remainingReturnable} units remain returnable after previous returns`,
        });
      }
    }

    // All validations passed, now process inventory
    const returnLines = [];
    const movementIds = [];

    const return_number = await Counter.nextVal('purchase_returns', useTransaction ? session : undefined);

    for (const line of lines) {
      const { product_id, qty } = line;
      const quantity = Number(qty);

      const product = productsMap[product_id.toString()];

      product.on_hand = (product.on_hand || 0) - quantity;
      if (product.on_hand < 0) {
        if (useTransaction) {
          await session.abortTransaction();
        }
        session.endSession();
        return res.status(409).json({
          success: false,
          message: `Insufficient stock to process return for ${product.name}`,
        });
      }

      await product.save({ session: useTransaction ? session : undefined });

      const movement_id = await Counter.nextVal('movements', useTransaction ? session : undefined);

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
        useTransaction ? { session } : {}
      );

      movementIds.push(movement._id);

      returnLines.push({
        product_id: product._id,
        product_code: product.product_code,
        product_name: product.name,
        qty: quantity,
      });
    }

    const [purchaseReturnDoc] = await PurchaseReturn.create(
      [
        {
          return_number,
          purchase_number,
          date: date ? new Date(date) : new Date(),
          lines: returnLines,
          inventory_movements: movementIds,
          createdBy: req.user ? req.user._id : undefined,
        },
      ],
      useTransaction ? { session } : {}
    );

    if (useTransaction) {
      await session.commitTransaction();
    }
    session.endSession();

    return res.status(201).json({
      success: true,
      data: { return: purchaseReturnDoc },
    });
  } catch (err) {
    if (useTransaction) {
      await session.abortTransaction();
    }
    session.endSession();
    throw err;
  }
};
