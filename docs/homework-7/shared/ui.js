export const byId = id => document.getElementById(id);

export function format(value) {
  if (value === null) return 'Undefined';
  if (typeof value !== 'number') return value;
  return value !== 0 && (Math.abs(value) < 0.0001 || Math.abs(value) >= 1e7)
    ? value.toExponential(5) : Number(value.toPrecision(8)).toString();
}

export function numberInput(id) {
  const field = byId(id);
  if (!Number.isFinite(field.valueAsNumber)) {
    field.setAttribute('aria-invalid', 'true');
    throw new RangeError(`${field.labels[0].textContent} requires a finite number.`);
  }
  return field.valueAsNumber;
}

export function tableRows(id, rows) {
  byId(id).replaceChildren(...rows.map(([label, ...values]) => {
    const row = document.createElement('tr');
    const heading = document.createElement('th');
    heading.scope = 'row';
    heading.textContent = format(label);
    row.append(heading);
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = format(value);
      row.append(cell);
    }
    return row;
  }));
}

export function showSVG(id, markup) {
  const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  byId(id).replaceChildren(document.importNode(svg, true));
}
