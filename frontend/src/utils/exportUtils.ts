/**
 * Summary item structure for export
 */
export interface ExportSummaryItem {
  label: string;
  value: string | number;
}

/**
 * Export data as CSV file (opens in Excel)
 */
export function exportToCSV(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
  summary?: ExportSummaryItem[]
): void {
  const escape = (val: string | number) => {
    const str = String(val ?? '');
    // Wrap in quotes if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  let csvRows = [
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(','))
  ];

  // Add summary section if provided
  if (summary && summary.length > 0) {
    csvRows.push(''); // Empty line for separation
    csvRows.push('SUMMARY');
    summary.forEach(item => {
      csvRows.push(`${escape(item.label)},${escape(item.value)}`);
    });
  }

  const csvContent = csvRows.join('\n');

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
  rows: (string | number)[][],
  summary?: ExportSummaryItem[]
): void {
  const tableRows = rows.map(row =>
    `<tr>${row.map(cell => `<td>${cell ?? ''}</td>`).join('')}</tr>`
  ).join('');

  const summaryHtml = summary && summary.length > 0 ? `
    <div class="summary-section">
      <h3>Summary</h3>
      <div class="summary-cards">
        ${summary.map(item => `
          <div class="summary-card">
            <div class="summary-label">${item.label}</div>
            <div class="summary-value">${item.value}</div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

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
        .summary-section {
          margin-top: 20px;
          padding-top: 16px;
          border-top: 2px solid #e0e0e0;
        }
        .summary-section h3 {
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 8px;
          color: #333;
        }
        .summary-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 8px;
        }
        .summary-card {
          background: #f5f5f5;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 8px;
          text-align: center;
        }
        .summary-label {
          font-size: 9px;
          color: #666;
          margin-bottom: 4px;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .summary-value {
          font-size: 13px;
          font-weight: bold;
          color: #000;
        }
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
      ${summaryHtml}
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
