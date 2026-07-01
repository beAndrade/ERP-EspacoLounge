import { normalizarHoraHHmm } from './brasilia-time';

/** Extrai `HH:mm` de `inicio` (SQL local, ISO legado ou texto com hora). */
export function horaHHmmDeInicioSql(
  inicio: string | null | undefined,
): string | null {
  const raw = String(inicio ?? '').trim();
  if (!raw) return null;
  const fromNorm = normalizarHoraHHmm(raw);
  if (fromNorm) return fromNorm;
  const hm = /(\d{1,2}):(\d{2})/.exec(raw);
  if (!hm) return null;
  return normalizarHoraHHmm(`${hm[1]}:${hm[2]}`);
}

/** Menor horário entre várias linhas de atendimento. */
export function menorHoraHHmmDeInicios(
  rows: ReadonlyArray<{ inicio?: string | null }>,
): string | null {
  let best: string | null = null;
  let bestMin = Infinity;
  for (const row of rows) {
    const h = horaHHmmDeInicioSql(row.inicio);
    if (!h) continue;
    const [hh, mm] = h.split(':').map((x) => parseInt(x, 10));
    const mins = hh * 60 + mm;
    if (!Number.isFinite(mins)) continue;
    if (mins < bestMin) {
      bestMin = mins;
      best = h;
    }
  }
  return best;
}

/**
 * Hora para templates WhatsApp: prioriza `hora_inicial` do formulário
 * (campo «Horário» no modal) e cai para `inicio` das linhas.
 */
export function resolverHoraWhatsappAgendamento(opts: {
  horaInicial?: string | null;
  linhasInicio?: ReadonlyArray<{ inicio?: string | null }>;
}): string | null {
  const fromForm = normalizarHoraHHmm(opts.horaInicial);
  if (fromForm) return fromForm;
  if (opts.linhasInicio?.length) {
    return menorHoraHHmmDeInicios(opts.linhasInicio);
  }
  return null;
}
