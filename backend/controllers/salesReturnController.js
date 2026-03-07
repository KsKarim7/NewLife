const mongoose = require('mongoose');
const SalesReturn = require('../models/SalesReturn');
const Product = require('../models/Product');
const InventoryTransaction = require('../models/InventoryTransaction');
const Customer = require('../models/Customer');
const Counter = require('../models/Counter');
const Order = require('../models/Order');

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
      const fromDate = new Date(from);
      fromDate.setHours(0, 0, 0, 0);
      filter.return_date.$gte = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      filter.return_date.$lte = toDate;
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
  let useTransaction = true;

  try {
    session.startTransaction();
  } catch (err) {
    // MongoDB not running as replica set, proceed without transaction
    useTransaction = false;
  }

  try {
    let customerSnapshot = {
      customer_id: undefined,
      name: undefined,
      phone: undefined,
    };

    if (customer_id) {
      const customerQuery = Customer.findOne({
        _id: customer_id,
        is_deleted: false,
      });
      if (useTransaction) customerQuery.session(session);
      const customer = await customerQuery;

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

    const return_number = await Counter.nextVal('sales_returns', useTransaction ? session : undefined);

    // Validation 1: Check if order exists and get it
    let originalOrder = null;
    if (original_order_ref) {
      const orderQuery = Order.findOne({
        order_number: original_order_ref,
        is_deleted: false,
      });
      if (useTransaction) orderQuery.session(session);
      originalOrder = await orderQuery;

      if (!originalOrder) {
        if (useTransaction) {
          await session.abortTransaction();
        }
        session.endSession();
        return res.status(404).json({
          success: false,
          message: `Order not found: ${original_order_ref}`,
        });
      }

      // Validation 2: Check order status is returnable
      if (!['Paid', 'Partially Paid'].includes(originalOrder.status)) {
        if (useTransaction) {
          await session.abortTransaction();
        }
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Cannot return order ${original_order_ref} — status is ${originalOrder.status}. Only Paid or Partially Paid orders are returnable`,
        });
      }
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

    // Validation 3, 4, 5: For each line, validate against order
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

      // Validation 3: Product must be in original order
      if (originalOrder) {
        const orderLine = originalOrder.lines.find(l => l.product_id.toString() === product_id.toString());
        if (!orderLine) {
          if (useTransaction) {
            await session.abortTransaction();
          }
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `${product.name} was not part of order ${original_order_ref}`,
          });
        }

        // Validation 4: Return quantity cannot exceed ordered quantity
        if (quantity > orderLine.qty) {
          if (useTransaction) {
            await session.abortTransaction();
          }
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Cannot return ${quantity} units of ${product.name} — only ${orderLine.qty} were ordered`,
          });
        }

        // Validation 5: Check total returns (including this one) don't exceed ordered quantity
        const previousReturnsQuery = SalesReturn.find({
          original_order_ref,
          'lines.product_id': mongoose.Types.ObjectId(product_id),
          is_deleted: false,
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

        const remainingReturnable = orderLine.qty - totalPreviouslyReturned;
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
    }

    // All validations passed, now process inventory
    for (const line of lines) {
      const { product_id, qty } = line;
      const quantity = Number(qty);

      const product = productsMap[product_id.toString()];

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
            type: 'sale_return',
            source: {
              doc_type: 'sales_return',
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
      useTransaction ? { session } : {}
    );

    if (useTransaction) {
      await session.commitTransaction();
    }
    session.endSession();

    return res.status(201).json({
      success: true,
      data: { return: salesReturn },
    });
  } catch (err) {
    if (useTransaction) {
      await session.abortTransaction();
    }
    session.endSession();
    throw err;
  }
};

