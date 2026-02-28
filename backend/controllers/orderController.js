const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const InventoryTransaction = require('../models/InventoryTransaction');
const Customer = require('../models/Customer');
const Counter = require('../models/Counter');

const paisaToTakaString = (value) => {
  if (value === null || value === undefined) return '0.00';
  const num = Number(value);
  if (Number.isNaN(num)) return '0.00';
  return (num / 100).toFixed(2);
};

const convertOrderMoney = (orderObj) => {
  if (!orderObj) return orderObj;

  if ('subtotal_paisa' in orderObj) {
    orderObj.subtotal_paisa = paisaToTakaString(orderObj.subtotal_paisa);
  }
  if ('vat_total_paisa' in orderObj) {
    orderObj.vat_total_paisa = paisaToTakaString(orderObj.vat_total_paisa);
  }
  if ('total_paisa' in orderObj) {
    orderObj.total_paisa = paisaToTakaString(orderObj.total_paisa);
  }
  if ('amount_received_paisa' in orderObj) {
    orderObj.amount_received_paisa = paisaToTakaString(
      orderObj.amount_received_paisa
    );
  }
  if ('amount_due_paisa' in orderObj) {
    orderObj.amount_due_paisa = paisaToTakaString(orderObj.amount_due_paisa);
  }

  if (Array.isArray(orderObj.lines)) {
    orderObj.lines = orderObj.lines.map((line) => {
      const l = { ...line };
      if ('unit_price_paisa' in l) {
        l.unit_price_paisa = paisaToTakaString(l.unit_price_paisa);
      }
      if ('line_total_paisa' in l) {
        l.line_total_paisa = paisaToTakaString(l.line_total_paisa);
      }
      return l;
    });
  }

  if (Array.isArray(orderObj.payments)) {
    orderObj.payments = orderObj.payments.map((p) => {
      const payment = { ...p };
      if ('amount_paisa' in payment) {
        payment.amount_paisa = paisaToTakaString(payment.amount_paisa);
      }
      return payment;
    });
  }

  return orderObj;
};

const buildPagination = (total, page, limit) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  return { total, page, limit, pages };
};

exports.getAllOrders = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
  const { status, from, to, customer_id } = req.query;

  const filter = { is_deleted: false };

  if (status) {
    filter.status = status;
  }

  if (from || to) {
    filter.createdAt = {};
    if (from) {
      filter.createdAt.$gte = new Date(from);
    }
    if (to) {
      filter.createdAt.$lte = new Date(to);
    }
  }

  if (customer_id) {
    filter['customer.customer_id'] = customer_id;
  }

  const total = await Order.countDocuments(filter);

  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  const transformed = orders.map((doc) =>
    convertOrderMoney(doc.toObject({ virtuals: true }))
  );

  return res.json({
    success: true,
    data: {
      orders: transformed,
      pagination: buildPagination(total, page, limit),
    },
  });
};

exports.getOrderById = async (req, res) => {
  const { id } = req.params;

  const order = await Order.findOne({ _id: id, is_deleted: false });

  if (!order) {
    return res
      .status(404)
      .json({ success: false, message: 'Order not found' });
  }

  const transformed = convertOrderMoney(order.toObject({ virtuals: true }));

  return res.json({
    success: true,
    data: { order: transformed },
  });
};

exports.createOrder = async (req, res) => {
  const {
    customer_id,
    customer_name,
    customer_phone,
    lines,
    amount_received,
  } = req.body;

  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Order lines are required',
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

      if (!customer) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(404)
          .json({ success: false, message: 'Customer not found' });
      }

      customerSnapshot = {
        customer_id: customer._id,
        name: customer.name,
        phone: customer.phone,
      };
    } else if (customer_name) {
      customerSnapshot = {
        customer_id: undefined,
        name: customer_name,
        phone: customer_phone,
      };
    } else {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Customer information is required',
      });
    }

    const orderLines = [];
    let subtotal_paisa = 0;
    let vat_total_paisa = 0;

    for (const line of lines) {
      const { product_id, qty, unit_price, vat_percent } = line;

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
        return res.status(409).json({
          success: false,
          message: `Insufficient stock for: ${product.name}`,
          data: {
            product_id: product._id,
            product_name: product.name,
            available: product.on_hand || 0,
          },
        });
      }

      const unitPricePaisa = Math.round(
        parseFloat(unit_price) * 100
      );
      const lineTotalPaisa = unitPricePaisa * quantity;
      const vatPercentNumber = Number(vat_percent) || 0;
      const vatForLine = Math.round(
        (lineTotalPaisa * vatPercentNumber) / 100
      );

      subtotal_paisa += lineTotalPaisa;
      vat_total_paisa += vatForLine;

      orderLines.push({
        product_id: product._id,
        product_code: product.product_code,
        product_name: product.name,
        qty: quantity,
        unit_price_paisa: unitPricePaisa,
        vat_percent: vatPercentNumber,
        line_total_paisa: lineTotalPaisa,
      });

      product.on_hand = (product.on_hand || 0) - quantity;
      await product.save({ session });
    }

    const total_paisa = subtotal_paisa + vat_total_paisa;
    const amount_received_paisa = Math.round(
      parseFloat(amount_received || '0') * 100
    );
    const amount_due_paisa = total_paisa - amount_received_paisa;

    let status = 'Confirmed';
    if (amount_received_paisa >= total_paisa && total_paisa > 0) {
      status = 'Paid';
    } else if (amount_received_paisa > 0) {
      status = 'Partially Paid';
    }

    const order_number = await Counter.nextVal('orders', session);

    const orderDoc = await Order.create(
      [
        {
          order_number,
          status,
          customer: customerSnapshot,
          lines: orderLines,
          subtotal_paisa,
          vat_total_paisa,
          total_paisa,
          payments:
            amount_received_paisa > 0
              ? [
                  {
                    amount_paisa: amount_received_paisa,
                    date: new Date(),
                  },
                ]
              : [],
          amount_received_paisa,
          amount_due_paisa,
        },
      ],
      { session }
    );

    const order = orderDoc[0];

    for (const line of orderLines) {
      const movement_id = await Counter.nextVal('movements', session);
      await InventoryTransaction.create(
        [
          {
            movement_id,
            product_id: line.product_id,
            product_code: line.product_code,
            product_name: line.product_name,
            qty: -line.qty,
            type: 'sale_out',
            source: {
              doc_type: 'order',
              doc_number: order_number,
            },
            createdBy: req.user ? req.user._id : undefined,
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    const transformed = convertOrderMoney(
      order.toObject({ virtuals: true })
    );

    return res.status(201).json({
      success: true,
      data: { order: transformed },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

exports.addPayment = async (req, res) => {
  const { id } = req.params;
  const { amount, note } = req.body;

  const paymentPaisa = Math.round(parseFloat(amount || '0') * 100);

  if (!Number.isFinite(paymentPaisa) || paymentPaisa <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Payment amount must be positive',
    });
  }

  const order = await Order.findOne({ _id: id, is_deleted: false });

  if (!order) {
    return res
      .status(404)
      .json({ success: false, message: 'Order not found' });
  }

  order.payments.push({
    amount_paisa: paymentPaisa,
    date: new Date(),
    note,
  });

  const totalReceived = order.payments.reduce(
    (sum, p) => sum + Number(p.amount_paisa || 0),
    0
  );

  order.amount_received_paisa = totalReceived;
  order.amount_due_paisa =
    Number(order.total_paisa || 0) - totalReceived;

  if (order.amount_due_paisa <= 0) {
    order.status = 'Paid';
  } else if (order.amount_received_paisa > 0) {
    order.status = 'Partially Paid';
  }

  await order.save();

  const transformed = convertOrderMoney(
    order.toObject({ virtuals: true })
  );

  return res.json({
    success: true,
    data: { order: transformed },
  });
};

exports.cancelOrder = async (req, res) => {
  const { id } = req.params;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findOne({
      _id: id,
      is_deleted: false,
    }).session(session);

    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }

    if (order.status === 'Cancelled' || order.status === 'Returned') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Already cancelled',
      });
    }

    for (const line of order.lines) {
      const product = await Product.findOne({
        _id: line.product_id,
        is_deleted: false,
      }).session(session);

      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: 'Product not found for order line',
        });
      }

      product.on_hand = (product.on_hand || 0) + line.qty;
      await product.save({ session });

      const movement_id = await Counter.nextVal('movements', session);

      await InventoryTransaction.create(
        [
          {
            movement_id,
            product_id: product._id,
            product_code: product.product_code,
            product_name: product.name,
            qty: line.qty,
            type: 'adjustment',
            source: {
              doc_type: 'order_cancel',
              doc_number: order.order_number,
            },
            createdBy: req.user ? req.user._id : undefined,
          },
        ],
        { session }
      );
    }

    order.status = 'Cancelled';
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    const transformed = convertOrderMoney(
      order.toObject({ virtuals: true })
    );

    return res.json({
      success: true,
      data: { order: transformed },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

