/**
 * Mini gráfico em degraus (cara de pixel, combina com o visual quadrado).
 * `max` fixa a escala: 20 para TPS, 100 para porcentagem.
 */
export function Sparkline({ values, max, tone = 'accent' }: { values: (number | null)[]; max?: number; tone?: 'accent' | 'success' | 'warning' | 'danger' }) {
  const width = 120;
  const height = 36;
  const points = values.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v !== null);

  if (points.length < 2) {
    return <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden />;
  }

  const top = Math.max(max ?? 0, ...points.map((p) => p.v), 1);
  const slots = Math.max(values.length - 1, 1);
  const x = (i: number) => (i / slots) * width;
  const y = (v: number) => height - 2 - (v / top) * (height - 4);

  let line = `M${x(points[0]!.i).toFixed(1)},${y(points[0]!.v).toFixed(1)}`;
  for (const p of points.slice(1)) line += ` H${x(p.i).toFixed(1)} V${y(p.v).toFixed(1)}`;
  const area = `${line} V${height} H${x(points[0]!.i).toFixed(1)} Z`;

  return (
    <svg className={`sparkline sparkline-${tone}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <path className="sparkline-area" d={area} />
      <path className="sparkline-line" d={line} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
