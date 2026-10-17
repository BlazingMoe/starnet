/* Bounded, strict CSV record parser/profiler. No evaluation and no row retention. */
'use strict';
const MAX_COLUMNS = 256;
const MAX_CELL_CHARS = 65536;
const NUMERIC = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function createCsvProfiler(options) {
  options = options || {};
  const delimiter = options.delimiter == null ? ',' : String(options.delimiter);
  if (![',', ';', '\t', '|'].includes(delimiter)) throw new Error('delimiter must be comma, semicolon, tab, or pipe');
  const hasHeader = options.hasHeader !== false;
  const maxRows = Number(options.maxRows) || 100000;
  const maxRowChars = Number.isFinite(Number(options.maxRowChars)) && Number(options.maxRowChars) > 0 ? Number(options.maxRowChars) : Infinity;
  const onRow = typeof options.onRow === 'function' ? options.onRow : null;
  const redact = typeof options.redact === 'function' ? options.redact : (s => s);
  let state = 'start', cell = '', row = [], swallowLF = false, firstChar = true;
  let stopped = false, stopReason = null, header = null, width = null, dataRows = 0, rowWidthMismatches = 0;
  let columns = [], parseError = null, rowChars = 0;
  function ensureColumns(n) {
    while (columns.length < n) columns.push({ missing: dataRows, number: 0, boolean: 0, string: 0, numericCount: 0, min: null, max: null, mean: null, formulaLike: 0 });
  }
  function append(ch) {
    rowChars += ch.length;
    if (rowChars > maxRowChars) { stopped = true; stopReason = 'row_size_limit'; cell = ''; row = []; return; }
    cell += ch;
    if (cell.length > MAX_CELL_CHARS) { stopped = true; stopReason = 'cell_limit'; cell = ''; row = []; }
  }
  function finishCell() {
    row.push(cell); cell = ''; state = 'start';
    if (row.length > MAX_COLUMNS) { stopped = true; stopReason = 'column_limit'; row = []; }
  }
  function finishRow() {
    finishCell();
    if (stopped) return;
    const current = row; row = []; rowChars = 0;
    if (hasHeader && header === null) {
      header = current;
      width = current.length;
      ensureColumns(width);
      return;
    }
    if (width === null) width = current.length;
    if (current.length !== width) rowWidthMismatches++;
    ensureColumns(Math.max(width, current.length));
    dataRows++;
    for (let i = 0; i < columns.length; i++) {
      const c = columns[i];
      if (i >= current.length || String(current[i]).trim() === '') { c.missing++; continue; }
      const value = String(current[i]).trim();
      if (/^(?:true|false)$/i.test(value)) c.boolean++;
      else if (NUMERIC.test(value)) {
        const n = Number(value);
        if (Number.isFinite(n)) {
          c.number++; c.numericCount++;
          if (c.min === null || n < c.min) c.min = n;
          if (c.max === null || n > c.max) c.max = n;
          c.mean = c.numericCount === 1 ? n : c.mean * ((c.numericCount - 1) / c.numericCount) + n / c.numericCount;
        } else c.string++;
      } else c.string++;
      if (value[0] === '=') c.formulaLike++;
    }
    if (onRow && onRow(current, dataRows) === false) { stopped = true; stopReason = 'output_limit'; return; }
    if (dataRows >= maxRows) { stopped = true; stopReason = 'row_limit'; }
  }
  function push(text) {
    if (stopped || parseError) return;
    text = String(text == null ? '' : text);
    if (firstChar) { firstChar = false; if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); }
    for (let i = 0; i < text.length && !stopped && !parseError; i++) {
      const ch = text[i];
      if (swallowLF) { swallowLF = false; if (ch === '\n') continue; }
      if (state === 'quoted') {
        if (ch === '"') state = 'afterQuote'; else append(ch);
      } else if (state === 'afterQuote') {
        if (ch === '"') { append('"'); state = 'quoted'; }
        else if (ch === delimiter) finishCell();
        else if (ch === '\r' || ch === '\n') { finishRow(); if (ch === '\r') swallowLF = true; }
        else { parseError = 'quote_placement'; }
      } else if (state === 'start') {
        if (ch === '"') state = 'quoted';
        else if (ch === delimiter) finishCell();
        else if (ch === '\r' || ch === '\n') { finishRow(); if (ch === '\r') swallowLF = true; }
        else { state = 'unquoted'; append(ch); }
      } else {
        if (ch === '"') parseError = 'quote_placement';
        else if (ch === delimiter) finishCell();
        else if (ch === '\r' || ch === '\n') { finishRow(); if (ch === '\r') swallowLF = true; }
        else append(ch);
      }
    }
  }
  function finish(partial) {
    partial = !!partial;
    if (!partial && !stopped && !parseError) {
      if (state === 'quoted') parseError = 'unclosed_quote';
      else if (state === 'afterQuote' || state === 'unquoted' || state === 'start' && row.length) finishRow();
      else if (cell.length || row.length) finishRow();
    }
    if (parseError) throw new Error('malformed CSV input (' + parseError + ')');
    const headerValues = header || [];
    const names = [], seen = new Map();
    for (let i = 0; i < columns.length; i++) {
      const raw = hasHeader ? String(headerValues[i] == null ? '' : headerValues[i]).trim() : '';
      const base = raw || ('column_' + (i + 1));
      const count = (seen.get(base) || 0) + 1; seen.set(base, count);
      const display = count === 1 ? base : base + ' [' + count + ']';
      names.push(String(redact(display)).slice(0, 160));
    }
    return {
      status: stopped || partial ? 'partial' : 'complete', partial: stopped || partial,
      partialReason: stopReason || (partial ? 'byte_limit' : null), assumptions: { delimiter, hasHeader },
      numericSemantics: 'Finite IEEE-754 binary64 values; decimal summaries are approximate and integers outside the safe range may be rounded.',
      rows: { data: dataRows, rowWidthMismatches }, columns: columns.map((c, i) => ({
        index: i + 1, name: names[i] || ('column_' + (i + 1)), nonMissing: dataRows - c.missing, missing: c.missing,
        types: { number: c.number, boolean: c.boolean, string: c.string }, formulaLike: c.formulaLike,
        numeric: c.numericCount ? { count: c.numericCount, min: c.min, max: c.max, mean: Number.isFinite(c.mean) ? c.mean : null } : null
      })),
      header: hasHeader && header ? names : null
    };
  }
  return { push, finish, get stopped() { return stopped; }, get malformed() { return !!parseError; }, get stopReason() { return stopReason; } };
}

module.exports = { createCsvProfiler, MAX_COLUMNS, MAX_CELL_CHARS };
