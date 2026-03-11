const { generatePDF, generateExcel } = require('../utils/exportService');
const reportTemplates = require('../utils/reportTemplates');
const { toLocalStartOfDay, toLocalEndOfDay } = require('../utils/dateUtils');
const Order = require('../models/Order');
const Purchase = require('../models/Purchase');
const SalesReturn = require('../models/SalesReturn');
const PurchaseReturn = require('../models/PurchaseReturn');
const Expense = require('../models/Expense');
const InventoryTransaction = require('../models/InventoryTransaction');
const Product = require('../models/Product');

const paisaToTakaString = (value) => {
  if (value === null || value === undefined) return '0.00';
  const num = Number(value);
  if (Number.isNaN(num)) return '0.00';
  return (num / 100).toFixed(2);
};

const getDefaultDateRange = () => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  from.setHours(0, 0, 0, 0);
  return { from, to };
};

const getFilename = (module, format, date) => {
  const d = date || new Date();
  const dateStr = d.toISOString().slice(0, 10);
  const ext = format === 'pdf' ? 'pdf' : 'xlsx';
  return `${module}-report-${dateStr}.${ext}`;
};

const fetchData = async (module, from, to) => {
  const dateField = ['sales', 'stock-movements'].includes(module)
    ? 'createdAt'
    : module === 'expenses'
    ? 'date'
    : module === 'purchases' || module === 'purchase-returns'
    ? 'date'
    : 'return_date';

  const dateFilter = {
    [dateField]: { $gte: from, $lte: to }
  };

  switch (module) {
    case 'sales':
      return {
        orders: await Order.find({
          ...dateFilter,
          status: { $nin: ['Cancelled', 'Returned'] }
        })
          .sort({ createdAt: -1 })
          .lean(),
      };
    case 'purchases':
      return {
        purchases: await Purchase.find({
          ...dateFilter,
          status: { $ne: 'Cancelled' }
        }).sort({ date: -1 }).lean(),
      };
    case 'sales-returns':
      return {
        returns: await SalesReturn.find(dateFilter)
          .sort({ return_date: -1 })
          .lean(),
      };
    case 'purchase-returns':
      return {
        returns: await PurchaseReturn.find(dateFilter)
          .sort({ date: -1 })
          .lean(),
      };
    case 'expenses':
      return {
        expenses: await Expense.find(dateFilter).sort({ date: -1 }).lean(),
      };
    case 'stock-movements':
      return {
        transactions: await InventoryTransaction.find(dateFilter)
          .populate('product_id', 'name product_code')
          .sort({ createdAt: -1 })
          .lean(),
      };
    case 'top-products': {
      const transactions = await InventoryTransaction.find({
        type: 'sale_out',
        createdAt: { $gte: from, $lte: to },
      }).lean();
      const byProduct = {};
      for (const t of transactions) {
        const id = String(t.product_id);
        if (!byProduct[id]) byProduct[id] = { qty_sold: 0, product_name: t.product_name };
        byProduct[id].qty_sold += Math.abs(t.qty || 0);
        byProduct[id].product_id = t.product_id;
      }
      const arr = Object.values(byProduct)
        .sort((a, b) => b.qty_sold - a.qty_sold)
        .slice(0, 20);
      const top_products = await Promise.all(
        arr.map(async (x) => {
          const p = await Product.findById(x.product_id)
            .select('name selling_price_paisa')
            .lean();
          const name = p?.name || x.product_name || 'Unknown';
          const revenue = (Number(p?.selling_price_paisa) || 0) * x.qty_sold;
          return {
            name,
            qty_sold: x.qty_sold,
            revenue_taka: paisaToTakaString(revenue),
          };
        })
      );
      return { top_products };
    }
    default:
      return {};
  }
};

const getTemplate = (module) => {
  const map = {
    sales: reportTemplates.salesReportTemplate,
    purchases: reportTemplates.purchasesReportTemplate,
    'sales-returns': reportTemplates.salesReturnsReportTemplate,
    'purchase-returns': reportTemplates.purchaseReturnsReportTemplate,
    expenses: reportTemplates.expensesReportTemplate,
    'stock-movements': reportTemplates.stockMovementsReportTemplate,
    'top-products': reportTemplates.topProductsReportTemplate,
  };
  return map[module];
};

const getExcelConfig = (module, data) => {
  const common = { header: 'Header', key: 'key', width: 15 };
  switch (module) {
    case 'sales': {
      const orders = data.orders || [];
      return {
        columns: [
          { header: 'Order #', key: 'order_number', width: 14 },
          { header: 'Customer', key: 'customer_name', width: 20 },
          { header: 'Total (৳)', key: 'total', width: 14 },
          { header: 'Status', key: 'status', width: 14 },
          { header: 'Date', key: 'date', width: 12 },
        ],
        rows: orders.map((o) => ({
          order_number: o.order_number,
          customer_name: o.customer?.name || '-',
          total: paisaToTakaString(o.total_paisa),
          status: o.status,
          date: o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '-',
        })),
        sheetName: 'Sales',
      };
    }
    case 'purchases': {
      const purchases = data.purchases || [];
      return {
        columns: [
          { header: 'Purchase #', key: 'purchase_number', width: 14 },
          { header: 'Net (৳)', key: 'net', width: 14 },
          { header: 'Paid (৳)', key: 'paid', width: 14 },
          { header: 'Due (৳)', key: 'due', width: 14 },
          { header: 'Date', key: 'date', width: 12 },
        ],
        rows: purchases.map((p) => ({
          purchase_number: p.purchase_number,
          net: paisaToTakaString(p.net_amount_paisa),
          paid: paisaToTakaString(p.paid_amount_paisa),
          due: paisaToTakaString(p.due_amount_paisa),
          date: p.date ? new Date(p.date).toLocaleDateString() : '-',
        })),
        sheetName: 'Purchases',
      };
    }
    case 'sales-returns': {
      const returns = data.returns || [];
      return {
        columns: [
          { header: 'Return #', key: 'return_number', width: 14 },
          { header: 'Customer', key: 'customer_name', width: 20 },
          { header: 'Lines', key: 'lines', width: 8 },
          { header: 'Date', key: 'date', width: 12 },
        ],
        rows: returns.map((r) => ({
          return_number: r.return_number,
          customer_name: r.customer?.name || '-',
          lines: r.lines?.length || 0,
          date: r.return_date
            ? new Date(r.return_date).toLocaleDateString()
            : '-',
        })),
        sheetName: 'Sales Returns',
      };
    }
    case 'purchase-returns': {
      const returns = data.returns || [];
      return {
        columns: [
          { header: 'Return #', key: 'return_number', width: 14 },
          { header: 'Lines', key: 'lines', width: 8 },
          { header: 'Date', key: 'date', width: 12 },
        ],
        rows: returns.map((r) => ({
          return_number: r.return_number,
          lines: r.lines?.length || 0,
          date: r.date ? new Date(r.date).toLocaleDateString() : '-',
        })),
        sheetName: 'Purchase Returns',
      };
    }
    case 'expenses': {
      const expenses = data.expenses || [];
      return {
        columns: [
          { header: 'Date', key: 'date', width: 12 },
          { header: 'Party', key: 'party_name', width: 20 },
          { header: 'Description', key: 'description', width: 24 },
          { header: 'Total (৳)', key: 'total', width: 14 },
          { header: 'Paid (৳)', key: 'paid', width: 14 },
        ],
        rows: expenses.map((e) => ({
          date: e.date ? new Date(e.date).toLocaleDateString() : '-',
          party_name: e.party_name,
          description: e.description || '-',
          total: paisaToTakaString(e.total_amount_paisa),
          paid: paisaToTakaString(e.paid_amount_paisa),
        })),
        sheetName: 'Expenses',
      };
    }
    case 'stock-movements': {
      const transactions = data.transactions || [];
      return {
        columns: [
          { header: 'Movement ID', key: 'movement_id', width: 14 },
          { header: 'Product', key: 'product_name', width: 24 },
          { header: 'Qty', key: 'qty', width: 8 },
          { header: 'Type', key: 'type', width: 14 },
          { header: 'Source', key: 'source', width: 14 },
          { header: 'Date', key: 'date', width: 18 },
        ],
        rows: transactions.map((t) => ({
          movement_id: t.movement_id,
          product_name: t.product_id?.name || t.product_name || t.product_code || '-',
          qty: t.qty,
          type: t.type,
          source: t.source?.doc_number || '-',
          date: t.createdAt ? new Date(t.createdAt).toLocaleString() : '-',
        })),
        sheetName: 'Stock Movements',
      };
    }
    case 'top-products': {
      const top_products = data.top_products || [];
      return {
        columns: [
          { header: 'Product', key: 'name', width: 24 },
          { header: 'Qty Sold', key: 'qty_sold', width: 12 },
          { header: 'Revenue (৳)', key: 'revenue_taka', width: 14 },
        ],
        rows: top_products.map((p) => ({
          name: p.name,
          qty_sold: p.qty_sold,
          revenue_taka: p.revenue_taka,
        })),
        sheetName: 'Top Products',
      };
    }
    default:
      return { columns: [], rows: [], sheetName: 'Report' };
  }
};

const createReportHandler = (module) => async (req, res) => {
  const format = req.query.format || 'json';
  let from = req.query.from;
  let to = req.query.to;

  if (!from || !to) {
    const def = getDefaultDateRange();
    from = from ? toLocalStartOfDay(from) : def.from;
    to = to ? toLocalEndOfDay(to) : def.to;
  } else {
    from = toLocalStartOfDay(from);
    to = toLocalEndOfDay(to);
  }

  const dateRange = { from, to };

  const data = await fetchData(module, from, to);

  if (format === 'json') {
    return res.json({ success: true, data: { ...data, dateRange } });
  }

  if (format === 'pdf') {
    const templateFn = getTemplate(module);
    if (!templateFn) {
      return res.status(400).json({ success: false, message: 'Invalid report' });
    }
    const html = templateFn(data, dateRange);
    const buffer = await generatePDF(html);
    res.set('Content-Type', 'application/pdf');
    res.set(
      'Content-Disposition',
      `attachment; filename="${getFilename(module, 'pdf', to)}"`
    );
    return res.send(buffer);
  }

  if (format === 'excel') {
    const config = getExcelConfig(module, data);
    const buffer = await generateExcel(
      config.columns,
      config.rows,
      config.sheetName
    );
    res.set(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.set(
      'Content-Disposition',
      `attachment; filename="${getFilename(module, 'excel', to)}"`
    );
    return res.send(buffer);
  }

  return res.status(400).json({
    success: false,
    message: 'Invalid format. Use json, pdf, or excel',
  });
};

exports.getSalesReport = createReportHandler('sales');
exports.getPurchasesReport = createReportHandler('purchases');
exports.getSalesReturnsReport = createReportHandler('sales-returns');
exports.getPurchaseReturnsReport = createReportHandler('purchase-returns');
exports.getExpensesReport = createReportHandler('expenses');
exports.getStockMovementsReport = createReportHandler('stock-movements');
exports.getTopProductsReport = createReportHandler('top-products');
