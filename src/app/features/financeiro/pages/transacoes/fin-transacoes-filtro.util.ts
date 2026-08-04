import type { FinTransacaoLinhaUi } from './fin-transacoes.mapper';
import type { FinTransacoesTotaisResumo } from './fin-transacoes-totais-modal.component';

export type FinTransacoesFiltroNatureza = 'todos' | 'receita' | 'despesa';
export type FinTransacoesFiltroStatus = 'todos' | 'pago' | 'em_aberto';

export type FinTransacoesVisaoPreset =
  | 'receber-hoje'
  | 'pagar-hoje'
  | 'recebidos'
  | 'a-receber'
  | 'pagos'
  | 'a-pagar';

export type FinTransacoesFiltroTipoData = 'vencimento' | 'competencia' | 'pagamento';

export interface FinTransacoesFiltroState {
  dataInicio: string;
  dataFim: string;
  natureza: FinTransacoesFiltroNatureza;
  status: FinTransacoesFiltroStatus;
  tipoData?: FinTransacoesFiltroTipoData;
  visao?: FinTransacoesVisaoPreset | null;
}

export function ymdHojeFiltro(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function primeiroDiaMesYmdFiltro(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function ultimoDiaMesYmdFiltro(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

export function ymdToDdMmYyyyFiltro(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim().slice(0, 10));
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function ddMmYyyyToYmdFiltro(ddMm: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(ddMm.trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function filtroPadraoTransacoes(): FinTransacoesFiltroState {
  return {
    dataInicio: ymdToDdMmYyyyFiltro(primeiroDiaMesYmdFiltro()),
    dataFim: ymdToDdMmYyyyFiltro(ultimoDiaMesYmdFiltro()),
    natureza: 'todos',
    status: 'todos',
    tipoData: 'vencimento',
    visao: null,
  };
}

export function isTipoDataFiltro(v: string): v is FinTransacoesFiltroTipoData {
  return v === 'vencimento' || v === 'competencia' || v === 'pagamento';
}

/** Presets do Painel que filtram por data de pagamento. */
export function tipoDataParaVisao(
  visao: FinTransacoesVisaoPreset,
): FinTransacoesFiltroTipoData {
  if (visao === 'recebidos' || visao === 'pagos') return 'pagamento';
  return 'vencimento';
}

const VISAO_PRESETS: FinTransacoesVisaoPreset[] = [
  'receber-hoje',
  'pagar-hoje',
  'recebidos',
  'a-receber',
  'pagos',
  'a-pagar',
];

export function isVisaoPreset(v: string): v is FinTransacoesVisaoPreset {
  return (VISAO_PRESETS as string[]).includes(v);
}

export function visaoParaFiltro(
  visao: FinTransacoesVisaoPreset,
  opts?: { dataInicio?: string; dataFim?: string },
): FinTransacoesFiltroState {
  const hoje = ymdToDdMmYyyyFiltro(ymdHojeFiltro());
  const padrao = filtroPadraoTransacoes();
  const de = opts?.dataInicio ?? padrao.dataInicio;
  const ate = opts?.dataFim ?? padrao.dataFim;

  switch (visao) {
    case 'receber-hoje':
      return {
        dataInicio: hoje,
        dataFim: hoje,
        natureza: 'receita',
        status: 'em_aberto',
        visao,
      };
    case 'pagar-hoje':
      return {
        dataInicio: hoje,
        dataFim: hoje,
        natureza: 'despesa',
        status: 'em_aberto',
        visao,
      };
    case 'recebidos':
      return {
        dataInicio: de,
        dataFim: ate,
        natureza: 'receita',
        status: 'pago',
        visao,
      };
    case 'a-receber':
      return {
        dataInicio: de,
        dataFim: ate,
        natureza: 'receita',
        status: 'em_aberto',
        visao,
      };
    case 'pagos':
      return {
        dataInicio: de,
        dataFim: ate,
        natureza: 'despesa',
        status: 'pago',
        visao,
      };
    case 'a-pagar':
      return {
        dataInicio: de,
        dataFim: ate,
        natureza: 'despesa',
        status: 'em_aberto',
        visao,
      };
  }
}

export function filtroParaQueryParams(
  filtro: FinTransacoesFiltroState,
): Record<string, string> {
  const q: Record<string, string> = {};
  if (filtro.visao) {
    q['visao'] = filtro.visao;
  }
  if (filtro.dataInicio) q['de'] = filtro.dataInicio;
  if (filtro.dataFim) q['ate'] = filtro.dataFim;
  if (!filtro.visao) {
    if (filtro.natureza !== 'todos') q['natureza'] = filtro.natureza;
    if (filtro.status !== 'todos') q['status'] = filtro.status;
    if (filtro.tipoData && filtro.tipoData !== 'vencimento') {
      q['tipoData'] = filtro.tipoData;
    }
  } else if (filtro.tipoData && filtro.tipoData !== 'vencimento') {
    q['tipoData'] = filtro.tipoData;
  }
  return q;
}

export function queryParamsParaFiltro(
  params: Record<string, string | undefined>,
): FinTransacoesFiltroState {
  const padrao = filtroPadraoTransacoes();
  const visaoRaw = String(params['visao'] ?? '').trim();
  const de = String(params['de'] ?? '').trim();
  const ate = String(params['ate'] ?? '').trim();

  const tipoDataRaw = String(params['tipoData'] ?? params['tipo_data'] ?? '').trim();

  if (visaoRaw && isVisaoPreset(visaoRaw)) {
    const base = visaoParaFiltro(visaoRaw, {
      dataInicio: de || undefined,
      dataFim: ate || undefined,
    });
    return {
      ...base,
      tipoData: isTipoDataFiltro(tipoDataRaw)
        ? tipoDataRaw
        : tipoDataParaVisao(visaoRaw),
    };
  }

  const naturezaRaw = String(params['natureza'] ?? 'todos').trim();
  const statusRaw = String(params['status'] ?? 'todos').trim();

  return {
    dataInicio: de || padrao.dataInicio,
    dataFim: ate || padrao.dataFim,
    natureza:
      naturezaRaw === 'receita' || naturezaRaw === 'despesa'
        ? naturezaRaw
        : 'todos',
    status:
      statusRaw === 'pago' || statusRaw === 'em_aberto' ? statusRaw : 'todos',
    tipoData: isTipoDataFiltro(tipoDataRaw) ? tipoDataRaw : 'vencimento',
    visao: null,
  };
}

export function linhaPassaFiltroStatus(
  row: FinTransacaoLinhaUi,
  status: FinTransacoesFiltroStatus,
): boolean {
  if (status === 'todos') return true;
  if (status === 'pago') return row.status === 'pago';
  return row.status !== 'pago';
}

export function linhaPassaFiltroNatureza(
  row: FinTransacaoLinhaUi,
  natureza: FinTransacoesFiltroNatureza,
): boolean {
  if (natureza === 'todos') return true;
  if (natureza === 'receita') return row.linhaReceita === true;
  return row.linhaReceita !== true;
}

export function linhaDataReferencia(
  row: FinTransacaoLinhaUi,
  tipo: FinTransacoesFiltroTipoData,
): string {
  if (tipo === 'pagamento') {
    return row.pagoEmYmd ?? '';
  }
  if (tipo === 'competencia') {
    return row.criadoEmYmd || row.dataYmd;
  }
  return row.dataYmd;
}

export function linhaPassaFiltroNaturezaCheckboxes(
  row: FinTransacaoLinhaUi,
  receber: boolean,
  pagar: boolean,
): boolean {
  if (!receber && !pagar) return false;
  const isReceita = row.linhaReceita === true;
  return isReceita ? receber : pagar;
}

export function linhaPassaFiltroStatusCheckboxes(
  row: FinTransacaoLinhaUi,
  opts: { pago: boolean; emAberto: boolean; atrasado: boolean },
): boolean {
  if (!opts.pago && !opts.emAberto && !opts.atrasado) return false;
  if (row.status === 'pago') return opts.pago;
  if (row.status === 'atrasado') return opts.atrasado;
  return opts.emAberto;
}

export function linhaNoPeriodoPorTipoData(
  row: FinTransacaoLinhaUi,
  tipo: FinTransacoesFiltroTipoData,
  inicioYmd: string,
  fimYmd: string,
): boolean {
  const ref = linhaDataReferencia(row, tipo);
  if (!ref) return false;
  return ref >= inicioYmd && ref <= fimYmd;
}

export function calcularTotaisTransacoes(
  linhas: FinTransacaoLinhaUi[],
): FinTransacoesTotaisResumo {
  let recebidos = 0;
  let aReceber = 0;
  let pagos = 0;
  let aPagar = 0;
  for (const row of linhas) {
    const v = row.valorBruto;
    const receita = row.linhaReceita === true;
    const pago = row.status === 'pago';
    if (receita) {
      if (pago) recebidos += v;
      else aReceber += v;
    } else if (pago) {
      pagos += v;
    } else {
      aPagar += v;
    }
  }
  return {
    recebidos,
    aReceber,
    pagos,
    aPagar,
    quantidadeLinhas: linhas.length,
  };
}

/** Valor de um card do Painel / preset a partir das linhas carregadas. */
export function valorCardVisao(
  linhas: FinTransacaoLinhaUi[],
  visao: FinTransacoesVisaoPreset,
): number {
  const hoje = ymdHojeFiltro();
  const filtradas = linhas.filter((row) => {
    const f = visaoParaFiltro(visao, {
      dataInicio: ymdToDdMmYyyyFiltro(hoje),
      dataFim: ymdToDdMmYyyyFiltro(hoje),
    });
    if (visao === 'receber-hoje' || visao === 'pagar-hoje') {
      if (row.dataYmd !== hoje) return false;
    }
    if (!linhaPassaFiltroNatureza(row, f.natureza)) return false;
    if (!linhaPassaFiltroStatus(row, f.status)) return false;
    return true;
  });
  const t = calcularTotaisTransacoes(filtradas);
  switch (visao) {
    case 'receber-hoje':
    case 'a-receber':
      return t.aReceber;
    case 'pagar-hoje':
    case 'a-pagar':
      return t.aPagar;
    case 'recebidos':
      return t.recebidos;
    case 'pagos':
      return t.pagos;
  }
}

/** Valor do card de totais no Painel (período já aplicado na carga). */
export function valorCardVisaoPeriodo(
  linhas: FinTransacaoLinhaUi[],
  visao: FinTransacoesVisaoPreset,
): number {
  const f = visaoParaFiltro(visao);
  const filtradas = linhas.filter(
    (row) =>
      linhaPassaFiltroNatureza(row, f.natureza) &&
      linhaPassaFiltroStatus(row, f.status),
  );
  const t = calcularTotaisTransacoes(filtradas);
  switch (visao) {
    case 'receber-hoje':
    case 'a-receber':
      return t.aReceber;
    case 'pagar-hoje':
    case 'a-pagar':
      return t.aPagar;
    case 'recebidos':
      return t.recebidos;
    case 'pagos':
      return t.pagos;
  }
}

export function queryParamsCardPainel(
  visao: FinTransacoesVisaoPreset,
  periodo?: { dataInicio: string; dataFim: string },
): Record<string, string> {
  const filtro = visaoParaFiltro(visao, periodo);
  return filtroParaQueryParams(filtro);
}

/** Normaliza texto para comparar formas de pagamento (casing / acentos). */
export function chaveFormaPagamentoFiltro(forma: string): string {
  const t = String(forma ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!t || t === '—') return '';
  /** «A receber (cartão) · Cartão de Crédito» → uma só opção no filtro. */
  if (t.startsWith('a receber (cartao)')) return 'a receber (cartao)';
  return t;
}

/** Rótulo canônico no filtro (colapsa sufixos de «A receber (cartão)»). */
export function rotuloFormaPagamentoFiltro(forma: string): string {
  const t = String(forma ?? '').trim();
  if (!t || t === '—') return '';
  const key = chaveFormaPagamentoFiltro(t);
  if (key === 'a receber (cartao)') return 'A receber (cartão)';
  return t;
}

/**
 * Une nomes do cadastro + rótulos das linhas, sem duplicatas
 * (ex.: «Cartão de crédito» vs «Cartão de Crédito»; «A receber (cartão) · …»).
 * Preferência: ordem/nome do cadastro.
 */
export function unificarFormasPagamentoFiltro(
  nomesCadastro: string[],
  formasDasLinhas: Iterable<string>,
): string[] {
  const byKey = new Map<string, string>();
  for (const nome of nomesCadastro) {
    const rotulo = String(nome ?? '').trim();
    const key = chaveFormaPagamentoFiltro(rotulo);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, rotulo);
  }
  for (const raw of formasDasLinhas) {
    const rotulo = rotuloFormaPagamentoFiltro(raw);
    const key = chaveFormaPagamentoFiltro(rotulo);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, rotulo);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** A linha passa se alguma forma marcada partilha a mesma chave normalizada. */
export function formaLinhaPassaFiltro(
  formaLinha: string,
  formasMarcadas: Iterable<string>,
): boolean {
  const keyLinha = chaveFormaPagamentoFiltro(formaLinha);
  if (!keyLinha) return false;
  for (const marcada of formasMarcadas) {
    if (chaveFormaPagamentoFiltro(marcada) === keyLinha) return true;
  }
  return false;
}
