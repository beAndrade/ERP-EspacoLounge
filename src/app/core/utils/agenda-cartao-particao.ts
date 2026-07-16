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

function intervalosSeTocamOuSobrepoem(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/**
 * Parte linhas do **mesmo pedido** em cartões da grelha.
 *
 * Regra: um cartão = mesmo `agenda_status` + horários sobrepostos ou contíguos.
 * Assim multi-serviço / etapas Mega-Pacote no mesmo slot ficam juntos, mas
 * visitas distintas no mesmo dia (ex.: confirmado de manhã + cancelado à tarde)
 * — mesmo com `id_atendimento` partilhado por dados legados — aparecem separadas.
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
    temHorario: boolean;
  };

  const clusters: Cluster[] = [];

  for (const l of sorted) {
    const status = normalizarAgendaStatusId(l.agenda_status);
    const ex = extentLinhaMinutos(l, diaYmd);

    let joined = false;
    for (const c of clusters) {
      if (c.status !== status) continue;
      if (ex && c.temHorario) {
        if (!intervalosSeTocamOuSobrepoem(c, ex)) continue;
        c.linhas.push(l);
        c.start = Math.min(c.start, ex.start);
        c.end = Math.max(c.end, ex.end);
        joined = true;
        break;
      }
      /** Sem horário: junta só se o cluster também não tem horário (mesmo status). */
      if (!ex && !c.temHorario) {
        c.linhas.push(l);
        joined = true;
        break;
      }
    }

    if (!joined) {
      clusters.push({
        status,
        start: ex?.start ?? 0,
        end: ex?.end ?? 0,
        linhas: [l],
        temHorario: !!ex,
      });
    }
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
