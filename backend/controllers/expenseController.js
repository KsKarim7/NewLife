const { validationResult } = require('express-validator');
const Expense = require('../models/Expense');
const Settings = require('../models/Settings');
const { toLocalStartOfDay, toLocalEndOfDay } = require('../utils/dateUtils');

const paisaToTakaString = (value) => {
  if (value === null || value === undefined) return '0.00';
  const num = Number(value);
  if (Number.isNaN(num)) return '0.00';
  return (num / 100).toFixed(2);
};

const convertExpenseMoney = (expenseObj) => {
  if (!expenseObj) return expenseObj;

  if ('total_amount_paisa' in expenseObj) {
    expenseObj.total_amount_paisa = paisaToTakaString(
      expenseObj.total_amount_paisa
    );
  }
  if ('paid_amount_paisa' in expenseObj) {
    expenseObj.paid_amount_paisa = paisaToTakaString(
      expenseObj.paid_amount_paisa
    );
  }
  if ('due_amount_paisa' in expenseObj) {
    expenseObj.due_amount_paisa = paisaToTakaString(
      expenseObj.due_amount_paisa
    );
  }

  return expenseObj;
};

const buildPagination = (total, page, limit) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  return { total, page, limit, pages };
};

exports.getAllExpenses = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 10000);
  const { from, to } = req.query;

  const filter = { is_deleted: false };

  if (from || to) {
    const conditions = [];
    const effectiveField = {
      $ifNull: ['$accounting_date', '$date'],
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

  const total = await Expense.countDocuments(filter);

  const expenses = await Expense.find(filter)
    .sort({ date: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  const transformedExpenses = expenses.map((doc) =>
    convertExpenseMoney(doc.toObject({ virtuals: true }))
  );

  const summaryAgg = await Expense.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        total_amount_paisa: { $sum: '$total_amount_paisa' },
        total_paid_paisa: { $sum: '$paid_amount_paisa' },
      },
    },
  ]);

  let summary = {
    total_amount: '0.00',
    total_paid: '0.00',
    total_due: '0.00',
  };

  if (summaryAgg.length > 0) {
    const row = summaryAgg[0];
    const total_amount_paisa = row.total_amount_paisa || 0;
    const total_paid_paisa = row.total_paid_paisa || 0;
    const total_due_paisa = total_amount_paisa - total_paid_paisa;

    summary = {
      total_amount: paisaToTakaString(total_amount_paisa),
      total_paid: paisaToTakaString(total_paid_paisa),
      total_due: paisaToTakaString(total_due_paisa),
    };
  }

  return res.json({
    success: true,
    data: {
      expenses: transformedExpenses,
      pagination: buildPagination(total, page, limit),
      summary,
    },
  });
};

exports.createExpense = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
    });
  }

  const { date, party_name, description, total_amount, paid_amount } =
    req.body;

  const total_amount_paisa = Math.round(
    parseFloat(total_amount) * 100
  );
  const paid_amount_paisa = Math.round(
    parseFloat(paid_amount || '0') * 100
  );

  if (paid_amount_paisa > total_amount_paisa) {
    return res.status(400).json({
      success: false,
      message: 'Paid amount cannot exceed total amount',
    });
  }

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

  const expense = await Expense.create({
    date: date ? new Date(date) : undefined,
    party_name,
    description,
    total_amount_paisa,
    paid_amount_paisa,
    accounting_date,
  });

  const transformed = convertExpenseMoney(
    expense.toObject({ virtuals: true })
  );

  return res.status(201).json({
    success: true,
    data: { expense: transformed },
  });
};

exports.updateExpense = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
    });
  }

  const { id } = req.params;

  const expense = await Expense.findOne({
    _id: id,
    is_deleted: false,
  });

  if (!expense) {
    return res
      .status(404)
      .json({ success: false, message: 'Expense not found' });
  }

  const { date, party_name, description, total_amount, paid_amount } =
    req.body;

  if (typeof date !== 'undefined') {
    expense.date = new Date(date);
  }
  if (typeof party_name !== 'undefined') {
    expense.party_name = party_name;
  }
  if (typeof description !== 'undefined') {
    expense.description = description;
  }

  if (typeof total_amount !== 'undefined') {
    expense.total_amount_paisa = Math.round(
      parseFloat(total_amount) * 100
    );
  }

  if (typeof paid_amount !== 'undefined') {
    expense.paid_amount_paisa = Math.round(
      parseFloat(paid_amount || '0') * 100
    );
  }

  // Validate that paid_amount does not exceed total_amount
  const total_paisa = expense.total_amount_paisa || 0;
  const paid_paisa = expense.paid_amount_paisa || 0;

  if (paid_paisa > total_paisa) {
    return res.status(400).json({
      success: false,
      message: 'Paid amount cannot exceed total amount',
    });
  }

  const transformed = convertExpenseMoney(
    expense.toObject({ virtuals: true })
  );

  return res.json({
    success: true,
    data: { expense: transformed },
  });
};

exports.deleteExpense = async (req, res) => {
  const { id } = req.params;

  const expense = await Expense.findOne({
    _id: id,
    is_deleted: false,
  });

  if (!expense) {
    return res
      .status(404)
      .json({ success: false, message: 'Expense not found' });
  }

  expense.is_deleted = true;
  await expense.save();

  return res.json({
    success: true,
    data: {},
  });
};

