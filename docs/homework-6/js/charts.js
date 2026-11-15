function escape(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

/** Native SVG; text is escaped, no category can inject markup or attributes. */
export function conditionalChart(table, frequencies, width = 600) {
  if (!Number.isFinite(width) || width < 240 || width > 600) throw new RangeError('Chart width must be 240..600.');
  const left = 10, plot = width - 20, height = 40 + table.rows.length * 64;
  const patterns = table.columns.map((_, j) => `<pattern id="outcome-${j}" width="${5 + j}" height="${5 + j}" patternUnits="userSpaceOnUse" patternTransform="rotate(${j * 29})"><rect width="100%" height="100%" class="pattern-base"/><path d="M0 0V${5 + j}" class="pattern-line"/></pattern>`).join('');
  const ticks = [0, 25, 50, 75, 100].map(p => `<text x="${left + plot * p / 100}" y="24" text-anchor="${p === 100 ? 'end' : p === 0 ? 'start' : 'middle'}">${p}%</text>`).join('');
  const bars = table.rows.map((label, i) => {
    const y = 58 + i * 64;
    const short = [...label.replace(/\s+/g, ' ')].slice(0, 50).join('') + ([...label].length > 50 ? '…' : '');
    let x = left;
    const cells = frequencies.FgivenX[i].map((p, j) => {
      const size = plot * p, start = x; x += size;
      return `<g><title>${escape(label)} / ${escape(table.columns[j])}: ${(100 * p).toPrecision(6)}%</title><rect x="${start}" y="${y}" width="${size}" height="26" fill="url(#outcome-${j})" class="bar-cell"/>${size >= 24 ? `<text class="segment-label" x="${start + size / 2}" y="${y + 18}" text-anchor="middle">${j + 1}</text>` : ''}</g>`;
    }).join('');
    return `<g><text class="row-label" x="${left}" y="${y - 8}"><title>${escape(label)}</title>${escape(short)}</text>${cells}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="conditional-chart-title conditional-chart-desc"><title id="conditional-chart-title">Conditional distribution of F given X</title><desc id="conditional-chart-desc">Each bar sums to 100%. Outcome numbers match the patterned legend; exact proportions and full category names are in the row-percentage table.</desc><defs>${patterns}</defs>${ticks}${bars}</svg>`;
}
