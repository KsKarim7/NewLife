// Web API type declarations
declare global {
  interface SerialPort {
    open(options: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
    writable: WritableStream<Uint8Array>;
  }

  interface BluetoothDevice {
    gatt?: BluetoothRemoteGATTServer;
  }

  interface BluetoothRemoteGATTServer {
    connect(): Promise<BluetoothRemoteGATTServer>;
    getPrimaryService(uuid: string): Promise<BluetoothService>;
    disconnect(): void;
  }

  interface BluetoothService {
    getCharacteristic(uuid: string): Promise<BluetoothCharacteristic>;
  }

  interface BluetoothCharacteristic {
    writeValueWithoutResponse(value: Uint8Array): Promise<void>;
  }
}

// ESC/POS command bytes
const ESC = 0x1b;
const GS = 0x1d;

const CMD = {
  INIT: [ESC, 0x40],
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  DOUBLE_SIZE: [ESC, 0x21, 0x30],
  NORMAL_SIZE: [ESC, 0x21, 0x00],
  CUT: [GS, 0x56, 0x42, 0x00],
};

export interface ReceiptLine {
  text: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  doubleSize?: boolean;
}

export interface ReceiptData {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  salesRep: string;
  orderNumber: string;
  invoiceId: string;
  dateStr: string;
  statusLabel: string;
  items: { name: string; qty: number; price: string; total: string }[];
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
}

const LINE_WIDTH = 32;
const divider = '='.repeat(LINE_WIDTH);
const thinDivider = '-'.repeat(LINE_WIDTH);

function center(text: string): string {
  const pad = Math.max(0, Math.floor((LINE_WIDTH - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function summaryRow(label: string, value: string): string {
  const labelPadded = label.padEnd(LINE_WIDTH - value.length);
  return labelPadded + value;
}

export function buildReceiptLines(data: ReceiptData): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  const add = (text: string, opts?: Partial<ReceiptLine>) =>
    lines.push({ text, align: 'left', ...opts });

  add(divider);
  add(center(data.storeName), { align: 'center', bold: true });
  add(center(data.storeAddress), { align: 'center' });
  const phoneLine = data.storePhone.length > LINE_WIDTH - 5
    ? data.storePhone.substring(0, LINE_WIDTH - 8) + '...'
    : data.storePhone;
  if (data.storePhone) add(center('Tel: ' + phoneLine), { align: 'center' });
  add(divider);
  add(`Sales Rep  : ${data.salesRep}`);
  add(`Order S/N  : ${data.orderNumber}`);
  add(`Invoice ID : ${data.invoiceId}`);
  add(`Date & Time: ${data.dateStr}`);
  add(`Status     : ${data.statusLabel}`);
  add(thinDivider);
  add('ITEM INFO       QTY  PRICE   TOTAL');
  add(thinDivider);

  data.items.forEach((item, i) => {
    const num = `${i + 1}.`;
    const name = item.name.substring(0, 14 - num.length);
    const label = (num + name).padEnd(16);
    const qty = String(item.qty).padStart(3);
    const price = item.price.replace('Tk ', '').padStart(6);
    const total = item.total.replace('Tk ', '').padStart(7);
    add(`${label}${qty} ${price} ${total}`);
  });

  add(thinDivider);
  add(summaryRow('TOTAL AMOUNT          :', data.totalAmount));
  add(summaryRow('PAID AMOUNT           :', data.paidAmount));
  add(thinDivider);
  add(summaryRow('DUE AMOUNT            :', data.dueAmount), { bold: true });
  add(divider);
  add(center('Thank you for shopping with us!'), { align: 'center' });
  add(center('Please come visit us again.'), { align: 'center' });
  add(divider);

  return lines;
}

export function buildReceiptText(data: ReceiptData): string {
  return buildReceiptLines(data).map((l) => l.text).join('\n');
}

// --- ESC/POS byte builder ---
function buildReceiptBytes(lines: ReceiptLine[]): Uint8Array {
  const bytes: number[] = [];
  const push = (...cmds: number[][]) => cmds.forEach((c) => bytes.push(...c));
  const text = (t: string) => {
    // Replace ৳ with Tk — thermal printers use limited ASCII character sets
    const safe = t.replace(/৳/g, 'Tk');
    bytes.push(...Array.from(new TextEncoder().encode(safe)));
  };

  push(CMD.INIT);

  for (const line of lines) {
    if (line.align === 'center') push(CMD.ALIGN_CENTER);
    else if (line.align === 'right') push(CMD.ALIGN_RIGHT);
    else push(CMD.ALIGN_LEFT);

    if (line.bold) push(CMD.BOLD_ON);
    if (line.doubleSize) push(CMD.DOUBLE_SIZE);

    text(line.text);
    bytes.push(0x0a); // newline

    if (line.bold) push(CMD.BOLD_OFF);
    if (line.doubleSize) push(CMD.NORMAL_SIZE);
  }

  // Feed paper and cut
  bytes.push(0x0a, 0x0a, 0x0a);
  push(CMD.CUT);

  return new Uint8Array(bytes);
}

// --- USB printing via Web Serial API ---
export async function printViaUSB(lines: ReceiptLine[]): Promise<void> {
  if (!('serial' in navigator)) {
    throw new Error(
      'Web Serial API is not supported in this browser. Please use Chrome or Edge.'
    );
  }
  const port = await (navigator as unknown as { serial: { requestPort: () => Promise<SerialPort> } }).serial.requestPort();
  await port.open({ baudRate: 9600 });
  const writer = port.writable.getWriter();
  await writer.write(buildReceiptBytes(lines));
  writer.releaseLock();
  await port.close();
}

// --- Bluetooth printing via Web Bluetooth API ---
// Common BT thermal printer UUIDs (works for most 58mm printers including S-5803L)
const BT_SERVICE = '000018f0-0000-1000-8000-00805f9b34fb';
const BT_CHAR = '00002af1-0000-1000-8000-00805f9b34fb';

export async function printViaBluetooth(lines: ReceiptLine[]): Promise<void> {
  if (!('bluetooth' in navigator)) {
    throw new Error(
      'Web Bluetooth API is not supported in this browser. Please use Chrome or Edge.'
    );
  }

  const nav = navigator as unknown as {
    bluetooth: {
      requestDevice: (opts: { filters?: { services: string[] }[]; optionalServices?: string[] } | { acceptAllDevices: boolean; optionalServices: string[] }) => Promise<BluetoothDevice>;
    };
  };

  let device: BluetoothDevice;
  try {
    device = await nav.bluetooth.requestDevice({
      filters: [{ services: [BT_SERVICE] }],
      optionalServices: [BT_SERVICE],
    });
  } catch {
    device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [BT_SERVICE],
    });
  }

  const server = await device.gatt!.connect();
  const service = await server.getPrimaryService(BT_SERVICE);
  const characteristic = await service.getCharacteristic(BT_CHAR);

  const data = buildReceiptBytes(lines);
  const CHUNK = 512;

  for (let i = 0; i < data.length; i += CHUNK) {
    await characteristic.writeValueWithoutResponse(data.slice(i, i + CHUNK));
    await new Promise((r) => setTimeout(r, 50));
  }

  device.gatt!.disconnect();
}

// --- Fallback: window.print() with 58mm CSS ---
export function printViaWindowPrint(
  receiptText: string,
  orderNumber: string
): void {
  const printWindow = window.open('', '_blank', 'width=300,height=600');
  if (!printWindow) {
    throw new Error(
      'Popup blocked. Please allow popups for this site to use the print dialog.'
    );
  }

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 58mm;
      max-width: 58mm;
      overflow-x: hidden;
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      line-height: 1.3;
      padding: 1mm 2mm;
      background: white;
      color: black;
    }
    pre {
      white-space: pre;
      overflow: hidden;
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      line-height: 1.3;
      width: 100%;
      max-width: 100%;
      word-break: normal;
      overflow-wrap: normal;
    }
    @media print {
      @page {
        width: 58mm;
        height: auto;
        margin: 0;
      }
      html, body {
        width: 58mm;
        max-width: 58mm;
      }
    }
  `;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Receipt - ${orderNumber}</title>
      <style>${css}</style>
    </head>
    <body>
      <pre>${receiptText}</pre>
      <script>
        window.onload = function() {
          window.print();
          window.onafterprint = function() { window.close(); };
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

// --- A4 Print Format ---
export function printA4Receipt(order: any, storeName: string, storeAddress: string, storePhone: string): void {
  const formatMoney = (paisa: any): string => {
    const n = typeof paisa === 'string' ? parseFloat(paisa) : Number(paisa ?? 0);
    const taka = isNaN(n) ? 0 : n;
    return '৳' + taka.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const formatDateLocal = (val: any): string => {
    if (!val) return '—';
    const d = new Date(val);
    if (isNaN(d.getTime())) return '—';
    const day   = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year  = d.getFullYear();
    const hrs   = String(d.getHours()).padStart(2, '0');
    const mins  = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hrs}:${mins}`;
  };

  const lines: any[] = order.lines ?? order.items ?? [];

  const itemRows = lines.map((line: any) => {
    const name      = line.product_name ?? line.name ?? '—';
    const code      = line.product_code ?? '';
    const qty       = line.qty ?? line.quantity ?? 0;
    const unitPrice = formatMoney(line.unit_price_paisa ?? line.selling_price_paisa ?? line.price_paisa);
    const lineTotal = formatMoney(line.line_total_paisa ?? line.total_paisa);
    return `
      <tr>
        <td class="item-name">
          ${name}
          ${code ? `<span class="item-code">${code}</span>` : ''}
        </td>
        <td class="item-qty">${qty}</td>
        <td class="item-price">${unitPrice}</td>
        <td class="item-total">${lineTotal}</td>
      </tr>
    `;
  }).join('');

  const total    = formatMoney(order.total_paisa ?? order.amount_total_paisa);
  const received = formatMoney(order.amount_received_paisa ?? order.paid_amount_paisa);
  const due      = order.amount_due_paisa > 0
    ? formatMoney(order.amount_due_paisa)
    : null;

  const customerName = order.customer?.name
    ?? order.customer_name
    ?? order.customerName
    ?? '—';

  const invoiceId  = order.order_number ?? order.orderNumber ?? order._id ?? '—';
  const orderDate  = formatDateLocal(order.createdAt ?? order.date);
  const status     = order.status ?? '—';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Receipt — ${invoiceId}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          font-size: 13px;
          color: #1a1a1a;
          background: #fff;
          padding: 40px 48px;
          max-width: 794px;
          margin: 0 auto;
        }

        /* ── Store Header ── */
        .store-header {
          text-align: center;
          border-bottom: 2px solid #1a1a1a;
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        .store-name {
          font-size: 22px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .store-meta {
          font-size: 11px;
          color: #555;
          margin-top: 4px;
          line-height: 1.6;
        }

        /* ── Receipt Title ── */
        .receipt-title {
          text-align: center;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 20px;
          color: #333;
        }

        /* ── Order Meta Grid ── */
        .order-meta {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 24px;
          font-size: 12px;
          margin-bottom: 24px;
          padding: 14px 16px;
          border: 1px solid #ddd;
          border-radius: 6px;
          background: #fafafa;
        }
        .order-meta-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }
        .meta-label {
          color: #666;
          white-space: nowrap;
        }
        .meta-value {
          font-weight: 600;
          text-align: right;
        }
        .status-badge {
          display: inline-block;
          padding: 1px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
        }
        .status-Paid           { background: #dcfce7; color: #166534; }
        .status-Confirmed      { background: #dbeafe; color: #1e40af; }
        .status-Partially-Paid { background: #fef9c3; color: #854d0e; }
        .status-Cancelled      { background: #fee2e2; color: #991b1b; }
        .status-Returned       { background: #f3e8ff; color: #6b21a8; }

        /* ── Items Table ── */
        .items-section { margin-bottom: 0; }
        .items-section h3 {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #888;
          margin-bottom: 8px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }
        thead tr {
          border-bottom: 2px solid #1a1a1a;
        }
        thead th {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 6px 8px;
          color: #444;
          font-weight: 700;
        }
        thead th:first-child { text-align: left; }
        thead th:not(:first-child) { text-align: right; }

        tbody tr {
          border-bottom: 1px solid #eee;
        }
        tbody tr:last-child { border-bottom: none; }

        td {
          padding: 9px 8px;
          vertical-align: top;
        }
        .item-name {
          font-weight: 500;
          text-align: left;
        }
        .item-code {
          display: block;
          font-size: 10px;
          color: #888;
          font-weight: 400;
          margin-top: 2px;
        }
        .item-qty, .item-price, .item-total {
          text-align: right;
          white-space: nowrap;
        }
        .item-total { font-weight: 600; }

        /* ── Totals Block ── */
        .totals-block {
          margin-top: 0;
          border-top: 2px solid #1a1a1a;
          padding-top: 12px;
        }
        .totals-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 8px;
          font-size: 13px;
        }
        .totals-row.grand-total {
          font-size: 15px;
          font-weight: 700;
          border-top: 1px solid #ddd;
          margin-top: 4px;
          padding-top: 8px;
        }
        .totals-row.due-row {
          color: #dc2626;
          font-weight: 600;
        }
        .totals-row.received-row {
          color: #16a34a;
        }

        /* ── Footer ── */
        .receipt-footer {
          margin-top: 32px;
          text-align: center;
          font-size: 11px;
          color: #888;
          border-top: 1px dashed #ccc;
          padding-top: 16px;
          line-height: 1.8;
        }
        .receipt-footer strong {
          color: #444;
          font-size: 12px;
        }

        /* ── Print rules ── */
        @media print {
          @page {
            size: A4 portrait;
            margin: 20mm 18mm;
          }
          body {
            padding: 0;
            font-size: 12px;
          }
        }
      </style>
    </head>
    <body>

      <div class="store-header">
        <div class="store-name">${storeName}</div>
        <div class="store-meta">${storeAddress}${storePhone ? ' &nbsp;|&nbsp; ' + storePhone : ''}</div>
      </div>

      <div class="receipt-title">Sales Receipt</div>

      <div class="order-meta">
        <div class="order-meta-row">
          <span class="meta-label">Invoice No</span>
          <span class="meta-value">${invoiceId}</span>
        </div>
        <div class="order-meta-row">
          <span class="meta-label">Date &amp; Time</span>
          <span class="meta-value">${orderDate}</span>
        </div>
        <div class="order-meta-row">
          <span class="meta-label">Customer</span>
          <span class="meta-value">${customerName}</span>
        </div>
        <div class="order-meta-row">
          <span class="meta-label">Status</span>
          <span class="meta-value">
            <span class="status-badge status-${status.replace(' ', '-')}">
              ${status}
            </span>
          </span>
        </div>
      </div>

      <div class="items-section">
        <h3>Items</h3>
        <table>
          <thead>
            <tr>
              <th style="width:50%">Product</th>
              <th style="width:10%">Qty</th>
              <th style="width:20%">Unit Price</th>
              <th style="width:20%">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>
      </div>

      <div class="totals-block">
        <div class="totals-row grand-total">
          <span>Total</span>
          <span>${total}</span>
        </div>
        <div class="totals-row received-row">
          <span>Received</span>
          <span>${received}</span>
        </div>
        ${due ? `
        <div class="totals-row due-row">
          <span>Balance Due</span>
          <span>${due}</span>
        </div>` : ''}
      </div>

      <div class="receipt-footer">
        <strong>Thank you for your purchase!</strong><br>
        ${storeName} &nbsp;·&nbsp; ${storeAddress}<br>
        Please retain this receipt for your records.
      </div>

      <script>
        window.onload = function() {
          window.print();
          window.onafterprint = function() { window.close(); };
        };
      <\/script>
    </body>
    </html>
  `;

  const win = window.open('', '_blank', 'width=860,height=1000');
  if (!win) {
    alert('Popup blocked. Please allow popups for this site to print A4 receipts.');
    return;
  }
  win.document.write(html);
  win.document.close();
}
