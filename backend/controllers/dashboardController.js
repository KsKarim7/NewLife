const Order = require('../models/Order');
const Product = require('../models/Product');
const InventoryTransaction = require('../models/InventoryTransaction');
const Category = require('../models/Category');

const paisaToTakaString = (value) => {
  if (value === null || value === undefined) return '0.00';
  const num = Number(value);
  if (Number.isNaN(num)) return '0.00';
  return (num / 100).toFixed(2);
};

const getDateRange = (period, from, to) => {
  const now = new Date();
  let startCurrent;
  let endCurrent = new Date(now);
  endCurrent.setHours(23, 59, 59, 999);

  if (period === 'custom' && from && to) {
    startCurrent = new Date(from);
    startCurrent.setHours(0, 0, 0, 0);
    endCurrent = new Date(to);
    endCurrent.setHours(23, 59, 59, 999);
    const days = Math.ceil((endCurrent - startCurrent) / (24 * 60 * 60 * 1000)) + 1;
    return { startCurrent, endCurrent, days };
  }

  if (period === '30d' || period === 'month') {
    startCurrent = new Date(now);
    startCurrent.setDate(startCurrent.getDate() - 29);
    startCurrent.setHours(0, 0, 0, 0);
    return { startCurrent, endCurrent, days: 30 };
  }

  startCurrent = new Date(now);
  startCurrent.setDate(startCurrent.getDate() - 6);
  startCurrent.setHours(0, 0, 0, 0);
  return { startCurrent, endCurrent, days: 7 };
};

const getStartOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const getEndOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

const getStartOfMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getEndOfMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  return d;
};

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

exports.getDashboardStats = async (req, res) => {
  const period = req.query.period || '7d';
  const { from, to } = req.query;

  const {
    total_products,
    todays_sales_taka,
    total_orders_this_month,
    low_stock_count,
  } = await Promise.all([
    Product.countDocuments({ is_deleted: false }),
    Order.aggregate([
      {
        $match: {
          createdAt: { $gte: getStartOfToday(), $lte: getEndOfToday() },
          status: { $ne: 'Cancelled' },
          is_deleted: false,
        },
      },
      { $group: { _id: null, total: { $sum: '$total_paisa' } } },
    ]).then((r) =>
      r[0] ? paisaToTakaString(r[0].total) : '0.00'
    ),
    Order.countDocuments({
      createdAt: { $gte: getStartOfMonth(), $lte: getEndOfMonth() },
      is_deleted: false,
    }),
    Product.countDocuments({
      on_hand: { $lte: 10, $gt: 0 },
      is_deleted: false,
    }),
  ]);

  const { startCurrent, endCurrent, days } = getDateRange(period, from, to);

  const startPrevious = new Date(startCurrent);
  startPrevious.setDate(startPrevious.getDate() - days);
  const endPrevious = new Date(startCurrent);
  endPrevious.setMilliseconds(-1);

  const currentAgg = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: startCurrent, $lte: endCurrent },
        status: { $ne: 'Cancelled' },
        is_deleted: false,
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
        },
        total: { $sum: '$total_paisa' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const previousAgg = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: startPrevious, $lte: endPrevious },
        status: { $ne: 'Cancelled' },
        is_deleted: false,
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
        },
        total: { $sum: '$total_paisa' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const currentMap = Object.fromEntries(
    currentAgg.map((x) => [x._id, paisaToTakaString(x.total)])
  );
  const previousMap = Object.fromEntries(
    previousAgg.map((x) => [x._id, paisaToTakaString(x.total)])
  );

  const allDates = new Set();
  for (let i = 0; i < days; i++) {
    const d = new Date(startCurrent);
    d.setDate(d.getDate() + i);
    allDates.add(d.toISOString().slice(0, 10));
  }
  const sortedDates = [...allDates].sort();

  const current_period = sortedDates.map((d) => ({
    date: dayLabels[new Date(d).getDay()],
    total: currentMap[d] || '0.00',
    dateKey: d,
  }));

  const prevDates = new Set();
  for (let i = 0; i < days; i++) {
    const d = new Date(startPrevious);
    d.setDate(d.getDate() + i);
    prevDates.add(d.toISOString().slice(0, 10));
  }
  const sortedPrevDates = [...prevDates].sort();

  const previous_period = sortedPrevDates.map((d) => ({
    date: dayLabels[new Date(d).getDay()],
    total: previousMap[d] || '0.00',
    dateKey: d,
  }));

  const topProductsAgg = await InventoryTransaction.aggregate([
    { $match: { type: 'sale_out' } },
    {
      $group: {
        _id: '$product_id',
        qty_sold: { $sum: { $abs: '$qty' } },
        product_name: { $first: '$product_name' },
      },
    },
    { $sort: { qty_sold: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
  ]);

  const top_products = topProductsAgg.map((row) => {
    const name = row.product_name || row.product?.name || 'Unknown';
    const price = Number(row.product?.selling_price_paisa || 0);
    const revenue = price * row.qty_sold;
    return {
      name,
      qty_sold: row.qty_sold,
      revenue_taka: paisaToTakaString(revenue),
    };
  });

  const salesByCategoryAgg = await Order.aggregate([
    {
      $match: {
        status: { $ne: 'Cancelled' },
        is_deleted: false,
      },
    },
    { $unwind: '$lines' },
    {
      $lookup: {
        from: 'products',
        localField: 'lines.product_id',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'categories',
        localField: 'product.category_id',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: ['$category.name', 'Uncategorized'] },
        qty_sold: { $sum: '$lines.qty' },
      },
    },
    { $project: { category: '$_id', qty_sold: 1, _id: 0 } },
    { $sort: { qty_sold: -1 } },
  ]);

  const sales_by_category = salesByCategoryAgg.map((x) => ({
    category: x.category,
    qty_sold: x.qty_sold,
  }));

  const recentOrders = await Order.find({ is_deleted: false })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  const recent_orders = recentOrders.map((o) => ({
    _id: o._id,
    order_number: o.order_number,
    customer_name: o.customer?.name,
    total_paisa: paisaToTakaString(o.total_paisa),
    status: o.status,
    createdAt: o.createdAt,
  }));

  return res.json({
    success: true,
    data: {
      total_products,
      todays_sales_taka,
      total_orders_this_month,
      low_stock_count,
      current_period,
      previous_period,
      top_products,
      sales_by_category,
      recent_orders,
    },
  });
};
