const { validationResult } = require('express-validator');
const Customer = require('../models/Customer');
const Order = require('../models/Order');

const paisaToTakaString = (value) => {
  if (value === null || value === undefined) return '0.00';
  const num = Number(value);
  if (Number.isNaN(num)) return '0.00';
  return (num / 100).toFixed(2);
};

const buildPagination = (total, page, limit) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  return { total, page, limit, pages };
};

exports.getAllCustomers = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
  const search = req.query.search;

  const filter = { is_deleted: false };

  if (search && search.trim()) {
    const regex = new RegExp(search.trim(), 'i');
    filter.$or = [{ name: regex }, { phone: regex }];
  }

  const total = await Customer.countDocuments(filter);

  const customers = await Customer.find(filter)
    .skip((page - 1) * limit)
    .limit(limit)
    .sort({ name: 1 });

  return res.json({
    success: true,
    data: {
      customers,
      pagination: buildPagination(total, page, limit),
    },
  });
};

exports.getCustomerById = async (req, res) => {
  const { id } = req.params;

  const customer = await Customer.findOne({ _id: id, is_deleted: false });

  if (!customer) {
    return res
      .status(404)
      .json({ success: false, message: 'Customer not found' });
  }

  return res.json({
    success: true,
    data: { customer },
  });
};

exports.getCustomerOrders = async (req, res) => {
  const { id } = req.params;

  const orders = await Order.find({
    'customer.customer_id': id,
    is_deleted: false,
  })
    .sort({ createdAt: -1 })
    .select(
      'order_number status total_paisa amount_due_paisa createdAt'
    );

  const result = orders.map((order) => ({
    order_number: order.order_number,
    status: order.status,
    total: paisaToTakaString(order.total_paisa),
    amount_due: paisaToTakaString(order.amount_due_paisa),
    createdAt: order.createdAt,
  }));

  return res.json({
    success: true,
    data: { orders: result },
  });
};

exports.createCustomer = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
    });
  }

  const { name, phone, address } = req.body;

  const customer = await Customer.create({ name, phone, address });

  return res.status(201).json({
    success: true,
    data: { customer },
  });
};

exports.updateCustomer = async (req, res) => {
  const { id } = req.params;

  const customer = await Customer.findOne({ _id: id, is_deleted: false });

  if (!customer) {
    return res
      .status(404)
      .json({ success: false, message: 'Customer not found' });
  }

  const { name, phone, address } = req.body;

  if (typeof name !== 'undefined') {
    customer.name = name;
  }
  if (typeof phone !== 'undefined') {
    customer.phone = phone;
  }
  if (typeof address !== 'undefined') {
    customer.address = address;
  }

  await customer.save();

  return res.json({
    success: true,
    data: { customer },
  });
};

