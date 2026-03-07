const mongoose = require('mongoose');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const InventoryTransaction = require('../models/InventoryTransaction');
const Counter = require('../models/Counter');

const paisaToTakaString = (value) => {
  if (value === null || value === undefined) return '0.00';
  const num = Number(value);
  if (Number.isNaN(num)) return '0.00';
  return (num / 100).toFixed(2);
};

const convertPurchaseMoney = (purchaseObj) => {
  if (!purchaseObj) return purchaseObj;

  if ('net_amount_paisa' in purchaseObj) {
    purchaseObj.net_amount_paisa = paisaToTakaString(
      purchaseObj.net_amount_paisa
    );
  }
  if ('paid_amount_paisa' in purchaseObj) {
    purchaseObj.paid_amount_paisa = paisaToTakaString(
      purchaseObj.paid_amount_paisa
    );
  }
  if ('due_amount_paisa' in purchaseObj) {
    purchaseObj.due_amount_paisa = paisaToTakaString(
      purchaseObj.due_amount_paisa
    );
  }

  if (Array.isArray(purchaseObj.lines)) {
    purchaseObj.lines = purchaseObj.lines.map((line) => {
      const l = { ...line };
      if ('buying_price_paisa' in l) {
        l.buying_price_paisa = paisaToTakaString(l.buying_price_paisa);
      }
      if ('line_total_paisa' in l) {
        l.line_total_paisa = paisaToTakaString(l.line_total_paisa);
      }
      return l;
    });
  }

  return purchaseObj;
};

const buildPagination = (total, page, limit) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  return { total, page, limit, pages };
};

exports.getAllPurchases = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
  const { from, to } = req.query;

  const filter = { is_deleted: false };

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

  const total = await Purchase.countDocuments(filter);

  const purchases = await Purchase.find(filter)
    .sort({ date: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  const transformed = purchases.map((doc) =>
    convertPurchaseMoney(doc.toObject({ virtuals: true }))
  );

  return res.json({
    success: true,
    data: {
      purchases: transformed,
      pagination: buildPagination(total, page, limit),
    },
  });
};

exports.getPurchaseById = async (req, res) => {
  const { id } = req.params;

  const purchase = await Purchase.findOne({
    _id: id,
    is_deleted: false,
  });

  if (!purchase) {
    return res
      .status(404)
      .json({ success: false, message: 'Purchase not found' });
  }

  const transformed = convertPurchaseMoney(
    purchase.toObject({ virtuals: true })
  );

  return res.json({
    success: true,
    data: { purchase: transformed },
  });
};

exports.createPurchase = async (req, res) => {
  const { date, lines, paid_amount } = req.body;

  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Purchase lines are required',
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
    const purchase_number = await Counter.nextVal('purchases', useTransaction ? session : undefined);

    const purchaseLines = [];
    const movementIds = [];
    let net_amount_paisa = 0;

    for (const line of lines) {
      const { product_id, qty, buying_price } = line;
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

      const productQuery = Product.findOne({
        _id: product_id,
        is_deleted: false,
      });
      if (useTransaction) productQuery.session(session);
      const product = await productQuery;

      if (!product) {
        if (useTransaction) {
          await session.abortTransaction();
        }
        session.endSession();
        return res.status(404).json({
          success: false,
          message: 'Product not found',
        });
      }

      const buying_price_paisa = Math.round(
        parseFloat(buying_price) * 100
      );
      const line_total_paisa = buying_price_paisa * quantity;

      net_amount_paisa += line_total_paisa;

      product.on_hand = (product.on_hand || 0) + quantity;
      await product.save({ session: useTransaction ? session : undefined });

      const movement_id = await Counter.nextVal('movements', useTransaction ? session : undefined);

      const [movement] = await InventoryTransaction.create(
        [
          {
            movement_id,
            product_id: product._id,
            product_code: product.product_code,
            product_name: product.name,
            qty: quantity,
            type: 'purchase_in',
            unit_cost_paisa: buying_price_paisa,
            source: {
              doc_type: 'purchase',
              doc_number: purchase_number,
            },
            createdBy: req.user ? req.user._id : undefined,
          },
        ],
        useTransaction ? { session } : {}
      );

      movementIds.push(movement._id);

      purchaseLines.push({
        product_id: product._id,
        product_code: product.product_code,
        product_name: product.name,
        qty: quantity,
        buying_price_paisa,
        line_total_paisa,
      });
    }

    const paid_amount_paisa = Math.round(
      parseFloat(paid_amount || '0') * 100
    );
    const due_amount_paisa = net_amount_paisa - paid_amount_paisa;

    const [purchase] = await Purchase.create(
      [
        {
          purchase_number,
          date: date ? new Date(date) : undefined,
          lines: purchaseLines,
          net_amount_paisa,
          paid_amount_paisa,
          due_amount_paisa,
          inventory_movements: movementIds,
        },
      ],
      useTransaction ? { session } : {}
    );

    if (useTransaction) {
      await session.commitTransaction();
    }
    session.endSession();

    const transformed = convertPurchaseMoney(
      purchase.toObject({ virtuals: true })
    );

    return res.status(201).json({
      success: true,
      data: { purchase: transformed },
    });
  } catch (err) {
    if (useTransaction) {
      await session.abortTransaction();
    }
    session.endSession();
    throw err;
  }
};

