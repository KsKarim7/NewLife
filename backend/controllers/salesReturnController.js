const mongoose = require('mongoose');
const SalesReturn = require('../models/SalesReturn');
const Product = require('../models/Product');
const InventoryTransaction = require('../models/InventoryTransaction');
const Customer = require('../models/Customer');
const Counter = require('../models/Counter');
const Order = require('../models/Order');
const Settings = require('../models/Settings');
const { toLocalStartOfDay, toLocalEndOfDay } = require('../utils/dateUtils');

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
    const conditions = [];
    const effectiveField = {
      $ifNull: ['$accounting_date', '$return_date'],
    };

    if (from) {
      const fromDate = toLocalStartOfDay(from);
      conditions.push({ $gte: [effectiveField, fromDate] });
    }

    if (to) {
      const toDate = toLocalEndOfDay(to);
      conditions.push({ $lte: [effectiveField, toDate] });
    }

    if (conditions.length === 1) {
      filter.$expr = conditions[0];
    } else if (conditions.length === 2) {
      filter.$expr = { $and: conditions };
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

  // Compute summary with period awareness
  const summaryAgg = await SalesReturn.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        total_returns_count: { $sum: 1 },
        total_qty_returned: {
          $sum: {
            $sum: '$lines.qty'
          }
        }
      }
    }
  ]);

  const summaryData = summaryAgg[0] || {
    total_returns_count: 0,
    total_qty_returned: 0
  };

  return res.json({
    success: true,
    data: {
      returns,
      pagination: buildPagination(total, page, limit),
      summary: {
        total_returns: summaryData.total_returns_count,
        total_qty_returned: summaryData.total_qty_returned
      }
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

    // Determine accounting date if next day mode is enabled
    let accounting_date;
    try {
      const settings = await Settings.findOne({});
      if (settings && settings.next_day_mode) {
        const now = new Date();
        const tomorrow = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 1,
          0, 0, 0, 0
        );
        accounting_date = tomorrow;
      }
    } catch (settingsErr) {
      // If settings lookup fails, proceed without accounting_date
    }

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
          'lines.product_id': new mongoose.Types.ObjectId(product_id),
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
    let total_refund_paisa = 0;

    for (const line of lines) {
      const { product_id, qty } = line;
      const quantity = Number(qty);

      const product = productsMap[product_id.toString()];
      const beforeQty = product.on_hand || 0;
      const afterQty = beforeQty + quantity;
      product.on_hand = afterQty;
      await product.save({ session: useTransaction ? session : undefined });

      // Compute refund for this line (from order line unit price if order exists)
      let lineRefundPaisa = 0;
      if (originalOrder) {
        const orderLine = originalOrder.lines.find(l => l.product_id.toString() === product_id.toString());
        if (orderLine) {
          const unitPaisa = Number(orderLine.unit_price_paisa || 0);
          lineRefundPaisa = Math.round(unitPaisa * quantity);
        }
      }
      total_refund_paisa += lineRefundPaisa;

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
            before_qty: beforeQty,
            after_qty: afterQty,
            note: `Sales Return: ${return_number}`,
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
          accounting_date,
          total_refund_paisa,
        },
      ],
      useTransaction ? { session } : {}
    );

    // Update original order if we have one and refund > 0
    if (originalOrder && total_refund_paisa > 0) {
      const newReceived = Math.max(0, Number(originalOrder.amount_received_paisa || 0) - total_refund_paisa);
      const newDue = Math.max(0, Number(originalOrder.total_paisa || 0) - newReceived);
      
      await Order.findByIdAndUpdate(
        originalOrder._id,
        {
          $set: {
            status: 'Returned',
            has_return: true,
            amount_received_paisa: newReceived,
            amount_due_paisa: newDue,
          }
        },
        { session: useTransaction ? session : undefined }
      );
    }

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

