const formatDate = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return x.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatMoney = (paisa) => {
  if (paisa == null) return '৳0.00';
  const n = Number(paisa);
  return '৳' + (n / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const baseStyles = `
  * { box-sizing: border-box; }
  body { font-family: 'DM Sans', Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
  .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #1E3A5F; padding-bottom: 16px; }
  .header h1 { color: #1E3A5F; margin: 0; font-size: 24px; }
  .header .sub { color: #666; font-size: 14px; margin-top: 4px; }
  .meta { margin-bottom: 20px; }
  .meta span { font-weight: 600; color: #1E3A5F; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th { background: #1E3A5F; color: white; padding: 10px 12px; text-align: left; font-weight: 600; }
  td { padding: 8px 12px; border-bottom: 1px solid #ddd; }
  tr:nth-child(even) { background: #f9f9f9; }
  .summary { background: #e8eef5; padding: 12px 16px; margin: 16px 0; border-radius: 6px; font-weight: 600; }
  .footer { margin-top: 32px; font-size: 12px; color: #888; text-align: center; }
`;

const wrapper = (title, dateRange, summaryHtml, tableHtml) => {
  const fromStr = formatDate(dateRange?.from);
  const toStr = formatDate(dateRange?.to);
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${baseStyles}</style>
</head>
<body>
  <div class="header">
    <h1>Inventory Management System</h1>
    <div class="sub">${title}</div>
  </div>
  <div class="meta">
    <span>Period:</span> ${fromStr} – ${toStr}
  </div>
  ${summaryHtml}
  ${tableHtml}
  <div class="footer">
    Generated on ${new Date().toLocaleString('en-GB')}
  </div>
</body>
</html>`;
};

exports.salesReportTemplate = (data, dateRange) => {
  const orders = data.orders || [];
  const total = orders.reduce((s, o) => s + Number(o.total_paisa || 0), 0);
  const summary = `<div class="summary">Total Sales: ${formatMoney(total)} | Orders: ${orders.length}</div>`;
  const rows = orders
    .map(
      (o) =>
        `<tr>
          <td>${o.order_number || '-'}</td>
          <td>${o.customer?.name || '-'}</td>
          <td>${formatMoney(o.total_paisa)}</td>
          <td>${o.status || '-'}</td>
          <td>${formatDate(o.createdAt)}</td>
        </tr>`
    )
    .join('');
  const table = `
    <table>
      <thead><tr><th>Order #</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  return wrapper('Sales Report', dateRange, summary, table);
};

exports.purchasesReportTemplate = (data, dateRange) => {
  const purchases = data.purchases || [];
  const total = purchases.reduce(
    (s, p) => s + Number(p.net_amount_paisa || 0),
    0
  );
  const summary = `<div class="summary">Total Purchases: ${formatMoney(total)} | Count: ${purchases.length}</div>`;
  const rows = purchases
    .map(
      (p) =>
        `<tr>
          <td>${p.purchase_number || '-'}</td>
          <td>${formatMoney(p.net_amount_paisa)}</td>
          <td>${formatMoney(p.paid_amount_paisa)}</td>
          <td>${formatMoney(p.due_amount_paisa)}</td>
          <td>${formatDate(p.date)}</td>
        </tr>`
    )
    .join('');
  const table = `
    <table>
      <thead><tr><th>Purchase #</th><th>Net</th><th>Paid</th><th>Due</th><th>Date</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  return wrapper('Purchases Report', dateRange, summary, table);
};

exports.salesReturnsReportTemplate = (data, dateRange) => {
  const returns = data.returns || [];
  const summary = `<div class="summary">Sales Returns: ${returns.length}</div>`;
  const rows = returns
    .map(
      (r) =>
        `<tr>
          <td>${r.return_number || '-'}</td>
          <td>${r.customer?.name || '-'}</td>
          <td>${r.lines?.length || 0}</td>
          <td>${formatDate(r.return_date)}</td>
        </tr>`
    )
    .join('');
  const table = `
    <table>
      <thead><tr><th>Return #</th><th>Customer</th><th>Lines</th><th>Date</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  return wrapper('Sales Returns Report', dateRange, summary, table);
};

exports.purchaseReturnsReportTemplate = (data, dateRange) => {
  const returns = data.returns || [];
  const summary = `<div class="summary">Purchase Returns: ${returns.length}</div>`;
  const rows = returns
    .map(
      (r) =>
        `<tr>
          <td>${r.return_number || '-'}</td>
          <td>${r.lines?.length || 0}</td>
          <td>${formatDate(r.date)}</td>
        </tr>`
    )
    .join('');
  const table = `
    <table>
      <thead><tr><th>Return #</th><th>Lines</th><th>Date</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  return wrapper('Purchase Returns Report', dateRange, summary, table);
};

exports.expensesReportTemplate = (data, dateRange) => {
  const expenses = data.expenses || [];
  const total = expenses.reduce(
    (s, e) => s + Number(e.total_amount_paisa || 0),
    0
  );
  const paid = expenses.reduce(
    (s, e) => s + Number(e.paid_amount_paisa || 0),
    0
  );
  const summary = `<div class="summary">Total: ${formatMoney(total)} | Paid: ${formatMoney(paid)} | Count: ${expenses.length}</div>`;
  const rows = expenses
    .map(
      (e) =>
        `<tr>
          <td>${formatDate(e.date)}</td>
          <td>${e.party_name || '-'}</td>
          <td>${e.description || '-'}</td>
          <td>${formatMoney(e.total_amount_paisa)}</td>
          <td>${formatMoney(e.paid_amount_paisa)}</td>
        </tr>`
    )
    .join('');
  const table = `
    <table>
      <thead><tr><th>Date</th><th>Party</th><th>Description</th><th>Total</th><th>Paid</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  return wrapper('Expenses Report', dateRange, summary, table);
};

exports.stockMovementsReportTemplate = (data, dateRange) => {
  const transactions = data.transactions || [];
  const summary = `<div class="summary">Stock Movements: ${transactions.length}</div>`;
  const rows = transactions
    .map(
      (t) =>
        `<tr>
          <td>${t.movement_id || '-'}</td>
          <td>${t.product_id?.name || t.product_name || t.product_code || '-'}</td>
          <td>${t.qty}</td>
          <td>${t.type || '-'}</td>
          <td>${t.source?.doc_number || '-'}</td>
          <td>${formatDate(t.createdAt)}</td>
        </tr>`
    )
    .join('');
  const table = `
    <table>
      <thead><tr><th>Movement ID</th><th>Product</th><th>Qty</th><th>Type</th><th>Source</th><th>Date</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  return wrapper('Stock Movements Report', dateRange, summary, table);
};

exports.topProductsReportTemplate = (data, dateRange) => {
  const products = data.top_products || [];
  const summary = `<div class="summary">Top ${products.length} Products by Sales</div>`;
  const rows = products
    .map(
      (p) =>
        `<tr>
          <td>${p.name || '-'}</td>
          <td>${p.qty_sold ?? '-'}</td>
          <td>৳${(p.revenue_taka || '0.00')}</td>
        </tr>`
    )
    .join('');
  const table = `
    <table>
      <thead><tr><th>Product</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  return wrapper('Top Products Report', dateRange, summary, table);
};
