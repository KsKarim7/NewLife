const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Product = require('../models/Product');
const InventoryTransaction = require('../models/InventoryTransaction');
const Counter = require('../models/Counter');

const paisaToTakaString = (value) => {
  if (value === null || value === undefined) return '0.00';
  const num = Number(value);
  if (Number.isNaN(num)) return '0.00';
  return (num / 100).toFixed(2);
};

const convertMoneyFields = (productObj) => {
  if (!productObj) return productObj;
  if (Object.prototype.hasOwnProperty.call(productObj, 'selling_price_paisa')) {
    productObj.selling_price_paisa = paisaToTakaString(
      productObj.selling_price_paisa
    );
  }
  if (Object.prototype.hasOwnProperty.call(productObj, 'buying_price_paisa')) {
    productObj.buying_price_paisa = paisaToTakaString(
      productObj.buying_price_paisa
    );
  }
  return productObj;
};

const buildPagination = (total, page, limit) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  return { total, page, limit, pages };
};

exports.getAllProducts = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
  const search = req.query.search;
  const { category_id } = req.query;

  const filter = { is_deleted: false };

  if (category_id) {
    filter.category_id = category_id;
  }

  if (search && search.trim()) {
    filter.$text = { $search: search.trim() };
  }

  const total = await Product.countDocuments(filter);

  const products = await Product.find(filter)
    .populate('category_id', 'name slug')
    .skip((page - 1) * limit)
    .limit(limit)
    .sort({ createdAt: 1 });

  const transformed = products.map((doc) =>
    convertMoneyFields(doc.toObject({ virtuals: true }))
  );

  return res.json({
    success: true,
    data: {
      products: transformed,
      pagination: buildPagination(total, page, limit),
    },
  });
};

exports.getProductById = async (req, res) => {
  const { id } = req.params;

  const product = await Product.findOne({
    _id: id,
    is_deleted: false,
  }).populate('category_id', 'name slug');

  if (!product) {
    return res
      .status(404)
      .json({ success: false, message: 'Product not found' });
  }

  const transformed = convertMoneyFields(
    product.toObject({ virtuals: true })
  );

  return res.json({
    success: true,
    data: { product: transformed },
  });
};

exports.createProduct = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
    });
  }

  const {
    product_code,
    name,
    description,
    category_id,
    unit,
    selling_price,
    buying_price,
    vat_enabled,
    vat_percent,
    image_url,
    weight,
    weight_unit,
    stock_qty,
  } = req.body;

  const existing = await Product.findOne({
    product_code,
    is_deleted: false,
  });

  if (existing) {
    return res.status(409).json({
      success: false,
      message: 'Product code already exists',
    });
  }

  const sellingPaisa = Math.round(parseFloat(selling_price) * 100);
  const buyingPaisa = Math.round(parseFloat(buying_price) * 100);
  const initialStock = parseInt(stock_qty) || 0;

  const product = await Product.create({
    product_code,
    name,
    description,
    category_id,
    unit,
    selling_price_paisa: sellingPaisa,
    buying_price_paisa: buyingPaisa,
    vat_enabled,
    vat_percent,
    image_url,
    weight,
    weight_unit,
    on_hand: initialStock,
  });

  // Create inventory transaction for initial stock if quantity > 0
  if (initialStock > 0) {
    const movementId = await Counter.nextVal('movements');

    await InventoryTransaction.create({
      movement_id: movementId,
      product_id: product._id,
      product_code: product.product_code,
      product_name: product.name,
      qty: initialStock,
      type: 'adjustment',
      source: {
        doc_type: 'product_creation',
        doc_number: product.product_code,
      },
      createdBy: req.user ? req.user._id : undefined,
    });
  }

  const transformed = convertMoneyFields(
    product.toObject({ virtuals: true })
  );

  return res.status(201).json({
    success: true,
    data: { product: transformed },
  });
};

exports.updateProduct = async (req, res) => {
  const { id } = req.params;

  const product = await Product.findOne({
    _id: id,
    is_deleted: false,
  }).populate('category_id', 'name slug');

  if (!product) {
    return res
      .status(404)
      .json({ success: false, message: 'Product not found' });
  }

  const updatableFields = [
    'product_code',
    'name',
    'description',
    'unit',
    'vat_enabled',
    'vat_percent',
    'image_url',
    'weight',
    'weight_unit',
  ];

  updatableFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      product[field] = req.body[field];
    }
  });

  // Handle category_id separately to ensure proper ObjectId conversion
  if (req.body.category_id) {
    try {
      product.category_id = new mongoose.Types.ObjectId(req.body.category_id);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID format',
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'selling_price')) {
    const sellingPaisa = Math.round(
      parseFloat(req.body.selling_price) * 100
    );
    product.selling_price_paisa = sellingPaisa;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'buying_price')) {
    const buyingPaisa = Math.round(
      parseFloat(req.body.buying_price) * 100
    );
    product.buying_price_paisa = buyingPaisa;
  }

  await product.save();

  const transformed = convertMoneyFields(
    product.toObject({ virtuals: true })
  );

  return res.json({
    success: true,
    data: { product: transformed },
  });
};

exports.deleteProduct = async (req, res) => {
  const { id } = req.params;

  const product = await Product.findOne({
    _id: id,
    is_deleted: false,
  });

  if (!product) {
    return res
      .status(404)
      .json({ success: false, message: 'Product not found' });
  }

  product.is_deleted = true;
  await product.save();

  return res.json({
    success: true,
    data: {},
  });
};

exports.adjustStock = async (req, res) => {
  const { id } = req.params;
  const { qty, reason } = req.body;

  const delta = Number(qty);

  if (!Number.isFinite(delta) || delta === 0) {
    return res.status(400).json({
      success: false,
      message: 'Quantity must be a non-zero number',
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
    const query = Product.findOne({
      _id: id,
      is_deleted: false,
    });
    
    if (useTransaction) {
      query.session(session);
    }
    
    const product = await query.populate('category_id', 'name slug');

    if (!product) {
      if (useTransaction) {
        await session.abortTransaction();
      }
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: 'Product not found' });
    }

    const newOnHand = (product.on_hand || 0) + delta;

    if (newOnHand < 0) {
      if (useTransaction) {
        await session.abortTransaction();
      }
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Insufficient stock',
      });
    }

    product.on_hand = newOnHand;
    await product.save({ session: useTransaction ? session : undefined });

    const movementId = await Counter.nextVal('movements', useTransaction ? session : undefined);

    const transaction = await InventoryTransaction.create(
      [
        {
          movement_id: movementId,
          product_id: product._id,
          product_code: product.product_code,
          product_name: product.name,
          qty: delta,
          type: 'adjustment',
          source: {
            doc_type: 'adjustment',
            doc_number: reason,
          },
          createdBy: req.user ? req.user._id : undefined,
        },
      ],
      useTransaction ? { session } : {}
    );

    if (useTransaction) {
      await session.commitTransaction();
    }
    session.endSession();

    const transformedProduct = convertMoneyFields(
      product.toObject({ virtuals: true })
    );

    return res.json({
      success: true,
      data: {
        product: transformedProduct,
        transaction: transaction[0],
      },
    });
  } catch (err) {
    if (useTransaction) {
      await session.abortTransaction();
    }
    session.endSession();
    throw err;
  }
};

