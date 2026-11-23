'use strict';

const WIDTH = 1200, HEIGHT = 675;
const PALETTE = ['#2563eb', '#d97706', '#059669', '#7c3aed'];
const XML_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function text(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || XML_BAD.test(value)) {
    throw new Error(label + ' must be nonblank valid Unicode of at most ' + max + ' characters');
  }
  return value.trim();
}

function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function clip(value, max) {
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max - 1).join('') + '…';
}

function niceCeil(value) {
  if (!(value > 0)) return 0;
  const exponent = Math.pow(10, Math.floor(Math.log10(value)));
  const fraction = value / exponent;
  const factor = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return factor * exponent;
}

function formatNumber(value) {
  if (Object.is(value, -0) || Math.abs(value) < 1e-12) return '0';
  const abs = Math.abs(value);
  const scaled = abs >= 1e9 ? [1e9, 'B'] : abs >= 1e6 ? [1e6, 'M'] : abs >= 1e3 ? [1e3, 'k'] : [1, ''];
  const number = value / scaled[0];
  const digits = Math.abs(number) >= 100 ? 0 : Math.abs(number) >= 10 ? 1 : 2;
  return number.toFixed(digits).replace(/(\.[0-9]*?)0+$/, '$1').replace(/\.$/, '') + scaled[1];
}

function createSvgBarChart(input, maxBytes) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('chart input must be an object');
  const allowed = new Set(['title', 'yLabel', 'categories', 'series']);
  if (Object.keys(input).some(key => !allowed.has(key))) throw new Error('chart input contains unsupported fields');
  const title = text(input.title, 'title', 160);
  const yLabel = input.yLabel == null ? '' : text(input.yLabel, 'yLabel', 60);
  if (!Array.isArray(input.categories) || input.categories.length < 1 || input.categories.length > 20) throw new Error('categories must contain 1 to 20 labels');
  const categories = input.categories.map((value, index) => text(value, 'category ' + (index + 1), 60));
  if (new Set(categories).size !== categories.length) throw new Error('category labels must be unique');
  if (!Array.isArray(input.series) || input.series.length < 1 || input.series.length > 4) throw new Error('series must contain 1 to 4 rows');
  const series = input.series.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !['name', 'values'].includes(key))) throw new Error('series ' + (index + 1) + ' contains unsupported fields');
    const name = text(row.name, 'series ' + (index + 1) + ' name', 60);
    if (!Array.isArray(row.values) || row.values.length !== categories.length) throw new Error('series ' + (index + 1) + ' values must match category count');
    const values = row.values.map((value, valueIndex) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12) throw new Error('series ' + (index + 1) + ' value ' + (valueIndex + 1) + ' must be finite and within ±1000000000000');
      return Object.is(value, -0) ? 0 : value;
    });
    return { name, values };
  });
  if (new Set(series.map(row => row.name)).size !== series.length) throw new Error('series names must be unique');

  const values = series.flatMap(row => row.values);
  let min = Math.min(0, ...values), max = Math.max(0, ...values);
  min = min < 0 ? -niceCeil(Math.abs(min)) : 0;
  max = max > 0 ? niceCeil(max) : 0;
  if (min === max) max = 1;

  const left = 105, right = 45, top = 105, bottom = 155;
  const plotW = WIDTH - left - right, plotH = HEIGHT - top - bottom;
  const y = value => top + ((max - value) / (max - min)) * plotH;
  const zeroY = y(0), groupW = plotW / categories.length;
  const innerW = groupW * 0.78, gap = Math.min(4, innerW * 0.08);
  const barW = Math.max(1, (innerW - gap * (series.length - 1)) / series.length);
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + WIDTH + '" height="' + HEIGHT + '" viewBox="0 0 ' + WIDTH + ' ' + HEIGHT + '" role="img" aria-labelledby="chart-title chart-desc">',
    '<title id="chart-title">' + escapeXml(title) + '</title>',
    '<desc id="chart-desc">Static grouped bar chart. Zero baseline is always shown. ' + escapeXml(series.map(row => row.name + ': ' + categories.map((category, i) => category + ' ' + row.values[i]).join(', ')).join('; ')) + '</desc>',
    '<rect width="1200" height="675" fill="#ffffff"/>',
    '<text x="600" y="45" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#111827">' + escapeXml(title) + '</text>'
  ];
  if (yLabel) parts.push('<text x="24" y="' + (top + plotH / 2).toFixed(2) + '" transform="rotate(-90 24 ' + (top + plotH / 2).toFixed(2) + ')" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#374151">' + escapeXml(yLabel) + '</text>');
  for (let i = 0; i <= 4; i++) {
    const value = min + (max - min) * i / 4, yy = y(value);
    parts.push('<line x1="' + left + '" y1="' + yy.toFixed(2) + '" x2="' + (WIDTH - right) + '" y2="' + yy.toFixed(2) + '" stroke="#d1d5db" stroke-width="1"/>');
    parts.push('<text x="' + (left - 10) + '" y="' + (yy + 5).toFixed(2) + '" text-anchor="end" font-family="Arial, sans-serif" font-size="13" fill="#374151">' + escapeXml(formatNumber(value)) + '</text>');
  }
  parts.push('<line data-axis="zero" x1="' + left + '" y1="' + zeroY.toFixed(2) + '" x2="' + (WIDTH - right) + '" y2="' + zeroY.toFixed(2) + '" stroke="#111827" stroke-width="2"/>');
  categories.forEach((category, categoryIndex) => {
    const groupX = left + categoryIndex * groupW + (groupW - innerW) / 2;
    series.forEach((row, seriesIndex) => {
      const value = row.values[categoryIndex], valueY = y(value), rectY = Math.min(valueY, zeroY), height = Math.max(0.75, Math.abs(valueY - zeroY));
      const x = groupX + seriesIndex * (barW + gap);
      parts.push('<rect data-mark="bar" x="' + x.toFixed(2) + '" y="' + rectY.toFixed(2) + '" width="' + barW.toFixed(2) + '" height="' + height.toFixed(2) + '" fill="' + PALETTE[seriesIndex] + '"><title>' + escapeXml(category + ' — ' + row.name + ': ' + value) + '</title></rect>');
    });
    const tx = left + categoryIndex * groupW + groupW / 2;
    parts.push('<text x="' + tx.toFixed(2) + '" y="' + (top + plotH + 24) + '" transform="rotate(35 ' + tx.toFixed(2) + ' ' + (top + plotH + 24) + ')" text-anchor="start" font-family="Arial, sans-serif" font-size="12" fill="#111827"><title>' + escapeXml(category) + '</title>' + escapeXml(clip(category, 18)) + '</text>');
  });
  const legendY = HEIGHT - 26;
  const legendWidth = series.length * 190, legendStart = Math.max(left, (WIDTH - legendWidth) / 2);
  series.forEach((row, index) => {
    const x = legendStart + index * 190;
    parts.push('<rect x="' + x + '" y="' + (legendY - 13) + '" width="16" height="16" fill="' + PALETTE[index] + '"/>');
    parts.push('<text x="' + (x + 23) + '" y="' + legendY + '" font-family="Arial, sans-serif" font-size="13" fill="#111827"><title>' + escapeXml(row.name) + '</title>' + escapeXml(clip(row.name, 22)) + '</text>');
  });
  parts.push('</svg>');
  const output = parts.join('\n') + '\n';
  const bytes = Buffer.byteLength(output, 'utf8');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || bytes > maxBytes) throw new Error('SVG chart exceeds the configured write byte limit');
  return Buffer.from(output, 'utf8');
}

module.exports = { createSvgBarChart, _internals: { escapeXml, formatNumber, niceCeil, WIDTH, HEIGHT, PALETTE } };
