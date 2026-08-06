import type { Db } from '../../../db';
import {
  cabelos,
  pacotes,
  pacotesQueratina,
  regrasMega,
  regrasMegaQueratina,
} from '../../../db/schema';

export async function listRegrasMegaApi(db: Db) {
  const rows = await db.select().from(regrasMega);
  return rows
    .filter((r) => r.pacote?.trim() && r.etapa?.trim())
    .map((r) => ({
      id: r.id,
      pacote: String(r.pacote).trim(),
      etapa: String(r.etapa).trim(),
      valor: r.valor,
      comissao: r.comissao,
      duracao_minutos: r.duracaoMinutos ?? 30,
    }));
}

export async function listPacotesApi(db: Db) {
  const rows = await db.select().from(pacotes);
  return rows
    .filter((r) => r.pacote?.trim())
    .map((r) => ({
      id: r.id,
      pacote: String(r.pacote).trim(),
      preco: r.precoPacote,
    }));
}

export async function listPacotesQueratinaApi(db: Db) {
  const rows = await db.select().from(pacotesQueratina);
  return rows
    .filter((r) => r.pacote?.trim())
    .map((r) => ({
      id: r.id,
      pacote: String(r.pacote).trim(),
      preco: r.precoPacote,
    }));
}

export async function listRegrasMegaQueratinaApi(db: Db) {
  const rows = await db.select().from(regrasMegaQueratina);
  return rows
    .filter((r) => r.pacote?.trim() && r.etapa?.trim())
    .map((r) => ({
      id: r.id,
      pacote: String(r.pacote).trim(),
      etapa: String(r.etapa).trim(),
      valor: r.valor,
      comissao: r.comissao,
      duracao_minutos: r.duracaoMinutos ?? 30,
    }));
}

export async function listCabelosApi(db: Db) {
  const rows = await db.select().from(cabelos);
  return rows.map((r) => ({
    cor: r.cor != null ? String(r.cor) : '',
    tamanho_cm: r.tamanhoCm,
    metodo: r.metodo != null ? String(r.metodo) : '',
    valor_base: r.valorBase,
  }));
}
