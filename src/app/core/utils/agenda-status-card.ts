/** Valores gravados em `atendimentos.agenda_status` e enviados na API. */
export const AGENDA_STATUS_IDS = [
  'confirmado',
  'nao_confirmado',
  'aguardando',
  'cancelado',
] as const;

export type AgendaStatusId = (typeof AGENDA_STATUS_IDS)[number];

/** Cartão na grelha da agenda quando a comanda está quitada (faturada). */
export const AGENDA_COR_COMANDA_FATURADA = '#607D8B';

/**
 * `cor` — tip / balão (texto e ícone).
 * `corGrelha` — fundo do cartão na agenda.
 */
export const AGENDA_STATUS_META: readonly {
  id: AgendaStatusId;
  label: string;
  cor: string;
  corGrelha: string;
}[] = [
  {
    id: 'confirmado',
    label: 'Confirmado',
    cor: '#86E79E',
    corGrelha: '#32C787',
  },
  {
    id: 'nao_confirmado',
    label: 'Não confirmado',
    cor: '#61C6EB',
    corGrelha: '#00BCD4',
  },
  {
    id: 'aguardando',
    label: 'Aguardando',
    cor: '#FFA500',
    corGrelha: '#FFA500',
  },
  {
    id: 'cancelado',
    label: 'Cancelado',
    cor: '#F98F8C',
    corGrelha: '#FF6B68',
  },
] as const;

const COR_TIP_POR_ID = new Map<AgendaStatusId, string>(
  AGENDA_STATUS_META.map((x) => [x.id, x.cor]),
);

const COR_GRELHA_POR_ID = new Map<AgendaStatusId, string>(
  AGENDA_STATUS_META.map((x) => [x.id, x.corGrelha]),
);

/** Hex do fundo do cartão na grelha para o estado, ou null se desconhecido. */
export function corHexAgendaPorStatus(
  id: string | null | undefined,
): string | null {
  const k = normalizarAgendaStatusId(id);
  return COR_GRELHA_POR_ID.get(k) ?? null;
}

/** Hex do tip/balão (texto e ícone) para o estado. */
export function corTipAgendaPorStatus(
  id: string | null | undefined,
): string | null {
  const k = normalizarAgendaStatusId(id);
  return COR_TIP_POR_ID.get(k) ?? null;
}

/** Se a API só tiver `agenda_cor`, recupera o estado conhecido. */
export function inferirAgendaStatusPorCorHex(
  hex: string | null | undefined,
): AgendaStatusId | null {
  const h = String(hex ?? '')
    .trim()
    .toLowerCase();
  if (!h) return null;
  const hit = AGENDA_STATUS_META.find(
    (m) =>
      m.cor.toLowerCase() === h || m.corGrelha.toLowerCase() === h,
  );
  return hit ? hit.id : null;
}

/** Normaliza texto da API/UI para um dos ids conhecidos. */
export function normalizarAgendaStatusId(raw: string | null | undefined): AgendaStatusId {
  const t = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!t) return 'confirmado';
  if (COR_TIP_POR_ID.has(t as AgendaStatusId)) return t as AgendaStatusId;
  if (t === 'não_confirmado' || t === 'nao-confirmado') return 'nao_confirmado';
  return 'confirmado';
}
