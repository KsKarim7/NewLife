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
