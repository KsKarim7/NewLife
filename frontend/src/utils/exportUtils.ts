/**
 * Export data as CSV file (opens in Excel)
 */
export function exportToCSV(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  const escape = (val: string | number) => {
    const str = String(val ?? '');
    // Wrap in quotes if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvContent = [
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], {
    type: 'text/csv;charset=utf-8;'
  });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export data as PDF using browser print dialog
 * Opens a styled print window with the data as a table
 */
export function exportToPDF(
  filename: string,
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  const tableRows = rows.map(row =>
    `<tr>${row.map(cell => `<td>${cell ?? ''}</td>`).join('')}</tr>`
  ).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${filename}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: Arial, sans-serif;
          font-size: 11px;
          padding: 20px;
          color: #000;
        }
        .header { margin-bottom: 16px; }
        .header h1 { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
        .header p  { font-size: 11px; color: #555; }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 12px;
        }
        th {
          background: #f0f0f0;
          border: 1px solid #ccc;
          padding: 6px 8px;
          text-align: left;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        td {
          border: 1px solid #ddd;
          padding: 5px 8px;
          font-size: 10px;
        }
        tr:nth-child(even) td { background: #fafafa; }
        .footer {
          margin-top: 16px;
          font-size: 10px;
          color: #888;
          text-align: right;
        }
        @media print {
          @page { margin: 15mm; }
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
      <table>
        <thead>
          <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="footer">
        Generated on ${new Date().toLocaleDateString('en-GB')} — New Life, New Market
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

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    alert('Popup blocked. Please allow popups for this site to export PDF.');
    return;
  }
  win.document.write(html);
  win.document.close();
}
