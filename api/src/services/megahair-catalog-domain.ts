/**
 * CRUD do catálogo Megahair (regras Mega/Queratina, pacotes, cabelos).
 */
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import {
  cabelos,
  pacotes,
  pacotesQueratina,
  regrasMega,
  regrasMegaQueratina,
} from '../db/schema';
import { normalizeMoneyTextForDb } from '../lib/normalize-money-text';
import {
  listCabelosApi,
  listPacotesApi,
  listPacotesQueratinaApi,
  listRegrasMegaApi,
  listRegrasMegaQueratinaApi,
} from './queries';

function trimOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function trimRequired(v: unknown, label: string): string {
  const s = trimOrNull(v);
  if (!s) throw new Error(`${label} é obrigatório.`);
  return s;
}

function parseId(raw: string | number): number {
  const id = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(id) || id <= 0) throw new Error('id inválido');
  return id;
}

function normalizarDuracao(v: unknown, fallback = 30): number {
  if (v == null || v === '') return fallback;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 5 || n > 24 * 60) {
    throw new Error('Duração deve ser entre 5 e 1440 minutos.');
  }
  return n;
}

function keyNorm(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

export type RegraMegaWriteInput = {
  pacote: string;
  etapa: string;
  valor?: string | null;
  comissao?: string | null;
  duracao_minutos?: number | null;
};

async function regraMegaDuplicada(
  db: Db,
  table: typeof regrasMega | typeof regrasMegaQueratina,
  pacote: string,
  etapa: string,
  exceptId?: number,
): Promise<boolean> {
  const pk = keyNorm(pacote);
  const ek = keyNorm(etapa);
  const rows = await db.select({ id: table.id, pacote: table.pacote, etapa: table.etapa }).from(table);
  return rows.some(
    (r) =>
      keyNorm(String(r.pacote ?? '')) === pk &&
      keyNorm(String(r.etapa ?? '')) === ek &&
      (exceptId == null || r.id !== exceptId),
  );
}

function mapRegraRow(r: {
  id: number;
  pacote: string;
  etapa: string;
  valor: string | null;
  comissao: string | null;
  duracaoMinutos: number | null;
}) {
  return {
    id: r.id,
    pacote: String(r.pacote).trim(),
    etapa: String(r.etapa).trim(),
    valor: r.valor,
    comissao: r.comissao,
    duracao_minutos: r.duracaoMinutos ?? 30,
  };
}

export async function createRegraMega(db: Db, input: RegraMegaWriteInput) {
  const pacote = trimRequired(input.pacote, 'Pacote');
  const etapa = trimRequired(input.etapa, 'Etapa');
  if (await regraMegaDuplicada(db, regrasMega, pacote, etapa)) {
    throw new Error('Já existe esta etapa para o pacote informado.');
  }
  const [row] = await db
    .insert(regrasMega)
    .values({
      pacote,
      etapa,
      valor: normalizeMoneyTextForDb(input.valor),
      comissao: normalizeMoneyTextForDb(input.comissao),
      duracaoMinutos: normalizarDuracao(input.duracao_minutos, 30),
    })
    .returning();
  return mapRegraRow(row!);
}

export async function updateRegraMega(
  db: Db,
  idRaw: string | number,
  input: RegraMegaWriteInput,
) {
  const id = parseId(idRaw);
  const pacote = trimRequired(input.pacote, 'Pacote');
  const etapa = trimRequired(input.etapa, 'Etapa');
  if (await regraMegaDuplicada(db, regrasMega, pacote, etapa, id)) {
    throw new Error('Já existe esta etapa para o pacote informado.');
  }
  const [row] = await db
    .update(regrasMega)
    .set({
      pacote,
      etapa,
      valor: normalizeMoneyTextForDb(input.valor),
      comissao: normalizeMoneyTextForDb(input.comissao),
      duracaoMinutos: normalizarDuracao(input.duracao_minutos, 30),
    })
    .where(eq(regrasMega.id, id))
    .returning();
  if (!row) throw new Error('Regra Mega não encontrada');
  return mapRegraRow(row);
}

export async function deleteRegraMega(db: Db, idRaw: string | number) {
  const id = parseId(idRaw);
  const [row] = await db
    .delete(regrasMega)
    .where(eq(regrasMega.id, id))
    .returning({ id: regrasMega.id });
  if (!row) throw new Error('Regra Mega não encontrada');
  return { ok: true as const };
}

export async function createRegraMegaQueratina(
  db: Db,
  input: RegraMegaWriteInput,
) {
  const pacote = trimRequired(input.pacote, 'Pacote');
  const etapa = trimRequired(input.etapa, 'Etapa');
  if (await regraMegaDuplicada(db, regrasMegaQueratina, pacote, etapa)) {
    throw new Error('Já existe esta etapa para o pacote informado.');
  }
  const [row] = await db
    .insert(regrasMegaQueratina)
    .values({
      pacote,
      etapa,
      valor: normalizeMoneyTextForDb(input.valor),
      comissao: normalizeMoneyTextForDb(input.comissao),
      duracaoMinutos: normalizarDuracao(input.duracao_minutos, 30),
    })
    .returning();
  return mapRegraRow(row!);
}

export async function updateRegraMegaQueratina(
  db: Db,
  idRaw: string | number,
  input: RegraMegaWriteInput,
) {
  const id = parseId(idRaw);
  const pacote = trimRequired(input.pacote, 'Pacote');
  const etapa = trimRequired(input.etapa, 'Etapa');
  if (await regraMegaDuplicada(db, regrasMegaQueratina, pacote, etapa, id)) {
    throw new Error('Já existe esta etapa para o pacote informado.');
  }
  const [row] = await db
    .update(regrasMegaQueratina)
    .set({
      pacote,
      etapa,
      valor: normalizeMoneyTextForDb(input.valor),
      comissao: normalizeMoneyTextForDb(input.comissao),
      duracaoMinutos: normalizarDuracao(input.duracao_minutos, 30),
    })
    .where(eq(regrasMegaQueratina.id, id))
    .returning();
  if (!row) throw new Error('Regra Mega Queratina não encontrada');
  return mapRegraRow(row);
}

export async function deleteRegraMegaQueratina(db: Db, idRaw: string | number) {
  const id = parseId(idRaw);
  const [row] = await db
    .delete(regrasMegaQueratina)
    .where(eq(regrasMegaQueratina.id, id))
    .returning({ id: regrasMegaQueratina.id });
  if (!row) throw new Error('Regra Mega Queratina não encontrada');
  return { ok: true as const };
}

export type PacoteWriteInput = {
  pacote: string;
  preco?: string | null;
};

async function pacoteNomeDuplicado(
  db: Db,
  table: typeof pacotes | typeof pacotesQueratina,
  pacote: string,
  exceptId?: number,
): Promise<boolean> {
  const key = keyNorm(pacote);
  const rows = await db
    .select({ id: table.id, pacote: table.pacote })
    .from(table);
  return rows.some(
    (r) =>
      keyNorm(String(r.pacote ?? '')) === key &&
      (exceptId == null || r.id !== exceptId),
  );
}

function mapPacoteRow(r: { id: number; pacote: string; precoPacote: string | null }) {
  return {
    id: r.id,
    pacote: String(r.pacote).trim(),
    preco: r.precoPacote,
  };
}

export async function createPacote(db: Db, input: PacoteWriteInput) {
  const pacote = trimRequired(input.pacote, 'Pacote');
  if (await pacoteNomeDuplicado(db, pacotes, pacote)) {
    throw new Error('Já existe um pacote com este nome.');
  }
  const [row] = await db
    .insert(pacotes)
    .values({
      pacote,
      precoPacote: normalizeMoneyTextForDb(input.preco),
    })
    .returning();
  return mapPacoteRow(row!);
}

export async function updatePacote(
  db: Db,
  idRaw: string | number,
  input: PacoteWriteInput,
) {
  const id = parseId(idRaw);
  const pacote = trimRequired(input.pacote, 'Pacote');
  if (await pacoteNomeDuplicado(db, pacotes, pacote, id)) {
    throw new Error('Já existe um pacote com este nome.');
  }
  const [row] = await db
    .update(pacotes)
    .set({
      pacote,
      precoPacote: normalizeMoneyTextForDb(input.preco),
    })
    .where(eq(pacotes.id, id))
    .returning();
  if (!row) throw new Error('Pacote não encontrado');
  return mapPacoteRow(row);
}

export async function deletePacote(db: Db, idRaw: string | number) {
  const id = parseId(idRaw);
  const [row] = await db
    .delete(pacotes)
    .where(eq(pacotes.id, id))
    .returning({ id: pacotes.id });
  if (!row) throw new Error('Pacote não encontrado');
  return { ok: true as const };
}

export async function createPacoteQueratina(db: Db, input: PacoteWriteInput) {
  const pacote = trimRequired(input.pacote, 'Pacote');
  if (await pacoteNomeDuplicado(db, pacotesQueratina, pacote)) {
    throw new Error('Já existe um pacote com este nome.');
  }
  const [row] = await db
    .insert(pacotesQueratina)
    .values({
      pacote,
      precoPacote: normalizeMoneyTextForDb(input.preco),
    })
    .returning();
  return mapPacoteRow(row!);
}

export async function updatePacoteQueratina(
  db: Db,
  idRaw: string | number,
  input: PacoteWriteInput,
) {
  const id = parseId(idRaw);
  const pacote = trimRequired(input.pacote, 'Pacote');
  if (await pacoteNomeDuplicado(db, pacotesQueratina, pacote, id)) {
    throw new Error('Já existe um pacote com este nome.');
  }
  const [row] = await db
    .update(pacotesQueratina)
    .set({
      pacote,
      precoPacote: normalizeMoneyTextForDb(input.preco),
    })
    .where(eq(pacotesQueratina.id, id))
    .returning();
  if (!row) throw new Error('Pacote Queratina não encontrado');
  return mapPacoteRow(row);
}

export async function deletePacoteQueratina(db: Db, idRaw: string | number) {
  const id = parseId(idRaw);
  const [row] = await db
    .delete(pacotesQueratina)
    .where(eq(pacotesQueratina.id, id))
    .returning({ id: pacotesQueratina.id });
  if (!row) throw new Error('Pacote Queratina não encontrado');
  return { ok: true as const };
}

export type CabeloWriteInput = {
  cor?: string | null;
  tamanho_cm?: string | null;
  metodo?: string | null;
  valor_base?: string | null;
};

function mapCabeloRow(r: {
  id: number;
  cor: string | null;
  tamanhoCm: string | null;
  metodo: string | null;
  valorBase: string | null;
}) {
  return {
    id: r.id,
    cor: r.cor != null ? String(r.cor) : '',
    tamanho_cm: r.tamanhoCm,
    metodo: r.metodo != null ? String(r.metodo) : '',
    valor_base: r.valorBase,
  };
}

async function cabeloComboDuplicada(
  db: Db,
  cor: string,
  tamanho: string,
  metodo: string,
  exceptId?: number,
): Promise<boolean> {
  const rows = await db.select().from(cabelos);
  return rows.some(
    (r) =>
      keyNorm(String(r.cor ?? '')) === keyNorm(cor) &&
      keyNorm(String(r.tamanhoCm ?? '')) === keyNorm(tamanho) &&
      keyNorm(String(r.metodo ?? '')) === keyNorm(metodo) &&
      (exceptId == null || r.id !== exceptId),
  );
}

export async function createCabelo(db: Db, input: CabeloWriteInput) {
  const cor = trimRequired(input.cor, 'Cor');
  const tamanho_cm = trimRequired(input.tamanho_cm, 'Tamanho');
  const metodo = trimRequired(input.metodo, 'Método');
  if (await cabeloComboDuplicada(db, cor, tamanho_cm, metodo)) {
    throw new Error('Já existe esta combinação de cor, tamanho e método.');
  }
  const [row] = await db
    .insert(cabelos)
    .values({
      cor,
      tamanhoCm: tamanho_cm,
      metodo,
      valorBase: normalizeMoneyTextForDb(input.valor_base),
    })
    .returning();
  return mapCabeloRow(row!);
}

export async function updateCabelo(
  db: Db,
  idRaw: string | number,
  input: CabeloWriteInput,
) {
  const id = parseId(idRaw);
  const cor = trimRequired(input.cor, 'Cor');
  const tamanho_cm = trimRequired(input.tamanho_cm, 'Tamanho');
  const metodo = trimRequired(input.metodo, 'Método');
  if (await cabeloComboDuplicada(db, cor, tamanho_cm, metodo, id)) {
    throw new Error('Já existe esta combinação de cor, tamanho e método.');
  }
  const [row] = await db
    .update(cabelos)
    .set({
      cor,
      tamanhoCm: tamanho_cm,
      metodo,
      valorBase: normalizeMoneyTextForDb(input.valor_base),
    })
    .where(eq(cabelos.id, id))
    .returning();
  if (!row) throw new Error('Cabelo não encontrado');
  return mapCabeloRow(row);
}

export async function deleteCabelo(db: Db, idRaw: string | number) {
  const id = parseId(idRaw);
  const [row] = await db
    .delete(cabelos)
    .where(eq(cabelos.id, id))
    .returning({ id: cabelos.id });
  if (!row) throw new Error('Cabelo não encontrado');
  return { ok: true as const };
}

/** Reexport das listas para o domain (testes / consistência). */
export {
  listRegrasMegaApi,
  listRegrasMegaQueratinaApi,
  listPacotesApi,
  listPacotesQueratinaApi,
  listCabelosApi,
};
