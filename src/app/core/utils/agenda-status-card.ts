/** Valores gravados em `atendimentos.agenda_status` e enviados na API. */
export const AGENDA_STATUS_IDS = [
  'confirmado',
  'nao_confirmado',
  'aguardando',
  'cancelado',
] as const;

export type AgendaStatusId = (typeof AGENDA_STATUS_IDS)[number];

export const AGENDA_STATUS_META: readonly {
  id: AgendaStatusId;
  label: string;
  cor: string;
}[] = [
  { id: 'confirmado', label: 'Confirmado', cor: '#32C787' },
  { id: 'nao_confirmado', label: 'Não confirmado', cor: '#2196F3' },
  { id: 'aguardando', label: 'Aguardando', cor: '#FFA500' },
  { id: 'cancelado', label: 'Cancelado', cor: '#FF6B68' },
] as const;

const COR_POR_ID = new Map<AgendaStatusId, string>(
  AGENDA_STATUS_META.map((x) => [x.id, x.cor]),
);

/** Hex da cor do cartão para o estado, ou null se desconhecido. */
export function corHexAgendaPorStatus(
  id: string | null | undefined,
): string | null {
  const k = normalizarAgendaStatusId(id);
  return COR_POR_ID.get(k) ?? null;
}

/** Se a API só tiver `agenda_cor`, recupera o estado conhecido. */
export function inferirAgendaStatusPorCorHex(
  hex: string | null | undefined,
): AgendaStatusId | null {
  const h = String(hex ?? '')
    .trim()
    .toLowerCase();
  if (!h) return null;
  const hit = AGENDA_STATUS_META.find((m) => m.cor.toLowerCase() === h);
  return hit ? hit.id : null;
}

/** Normaliza texto da API/UI para um dos ids conhecidos. */
export function normalizarAgendaStatusId(raw: string | null | undefined): AgendaStatusId {
  const t = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!t) return 'confirmado';
  if (COR_POR_ID.has(t as AgendaStatusId)) return t as AgendaStatusId;
  if (t === 'não_confirmado' || t === 'nao-confirmado') return 'nao_confirmado';
  return 'confirmado';
}
