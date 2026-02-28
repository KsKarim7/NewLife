const { validationResult } = require('express-validator');
const slugify = require('slugify');
const Category = require('../models/Category');
const Product = require('../models/Product');

const buildSlug = (name) =>
  slugify(name, {
    lower: true,
    strict: true,
    trim: true,
  });

exports.getAllCategories = async (req, res) => {
  const categories = await Category.find({ is_deleted: false })
    .select('name slug description createdAt')
    .sort({ name: 1 });

  return res.json({
    success: true,
    data: { categories },
  });
};

exports.createCategory = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
    });
  }

  const { name, description } = req.body;
  const slug = buildSlug(name);

  const existing = await Category.findOne({
    is_deleted: false,
    $or: [{ name }, { slug }],
  });

  if (existing) {
    return res.status(409).json({
      success: false,
      message: 'Category with this name already exists',
    });
  }

  const category = await Category.create({
    name,
    slug,
    description,
  });

  return res.status(201).json({
    success: true,
    data: { category },
  });
};

exports.updateCategory = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
    });
  }

  const { id } = req.params;
  const { name, description } = req.body;

  const category = await Category.findOne({ _id: id, is_deleted: false });

  if (!category) {
    return res
      .status(404)
      .json({ success: false, message: 'Category not found' });
  }

  if (typeof name === 'string' && name.trim().length > 0) {
    const slug = buildSlug(name);

    const conflict = await Category.findOne({
      _id: { $ne: category._id },
      is_deleted: false,
      $or: [{ name }, { slug }],
    });

    if (conflict) {
      return res.status(409).json({
        success: false,
        message: 'Category with this name already exists',
      });
    }

    category.name = name;
    category.slug = slug;
  }

  if (typeof description !== 'undefined') {
    category.description = description;
  }

  await category.save();

  return res.json({
    success: true,
    data: { category },
  });
};

exports.deleteCategory = async (req, res) => {
  const { id } = req.params;

  const category = await Category.findOne({ _id: id, is_deleted: false });

  if (!category) {
    return res
      .status(404)
      .json({ success: false, message: 'Category not found' });
  }

  const productCount = await Product.countDocuments({
    category_id: id,
    is_deleted: false,
  });

  if (productCount > 0) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete — products exist under this category',
    });
  }

  category.is_deleted = true;
  await category.save();

  return res.json({
    success: true,
    data: {},
  });
};

