const puppeteer = require('puppeteer');
const ExcelJS = require('exceljs');

exports.generatePDF = async (htmlContent) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0',
    });
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        bottom: '20mm',
        left: '15mm',
        right: '15mm',
      },
    });
    return buffer;
  } finally {
    await browser.close();
  }
};

exports.generateExcel = async (columns, rows, sheetName) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName || 'Sheet1', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width || 15,
  }));

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A5F' },
  };
  headerRow.alignment = { horizontal: 'center' };
  headerRow.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };

  if (Array.isArray(rows) && rows.length > 0) {
    rows.forEach((rowObj) => {
      const row = worksheet.addRow(rowObj);
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};
