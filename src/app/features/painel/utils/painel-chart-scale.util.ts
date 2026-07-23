/**
 * Escala do eixo Y com passo “redondo” e poucos ticks.
 * Valores altos → passo maior → menos números no eixo (evita poluição visual).
 *
 * @param rawMax maior valor da série
 * @param targetGaps quantos intervalos entre 0 e o máximo (padrão 4 → até 5 labels)
 */
export function niceYAxis(
  rawMax: number,
  targetGaps = 4,
): { max: number; ticks: number[] } {
  const safe = Math.max(0, Number.isFinite(rawMax) ? rawMax : 0);
  const gaps = Math.max(2, Math.min(5, Math.floor(targetGaps)));

  if (safe <= 0) {
    const ticks = Array.from({ length: gaps + 1 }, (_, i) => i);
    return { max: ticks[ticks.length - 1]!, ticks };
  }

  const roughStep = safe / gaps;
  const mag = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const norm = roughStep / mag;

  let step: number;
  if (norm <= 1) step = mag;
  else if (norm <= 2) step = 2 * mag;
  else if (norm <= 2.5) step = 2.5 * mag;
  else if (norm <= 5) step = 5 * mag;
  else step = 10 * mag;

  let max = Math.ceil(safe / step) * step;
  let ticks = buildTicks(0, max, step);

  /** Se ainda passar de 6 labels, dobra o passo. */
  while (ticks.length > 6) {
    step *= 2;
    max = Math.ceil(safe / step) * step;
    ticks = buildTicks(0, max, step);
  }

  return { max, ticks };
}

function buildTicks(start: number, end: number, step: number): number[] {
  const ticks: number[] = [];
  for (let v = start; v <= end + step * 1e-9; v += step) {
    ticks.push(Number(v.toPrecision(12)));
  }
  return ticks;
}
