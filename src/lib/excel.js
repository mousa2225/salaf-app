import XLSXStyle from 'xlsx-js-style';

export const COLORS = {
  primary: '1F4D3F',
  primaryDark: '163528',
  primaryLight: 'F4F8F5',
  burgundy: '8B2635',
  burgundyLight: 'FBF4F1',
  amber: 'B45309',
  amberLight: 'FEF3C7',
  blue: '1E40AF',
  blueLight: 'DBEAFE',
  cream: 'F7F3E9',
  white: 'FFFEF9',
  altRow: 'FCF8EC',
  ink: '1C1917',
  inkMuted: '78716C',
  border: 'C9BC97',
  borderLight: 'E8DFC8',
};

const allBorder = {
  top: { style: 'thin', color: { rgb: COLORS.border } },
  bottom: { style: 'thin', color: { rgb: COLORS.border } },
  left: { style: 'thin', color: { rgb: COLORS.border } },
  right: { style: 'thin', color: { rgb: COLORS.border } },
};

const rtlRight = { horizontal: 'right', vertical: 'center', readingOrder: 2, wrapText: true };
const rtlCenter = { horizontal: 'center', vertical: 'center', readingOrder: 2, wrapText: true };
const rtlLeft = { horizontal: 'left', vertical: 'center', readingOrder: 2 };

export const STYLES = {
  title: {
    font: { name: 'Tajawal', sz: 18, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.primary } },
    alignment: rtlCenter,
    border: allBorder,
  },
  subtitle: {
    font: { name: 'Tajawal', sz: 11, italic: true, color: { rgb: COLORS.inkMuted } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.cream } },
    alignment: rtlCenter,
    border: allBorder,
  },
  infoLabel: {
    font: { name: 'Tajawal', sz: 11, bold: true, color: { rgb: COLORS.primary } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.primaryLight } },
    alignment: rtlRight,
    border: allBorder,
  },
  infoValue: {
    font: { name: 'Tajawal', sz: 11, color: { rgb: COLORS.ink } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } },
    alignment: rtlRight,
    border: allBorder,
  },
  sectionHeader: {
    font: { name: 'Tajawal', sz: 13, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.primaryDark } },
    alignment: rtlRight,
    border: allBorder,
  },
  th: {
    font: { name: 'Tajawal', sz: 12, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.primary } },
    alignment: rtlCenter,
    border: allBorder,
  },
  td: (alt = false) => ({
    font: { name: 'Tajawal', sz: 11, color: { rgb: COLORS.ink } },
    fill: { patternType: 'solid', fgColor: { rgb: alt ? COLORS.altRow : COLORS.white } },
    alignment: rtlRight,
    border: allBorder,
  }),
  tdMuted: (alt = false) => ({
    font: { name: 'Tajawal', sz: 10, color: { rgb: COLORS.inkMuted } },
    fill: { patternType: 'solid', fgColor: { rgb: alt ? COLORS.altRow : COLORS.white } },
    alignment: rtlRight,
    border: allBorder,
  }),
  tdBold: (alt = false) => ({
    font: { name: 'Tajawal', sz: 11, bold: true, color: { rgb: COLORS.ink } },
    fill: { patternType: 'solid', fgColor: { rgb: alt ? COLORS.altRow : COLORS.white } },
    alignment: rtlRight,
    border: allBorder,
  }),
  tdCenter: (alt = false) => ({
    font: { name: 'Tajawal', sz: 11, color: { rgb: COLORS.ink } },
    fill: { patternType: 'solid', fgColor: { rgb: alt ? COLORS.altRow : COLORS.white } },
    alignment: rtlCenter,
    border: allBorder,
  }),
  num: (alt = false) => ({
    font: { name: 'Tajawal', sz: 11, color: { rgb: COLORS.ink } },
    fill: { patternType: 'solid', fgColor: { rgb: alt ? COLORS.altRow : COLORS.white } },
    alignment: rtlLeft,
    border: allBorder,
    numFmt: '#,##0.00',
  }),
  numInt: (alt = false) => ({
    font: { name: 'Tajawal', sz: 11, color: { rgb: COLORS.ink } },
    fill: { patternType: 'solid', fgColor: { rgb: alt ? COLORS.altRow : COLORS.white } },
    alignment: rtlCenter,
    border: allBorder,
    numFmt: '#,##0',
  }),
  numGreen: (alt = false) => ({
    font: { name: 'Tajawal', sz: 11, bold: true, color: { rgb: COLORS.primary } },
    fill: { patternType: 'solid', fgColor: { rgb: alt ? COLORS.altRow : COLORS.white } },
    alignment: rtlLeft,
    border: allBorder,
    numFmt: '#,##0.00',
  }),
  numRed: (alt = false) => ({
    font: { name: 'Tajawal', sz: 11, bold: true, color: { rgb: COLORS.burgundy } },
    fill: { patternType: 'solid', fgColor: { rgb: alt ? COLORS.altRow : COLORS.white } },
    alignment: rtlLeft,
    border: allBorder,
    numFmt: '#,##0.00',
  }),
  numAmber: (alt = false) => ({
    font: { name: 'Tajawal', sz: 11, bold: true, color: { rgb: COLORS.amber } },
    fill: { patternType: 'solid', fgColor: { rgb: alt ? COLORS.altRow : COLORS.white } },
    alignment: rtlLeft,
    border: allBorder,
    numFmt: '#,##0.00',
  }),
  date: (alt = false) => ({
    font: { name: 'Tajawal', sz: 10, color: { rgb: COLORS.inkMuted } },
    fill: { patternType: 'solid', fgColor: { rgb: alt ? COLORS.altRow : COLORS.white } },
    alignment: rtlCenter,
    border: allBorder,
  }),
  totalLabel: {
    font: { name: 'Tajawal', sz: 13, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.primaryDark } },
    alignment: rtlRight,
    border: allBorder,
  },
  totalNum: {
    font: { name: 'Tajawal', sz: 13, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.primaryDark } },
    alignment: rtlLeft,
    border: allBorder,
    numFmt: '#,##0.00',
  },
  badgeGreen: {
    font: { name: 'Tajawal', sz: 10, bold: true, color: { rgb: COLORS.primary } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.primaryLight } },
    alignment: rtlCenter,
    border: allBorder,
  },
  badgeRed: {
    font: { name: 'Tajawal', sz: 10, bold: true, color: { rgb: COLORS.burgundy } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.burgundyLight } },
    alignment: rtlCenter,
    border: allBorder,
  },
  badgeAmber: {
    font: { name: 'Tajawal', sz: 10, bold: true, color: { rgb: COLORS.amber } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.amberLight } },
    alignment: rtlCenter,
    border: allBorder,
  },
  badgeBlue: {
    font: { name: 'Tajawal', sz: 10, bold: true, color: { rgb: COLORS.blue } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.blueLight } },
    alignment: rtlCenter,
    border: allBorder,
  },
};

export const cell = (value, style, isNumber = false) => ({
  v: value === null || value === undefined ? '' : value,
  t: isNumber ? 'n' : 's',
  s: style,
});

export const buildSheet = (rows, opts = {}) => {
  const ws = {};
  let maxCol = 0;
  rows.forEach((row, rIdx) => {
    row.forEach((c, cIdx) => {
      if (c === null || c === undefined) return;
      const addr = XLSXStyle.utils.encode_cell({ r: rIdx, c: cIdx });
      ws[addr] = c;
      if (cIdx > maxCol) maxCol = cIdx;
    });
  });
  if (rows.length === 0) {
    ws['!ref'] = 'A1';
  } else {
    ws['!ref'] = XLSXStyle.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: rows.length - 1, c: maxCol },
    });
  }
  if (opts.cols) ws['!cols'] = opts.cols;
  if (opts.rows) ws['!rows'] = opts.rows;
  if (opts.merges) ws['!merges'] = opts.merges;
  ws['!views'] = [{ RTL: true }];
  return ws;
};

export const exportWorkbook = (sheets, filename) => {
  const wb = XLSXStyle.utils.book_new();
  sheets.forEach(({ name, ws }) => {
    XLSXStyle.utils.book_append_sheet(wb, ws, name);
  });
  XLSXStyle.writeFile(wb, filename);
};

// Build a styled title block (title + subtitle + info rows + spacer)
export const buildTitleBlock = ({ title, subtitle, info = [], colsCount = 6 }) => {
  const rows = [];

  // Title row (will be merged)
  const titleRow = Array.from({ length: colsCount }, (_, i) =>
    cell(i === 0 ? title : '', STYLES.title)
  );
  rows.push(titleRow);

  // Subtitle
  if (subtitle) {
    const subRow = Array.from({ length: colsCount }, (_, i) =>
      cell(i === 0 ? subtitle : '', STYLES.subtitle)
    );
    rows.push(subRow);
  }

  // Info rows
  info.forEach(([label, value]) => {
    const row = Array.from({ length: colsCount }, () => null);
    row[0] = cell(label, STYLES.infoLabel);
    row[1] = cell(value, STYLES.infoValue);
    for (let i = 2; i < colsCount; i++) {
      row[i] = cell('', STYLES.infoValue);
    }
    rows.push(row);
  });

  // Spacer row
  rows.push(Array.from({ length: colsCount }, () => null));

  return rows;
};

export const titleBlockMerges = ({ colsCount = 6, hasSubtitle = true, numInfoRows = 0 } = {}) => {
  const merges = [];
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: colsCount - 1 } });
  let r = 1;
  if (hasSubtitle) {
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: colsCount - 1 } });
    r = 2;
  }
  for (let i = 0; i < numInfoRows; i++) {
    merges.push({ s: { r, c: 1 }, e: { r, c: colsCount - 1 } });
    r++;
  }
  return merges;
};

export { XLSXStyle };
