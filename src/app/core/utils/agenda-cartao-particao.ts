import type { AtendimentoListaItem } from '../models/api.models';
import { minutosMeiaNoiteEmBrasilia } from './brasilia-time';
import { diffMinutesEntreHorarios } from './sql-local-datetime';
import { normalizarAgendaStatusId } from './agenda-status-card';
import { ordenarLinhasAtendimentoInPlace } from './atendimento-display';

export type AgendaCartaoParticao = {
  trackKey: string;
  linhas: AtendimentoListaItem[];
};

const SLOT_PADRAO_MIN = 30;

function extentLinhaMinutos(
  l: AtendimentoListaItem,
  diaYmd: string,
): { start: number; end: number } | null {
  const dia = diaYmd.trim().slice(0, 10);
  const mi = minutosMeiaNoiteEmBrasilia(l.inicio, dia);
  if (mi == null || !Number.isFinite(mi)) return null;

  const iniS = l.inicio ? String(l.inicio).trim() : '';
  const fS = l.fim ? String(l.fim).trim() : '';
  const diffM = iniS && fS ? diffMinutesEntreHorarios(iniS, fS) : null;
  let end: number;
  if (diffM != null && Number.isFinite(diffM) && diffM > 0) {
    end = mi + diffM;
  } else {
    const mf = minutosMeiaNoiteEmBrasilia(l.fim, dia);
    end = mf != null && mf > mi ? mf : mi + SLOT_PADRAO_MIN;
  }
  if (!Number.isFinite(end) || end <= mi) end = mi + SLOT_PADRAO_MIN;
  return { start: mi, end };
}

/**
 * Parte linhas do **mesmo pedido** (já filtradas por profissional na grelha)
 * em cartões.
 *
 * Regra: um cartão = mesmo `agenda_status`. Não exige horários contíguos —
 * Serviço/Cabelo com slot antigo (ex.: profissional alterado) continua no
 * mesmo card das etapas Mega/Pacote daquele profissional.
 * Visitas distintas no mesmo dia com status diferente (confirmado vs cancelado)
 * continuam em cartões separados.
 */
export function particionarLinhasPedidoEmCartoesAgenda(
  linhas: AtendimentoListaItem[],
  diaYmd: string,
  trackKeyBase: string,
): AgendaCartaoParticao[] {
  if (linhas.length <= 1) {
    return [{ trackKey: trackKeyBase, linhas: [...linhas] }];
  }

  const sorted = [...linhas];
  ordenarLinhasAtendimentoInPlace(sorted);

  type Cluster = {
    status: string;
    start: number;
    end: number;
    linhas: AtendimentoListaItem[];
  };

  const clusters: Cluster[] = [];

  for (const l of sorted) {
    const status = normalizarAgendaStatusId(l.agenda_status);
    const ex = extentLinhaMinutos(l, diaYmd);
    const existing = clusters.find((c) => c.status === status);
    if (existing) {
      existing.linhas.push(l);
      if (ex) {
        existing.start = Math.min(existing.start, ex.start);
        existing.end = Math.max(existing.end, ex.end);
      }
      continue;
    }
    clusters.push({
      status,
      start: ex?.start ?? 0,
      end: ex?.end ?? 0,
      linhas: [l],
    });
  }

  if (clusters.length <= 1) {
    return [{ trackKey: trackKeyBase, linhas: sorted }];
  }

  return clusters.map((c, i) => {
    const linhaIds = c.linhas
      .map((x) => x.linha_id)
      .filter((id): id is number => id != null && Number.isFinite(id))
      .join('-');
    const suffix = linhaIds || `c${i}-t${c.start}`;
    return {
      trackKey: `${trackKeyBase}:${c.status}:${suffix}`,
      linhas: c.linhas,
    };
  });
}
