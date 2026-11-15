export const LIMITS = Object.freeze({ characters: 1_000_000, records: 10_000, categories: 20, label: 100 });

export const PRESETS = Object.freeze({
  cybersecurity: 'X,F,Count\nBasic,Success,30\nBasic,Failure,10\nIntermediate,Success,20\nIntermediate,Failure,20\nAdvanced,Success,10\nAdvanced,Failure,30',
  independent: 'X,F,Count\nA,Yes,20\nA,No,20\nB,Yes,20\nB,No,20\nC,Yes,20\nC,No,20',
  sparse: 'X,F,Count\nA,Yes,1\nA,No,0\nB,Yes,0\nB,No,1'
});

/** Strict CSV state machine: quoted commas/newlines and doubled quotes, without evaluation. */
export function parseCategoricalCSV(text) {
  if (typeof text !== 'string' || text.length > LIMITS.characters) throw new RangeError('CSV must contain at most 1,000,000 characters.');
  const source = text.replace(/^\uFEFF/, '');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(source)) throw new RangeError('CSV contains an unsupported control character.');
  const rows = [];
  let row = [], field = '', state = 'start', touched = false;
  function endField() { row.push(field); field = ''; state = 'start'; }
  function endRow() {
    endField();
    // Only empty physical lines are ignored; a quoted empty field is a malformed record.
    if (touched || row.length > 1) rows.push(row);
    if (rows.length > LIMITS.records + 1) throw new RangeError('CSV supports at most 10,000 data records.');
    row = []; touched = false;
  }
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (state === 'quoted') {
      if (ch === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') state = 'closed';
      else field += ch;
      continue;
    }
    if (ch === ',') { endField(); touched = true; }
    else if (ch === '\r' || ch === '\n') {
      endRow();
      if (ch === '\r' && source[i + 1] === '\n') i++;
    } else if (ch === '"' && state === 'start') { state = 'quoted'; touched = true; }
    else {
      if (ch === '"' || state === 'closed') throw new RangeError(`Malformed quoting in CSV record ${rows.length + 1}.`);
      field += ch; state = 'plain'; touched = true;
    }
    if (row.length > 3) throw new RangeError('CSV records must have two or three fields.');
  }
  if (state === 'quoted') throw new RangeError('CSV has an unclosed quoted field.');
  if (touched || field || row.length) endRow();
  const header = rows.shift()?.map(value => value.trim().toLowerCase());
  if (!header || !(['x,f', 'x,f,count'].includes(header.join(',')))) throw new RangeError('CSV header must be X,F or X,F,Count.');
  if (!rows.length) throw new RangeError('CSV needs at least one data record.');
  return rows.map((values, index) => {
    if (values.length !== header.length) throw new RangeError(`Data record ${index + 1} has ${values.length} fields; expected ${header.length}.`);
    let count = 1;
    if (header.length === 3) {
      const token = values[2].trim();
      if (!/^\d+$/.test(token) || !Number.isSafeInteger(Number(token))) throw new RangeError(`Data record ${index + 1}: Count must be a nonnegative safe integer.`);
      count = Number(token);
    }
    return { X: values[0], F: values[1], count };
  });
}

function label(value) {
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
  if (typeof value !== 'string' || !value.trim() || value.length > LIMITS.label || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new RangeError('Category labels must be nonempty text of at most 100 characters (finite numbers are also accepted).');
  }
  return value;
}

// #region contingency-table
/** Raw {X,F} or weighted {X,F,count} records; Maps preserve first-appearance order. */
export function buildContingencyTable(records) {
  if (!Array.isArray(records) || !records.length || records.length > LIMITS.records) throw new RangeError('Provide 1..10,000 paired or weighted records.');
  const rows = new Map(), columns = new Map(), entries = [];
  let N = 0;
  for (const record of records) {
    if (!record || typeof record !== 'object') throw new RangeError('Each record must contain X and F.');
    const X = label(record.X), F = label(record.F);
    const count = Object.hasOwn(record, 'count') ? record.count : 1;
    if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(N + count)) throw new RangeError('Counts and their grand total must be nonnegative safe integers.');
    N += count;
    if (!rows.has(X)) rows.set(X, rows.size);
    if (!columns.has(F)) columns.set(F, columns.size);
    if (rows.size > LIMITS.categories || columns.size > LIMITS.categories) throw new RangeError('At most 20 categories per variable are supported.');
    entries.push([rows.get(X), columns.get(F), count]);
  }
  if (!N || rows.size < 2 || columns.size < 2) throw new RangeError('A positive total and at least two categories in each variable are required.');
  const observed = Array.from({ length: rows.size }, () => Array(columns.size).fill(0));
  const rowTotals = Array(rows.size).fill(0), columnTotals = Array(columns.size).fill(0);
  for (const [i, j, count] of entries) {
    observed[i][j] += count; rowTotals[i] += count; columnTotals[j] += count;
  }
  if (rowTotals.includes(0) || columnTotals.includes(0)) throw new RangeError('A category has a zero marginal total. Revise the input explicitly; no categories were removed.');
  return { rows: [...rows.keys()], columns: [...columns.keys()], observed, rowTotals, columnTotals, N };
}
// #endregion contingency-table
