'use strict';

const NUMERIC = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function finiteNumeric(value) {
  const text = String(value).trim();
  if (!text || !NUMERIC.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function lexicalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireShape(operation, expected) {
  const keys = Object.keys(operation).sort();
  if (keys.join('\0') !== expected.slice().sort().join('\0')) throw new Error('operation fields do not match the declared schema');
}

function runTableOperation(headers, rows, operation, coverage) {
  if (!Array.isArray(headers) || headers.length < 1 || headers.length > 256 ||
      !Array.isArray(rows) || rows.length > 1000) {
    throw new Error('table input must contain 1-256 headers and at most 1000 rows');
  }
  if (headers.some(header => typeof header !== 'string') || new Set(headers).size !== headers.length) {
    throw new Error('headers must be unique strings');
  }
  for (let i = 0; i < rows.length; i++) {
    if (!Array.isArray(rows[i]) || rows[i].length !== headers.length || rows[i].some(cell => typeof cell !== 'string')) {
      throw new Error('row ' + (i + 1) + ' must match the header width and contain strings');
    }
  }
  if (!operation || !['filter', 'sort', 'group'].includes(operation.type)) {
    throw new Error('operation type must be filter, sort, or group');
  }
  const columnIndex = name => {
    if (typeof name !== 'string' || !headers.includes(name)) throw new Error('unknown or ambiguous column: ' + String(name));
    return headers.indexOf(name);
  };
  const indexedRows = rows.map((row, index) => ({ row: row.slice(), index }));

  if (operation.type === 'filter') {
    requireShape(operation, ['type', 'column', 'operator', 'value']);
    const index = columnIndex(operation.column);
    const allowed = ['eq', 'neq', 'contains', 'gt', 'gte', 'lt', 'lte'];
    if (!allowed.includes(operation.operator) || typeof operation.value !== 'string') {
      throw new Error('filter requires a supported operator and string value');
    }
    const threshold = ['gt', 'gte', 'lt', 'lte'].includes(operation.operator)
      ? finiteNumeric(operation.value) : null;
    if (['gt', 'gte', 'lt', 'lte'].includes(operation.operator) && threshold === null) {
      throw new Error('numeric filter value must be finite');
    }
    const filtered = indexedRows.filter(({ row }) => {
      const value = row[index].trim();
      switch (operation.operator) {
        case 'eq': return value === operation.value;
        case 'neq': return value !== operation.value;
        case 'contains': return value.includes(operation.value);
        case 'gt': case 'gte': case 'lt': case 'lte': {
          const number = finiteNumeric(value);
          if (number === null) return false;
          if (operation.operator === 'gt') return number > threshold;
          if (operation.operator === 'gte') return number >= threshold;
          if (operation.operator === 'lt') return number < threshold;
          return number <= threshold;
        }
      }
      return false;
    });
    return { headers: headers.slice(), rows: filtered.map(item => item.row), sourceRows: rows.length };
  }

  if (operation.type === 'sort') {
    requireShape(operation, ['type', 'column', 'mode', 'direction']);
    const index = columnIndex(operation.column);
    if (!['asc', 'desc'].includes(operation.direction) || !['text', 'numeric'].includes(operation.mode)) {
      throw new Error('sort requires direction asc/desc and mode text/numeric');
    }
    if (operation.mode === 'numeric' && rows.some(row => row[index].trim() !== '' && finiteNumeric(row[index]) === null)) {
      throw new Error('numeric sort column contains a nonnumeric or nonfinite value');
    }
    const sign = operation.direction === 'asc' ? 1 : -1;
    indexedRows.sort((a, b) => {
      const left = a.row[index].trim(), right = b.row[index].trim();
      const leftMissing = left === '', rightMissing = right === '';
      if (leftMissing || rightMissing) return leftMissing === rightMissing ? a.index - b.index : leftMissing ? 1 : -1;
      const comparison = operation.mode === 'numeric'
        ? Math.sign(finiteNumeric(left) - finiteNumeric(right))
        : lexicalCompare(left, right);
      return comparison === 0 ? a.index - b.index : comparison * sign;
    });
    return { headers: headers.slice(), rows: indexedRows.map(item => item.row), sourceRows: rows.length };
  }

  if (!coverage || coverage.complete !== true || coverage.totalRows !== rows.length) {
    throw new Error('grouping requires complete source coverage');
  }
  if (operation.aggregate === 'count') requireShape(operation, ['type', 'by', 'aggregate']);
  else requireShape(operation, ['type', 'by', 'aggregate', 'column']);
  const groupIndex = columnIndex(operation.by);
  const valueIndex = operation.column == null ? null : columnIndex(operation.column);
  const aggregate = operation.aggregate;
  if (!['count', 'sum', 'mean', 'min', 'max'].includes(aggregate) || (aggregate !== 'count' && valueIndex === null)) {
    throw new Error('group requires count or a numeric aggregate with column');
  }
  const groups = new Map();
  for (const { row } of indexedRows) {
    const key = row[groupIndex];
    const group = groups.get(key) || { count: 0, values: [] };
    group.count++;
    if (valueIndex !== null && row[valueIndex].trim() !== '') {
      const value = finiteNumeric(row[valueIndex]);
      if (value === null) throw new Error('group aggregate column contains a nonnumeric or nonfinite value');
      group.values.push(value);
    }
    groups.set(key, group);
  }
  const resultRows = Array.from(groups, ([key, group]) => {
    let value;
    if (aggregate === 'count') value = group.count;
    else if (!group.values.length) value = '';
    else if (aggregate === 'sum' || aggregate === 'mean') {
      const sum = group.values.reduce((total, item) => total + item, 0);
      value = aggregate === 'sum' ? sum : sum / group.values.length;
    } else if (aggregate === 'min') value = Math.min(...group.values);
    else value = Math.max(...group.values);
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('group result exceeds finite numeric range');
    return [key, String(value)];
  }).sort((a, b) => lexicalCompare(a[0], b[0]));
  const groupHeader = headers[groupIndex];
  const aggregateBase = aggregate + (valueIndex === null ? '' : '_' + headers[valueIndex]);
  const aggregateHeader = aggregateBase === groupHeader ? aggregateBase + ' [2]' : aggregateBase;
  const outputHeaders = [groupHeader, aggregateHeader];
  return { headers: outputHeaders, rows: resultRows, sourceRows: rows.length };
}

function runTablePipeline(headers, rows, operations) {
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > 8) {
    throw new Error('operations must contain 1 to 8 steps');
  }
  const originalRows = rows.length;
  let currentHeaders = headers.slice(), currentRows = rows.map(row => row.slice()), filtered = false;
  const steps = [];
  for (const operation of operations) {
    const inputRows = currentRows.length;
    const result = runTableOperation(currentHeaders, currentRows, operation, { complete: true, totalRows: inputRows });
    if (operation.type === 'filter' && result.rows.length < inputRows) filtered = true;
    steps.push({ type: operation.type, inputRows, outputRows: result.rows.length });
    currentHeaders = result.headers;
    currentRows = result.rows;
  }
  return {
    headers: currentHeaders, rows: currentRows, sourceRows: originalRows,
    resultRows: currentRows.length, filtered,
    resultScope: filtered ? 'filtered_source_subset' : 'whole_source', steps
  };
}

module.exports = { runTableOperation, runTablePipeline, finiteNumeric, lexicalCompare };
