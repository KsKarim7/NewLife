const InventoryTransaction = require('../models/InventoryTransaction');

const paisaToTakaString = (value) => {
  if (value === null || value === undefined) return '0.00';
  const num = Number(value);
  if (Number.isNaN(num)) return '0.00';
  return (num / 100).toFixed(2);
};

const formatDateTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  const mins = String(minutes).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${mins} ${ampm}`;
};

const buildPagination = (total, page, limit) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  return { total, page, limit, pages, totalPages: pages };
};

exports.getTransactions = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
  const { product_id, from, to, type } = req.query;

  const filter = {};

  if (product_id) {
    filter.product_id = product_id;
  }

  if (type) {
    filter.type = type;
  }

  if (from || to) {
    filter.createdAt = {};
    if (from) {
      filter.createdAt.$gte = new Date(from);
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = toDate;
    }
  }

  const total = await InventoryTransaction.countDocuments(filter);

  const transactions = await InventoryTransaction.find(filter)
    .populate('product_id', 'name product_code unit')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const transformed = transactions.map((doc) => {
    const productName = doc.product_id?.name ?? doc.product_name;
    const productCode = doc.product_id?.product_code ?? doc.product_code;
    const doneBy = doc.createdBy?.name ?? 'System';
    return {
      _id: doc._id,
      movement_id: doc.movement_id,
      product_name: productName,
      product_code: productCode,
      qty: doc.qty,
      type: doc.type,
      source: {
        doc_type: doc.source?.doc_type,
        doc_number: doc.source?.doc_number,
      },
      before_qty: doc.before_qty,
      after_qty: doc.after_qty,
      done_by: doneBy,
      occurred_at: doc.createdAt,
    };
  });

  return res.json({
    success: true,
    data: {
      transactions: transformed,
      pagination: buildPagination(total, page, limit),
    },
  });
};
