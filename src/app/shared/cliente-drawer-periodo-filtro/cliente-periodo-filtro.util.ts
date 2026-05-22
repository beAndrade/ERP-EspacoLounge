import { dataDdMmBarraAaaa, toYmd } from '../../core/utils/atendimento-display';

export type PeriodoFiltroCampoAtivo = 'inicio' | 'fim';

export type PeriodoPresetId =
  | 'hoje'
  | 'semana_passada'
  | 'essa_semana'
  | 'proxima_semana'
  | 'mes_passado'
  | 'esse_mes'
  | 'proximo_mes';

export type PeriodoPreset = {
  id: PeriodoPresetId;
  label: string;
};

export const PERIODO_PRESETS: PeriodoPreset[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'semana_passada', label: 'Semana passada' },
  { id: 'essa_semana', label: 'Essa semana' },
  { id: 'proxima_semana', label: 'Próxima semana' },
  { id: 'mes_passado', label: 'Mês passado' },
  { id: 'esse_mes', label: 'Esse mês' },
  { id: 'proximo_mes', label: 'Próximo mês' },
];

export const PERIODO_DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const;

export type CelulaCalendarioPeriodo = {
  dia: number | null;
  ymd: string | null;
  foraMes: boolean;
};

export function ymdExibicaoDdMmAaaa(ymd: string): string {
  return dataDdMmBarraAaaa(String(ymd ?? '').trim().slice(0, 10));
}

export function compararYmd(a: string, b: string): number {
  return String(a ?? '').slice(0, 10).localeCompare(String(b ?? '').slice(0, 10));
}

export function inicioDoMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function ymdValido(ymd: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(ymd ?? '').trim().slice(0, 10));
}

/** Domingo da semana da grelha (Dom–Sáb) que contém `ref`. */
export function domingoInicioSemana(ref: Date): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/** Sábado da semana que começa no domingo `domingo`. */
export function sabadoFimSemana(domingo: Date): Date {
  const d = new Date(domingo.getFullYear(), domingo.getMonth(), domingo.getDate());
  d.setDate(d.getDate() + 6);
  return d;
}

export function periodoPreset(id: PeriodoPresetId): {
  inicioYmd: string;
  fimYmd: string;
} {
  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = hoje.getMonth();

  switch (id) {
    case 'hoje': {
      const t = toYmd(hoje);
      return { inicioYmd: t, fimYmd: t };
    }
    case 'semana_passada': {
      const dom = domingoInicioSemana(hoje);
      dom.setDate(dom.getDate() - 7);
      const sab = sabadoFimSemana(dom);
      return { inicioYmd: toYmd(dom), fimYmd: toYmd(sab) };
    }
    case 'essa_semana': {
      const dom = domingoInicioSemana(hoje);
      const sab = sabadoFimSemana(dom);
      return { inicioYmd: toYmd(dom), fimYmd: toYmd(sab) };
    }
    case 'proxima_semana': {
      const dom = domingoInicioSemana(hoje);
      dom.setDate(dom.getDate() + 7);
      const sab = sabadoFimSemana(dom);
      return { inicioYmd: toYmd(dom), fimYmd: toYmd(sab) };
    }
    case 'mes_passado': {
      const ini = new Date(y, m - 1, 1);
      const fim = new Date(y, m, 0);
      return { inicioYmd: toYmd(ini), fimYmd: toYmd(fim) };
    }
    case 'esse_mes': {
      const ini = new Date(y, m, 1);
      const fim = new Date(y, m + 1, 0);
      return { inicioYmd: toYmd(ini), fimYmd: toYmd(fim) };
    }
    case 'proximo_mes': {
      const ini = new Date(y, m + 1, 1);
      const fim = new Date(y, m + 2, 0);
      return { inicioYmd: toYmd(ini), fimYmd: toYmd(fim) };
    }
  }
}

export function tituloMesCalendario(ref: Date): string {
  const y = ref.getFullYear();
  const nome = ref.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  const cap = nome.charAt(0).toUpperCase() + nome.slice(1);
  return `${y} ${cap}`;
}

export function celulasMesCalendario(mesRef: Date): CelulaCalendarioPeriodo[] {
  const y = mesRef.getFullYear();
  const m = mesRef.getMonth();
  const primeiroDow = new Date(y, m, 1).getDay();
  const diasNoMes = new Date(y, m + 1, 0).getDate();
  const out: CelulaCalendarioPeriodo[] = [];

  const ultimoMesAnterior = new Date(y, m, 0).getDate();
  for (let i = primeiroDow - 1; i >= 0; i--) {
    const dia = ultimoMesAnterior - i;
    const pmRaw = m - 1;
    const py = pmRaw < 0 ? y - 1 : y;
    const pm = (pmRaw + 12) % 12;
    const ymd = `${py}-${String(pm + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    out.push({ dia, ymd, foraMes: true });
  }

  for (let d = 1; d <= diasNoMes; d++) {
    const ymd = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    out.push({ dia: d, ymd, foraMes: false });
  }

  let prox = 1;
  while (out.length % 7 !== 0) {
    const nm = (m + 1) % 12;
    const ny = m === 11 ? y + 1 : y;
    const ymd = `${ny}-${String(nm + 1).padStart(2, '0')}-${String(prox).padStart(2, '0')}`;
    out.push({ dia: prox, ymd, foraMes: true });
    prox += 1;
  }

  return out;
}

/** Desloca um YMD por `delta` dias (negativo = anterior). */
export function ymdAddDays(ymd: string, delta: number): string {
  const s = String(ymd ?? '').trim().slice(0, 10);
  if (!ymdValido(s)) return s;
  const [y, mo, d] = s.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() + delta);
  return toYmd(dt);
}

/** Cantos arredondados só no início/fim de cada linha da grelha (Dom–Sáb). */
export function periodoSegmentoLinha(
  ymd: string,
  inicioYmd: string,
  fimYmd: string,
): { segInicio: boolean; segFim: boolean } {
  const dia = String(ymd ?? '').trim().slice(0, 10);
  const ini = String(inicioYmd ?? '').trim().slice(0, 10);
  const fim = String(fimYmd ?? '').trim().slice(0, 10);
  if (!ymdValido(dia) || !ymdValido(ini) || !ymdValido(fim)) {
    return { segInicio: false, segFim: false };
  }
  if (compararYmd(dia, ini) < 0 || compararYmd(dia, fim) > 0) {
    return { segInicio: false, segFim: false };
  }
  const [y, mo, d] = dia.split('-').map((x) => parseInt(x, 10));
  const dow = new Date(y, mo - 1, d).getDay();
  const prev = ymdAddDays(dia, -1);
  const next = ymdAddDays(dia, 1);
  const foraDoIntervalo = (outro: string) =>
    !ymdValido(outro) || compararYmd(outro, ini) < 0 || compararYmd(outro, fim) > 0;
  return {
    segInicio: dow === 0 || foraDoIntervalo(prev),
    segFim: dow === 6 || foraDoIntervalo(next),
  };
}

export function normalizarIntervaloYmd(
  inicioYmd: string,
  fimYmd: string,
): { inicioYmd: string; fimYmd: string } {
  const ini = String(inicioYmd ?? '').trim().slice(0, 10);
  const fim = String(fimYmd ?? '').trim().slice(0, 10);
  if (!ymdValido(ini) || !ymdValido(fim)) {
    return { inicioYmd: ini, fimYmd: fim };
  }
  if (compararYmd(fim, ini) < 0) {
    return { inicioYmd: fim, fimYmd: ini };
  }
  return { inicioYmd: ini, fimYmd: fim };
}
