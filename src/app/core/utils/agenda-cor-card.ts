/** Cores nomeadas do cartão na agenda (campo «Cor» no drawer). */
export type AgendaCorOpcao = {
  id: string;
  label: string;
  /** Hex; vazio = «Padrão» (usa a cor do status). */
  cor: string;
};

export const AGENDA_COR_PADRAO_ID = 'padrao';

export const AGENDA_COR_META_BASE: readonly AgendaCorOpcao[] = [
  { id: AGENDA_COR_PADRAO_ID, label: 'Padrão', cor: '' },
  { id: 'cliente_vip', label: 'Cliente VIP', cor: '#9C27B0' },
  { id: 'check_in', label: 'Check In', cor: '#4CAF50' },
  { id: 'em_atendimento', label: 'Em atendimento', cor: '#E91E63' },
  { id: 'retrabalho', label: 'Retrabalho', cor: '#FF7043' },
] as const;

const LS_KEY = 'espaco-lounge.agenda-cores-custom';

export function carregarCoresAgendaCustom(): AgendaCorOpcao[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => {
        if (!x || typeof x !== 'object') return null;
        const o = x as Record<string, unknown>;
        const id = String(o['id'] ?? '').trim();
        const label = String(o['label'] ?? '').trim();
        const cor = String(o['cor'] ?? '').trim();
        if (!id || !label || !/^#[0-9A-Fa-f]{6}$/.test(cor)) return null;
        return { id, label, cor } satisfies AgendaCorOpcao;
      })
      .filter((x): x is AgendaCorOpcao => x != null);
  } catch {
    return [];
  }
}

export function gravarCoresAgendaCustom(extras: AgendaCorOpcao[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(extras));
  } catch {
    /* ignore quota / private mode */
  }
}

export function listarOpcoesCorAgenda(): AgendaCorOpcao[] {
  const baseIds = new Set(AGENDA_COR_META_BASE.map((o) => o.id));
  const extras = carregarCoresAgendaCustom().filter((o) => !baseIds.has(o.id));
  return [...AGENDA_COR_META_BASE, ...extras];
}

/** Resolve id a partir do hex gravado (ou «padrao» se vazio / desconhecido). */
export function resolverAgendaCorIdPorHex(
  hex: string | null | undefined,
  opcoes: readonly AgendaCorOpcao[] = listarOpcoesCorAgenda(),
): string {
  const h = String(hex ?? '')
    .trim()
    .toLowerCase();
  if (!h) return AGENDA_COR_PADRAO_ID;
  const hit = opcoes.find((o) => o.cor.toLowerCase() === h);
  return hit?.id ?? AGENDA_COR_PADRAO_ID;
}

export function corHexPorAgendaCorId(
  id: string | null | undefined,
  opcoes: readonly AgendaCorOpcao[] = listarOpcoesCorAgenda(),
): string | null {
  const k = String(id ?? '').trim();
  if (!k || k === AGENDA_COR_PADRAO_ID) return null;
  const hit = opcoes.find((o) => o.id === k);
  const cor = hit?.cor?.trim() ?? '';
  return cor || null;
}
