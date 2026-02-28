const mongoose = require('mongoose');
const SalesReturn = require('../models/SalesReturn');
const Product = require('../models/Product');
const InventoryTransaction = require('../models/InventoryTransaction');
const Customer = require('../models/Customer');
const Counter = require('../models/Counter');

const buildPagination = (total, page, limit) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  return { total, page, limit, pages };
};

exports.getAllSalesReturns = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
  const { from, to, customer_id } = req.query;

  const filter = {};

  if (from || to) {
    filter.return_date = {};
    if (from) {
      filter.return_date.$gte = new Date(from);
    }
    if (to) {
      filter.return_date.$lte = new Date(to);
    }
  }

  if (customer_id) {
    filter['customer.customer_id'] = customer_id;
  }

  const total = await SalesReturn.countDocuments(filter);

  const returns = await SalesReturn.find(filter)
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

exports.getSalesReturnById = async (req, res) => {
  const { id } = req.params;

  const salesReturn = await SalesReturn.findById(id);

  if (!salesReturn) {
    return res
      .status(404)
      .json({ success: false, message: 'Sales return not found' });
  }

  return res.json({
    success: true,
    data: { return: salesReturn },
  });
};

exports.createSalesReturn = async (req, res) => {
  const {
    customer_id,
    customer_name,
    customer_phone,
    original_order_ref,
    lines,
    return_date,
    notes,
  } = req.body;

  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Return lines are required',
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let customerSnapshot = {
      customer_id: undefined,
      name: undefined,
      phone: undefined,
    };

    if (customer_id) {
      const customer = await Customer.findOne({
        _id: customer_id,
        is_deleted: false,
      }).session(session);

      if (customer) {
        customerSnapshot = {
          customer_id: customer._id,
          name: customer.name,
          phone: customer.phone,
        };
      }
    } else if (customer_name || customer_phone) {
      customerSnapshot = {
        customer_id: undefined,
        name: customer_name,
        phone: customer_phone,
      };
    }

    const returnLines = [];
    const movementIds = [];

    const return_number = await Counter.nextVal('sales_returns', session);

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

      product.on_hand = (product.on_hand || 0) + quantity;
      await product.save({ session });

      const movement_id = await Counter.nextVal('movements', session);

      const [movement] = await InventoryTransaction.create(
        [
          {
            movement_id,
            product_id: product._id,
            product_code: product.product_code,
            product_name: product.name,
            qty: quantity,
            type: 'sale_return',
            source: {
              doc_type: 'sales_return',
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

    const [salesReturn] = await SalesReturn.create(
      [
        {
          return_number,
          customer: customerSnapshot,
          original_order_ref,
          lines: returnLines,
          return_date: return_date ? new Date(return_date) : undefined,
          notes,
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
      data: { return: salesReturn },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

