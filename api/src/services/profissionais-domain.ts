import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { profissionais } from '../db/schema';

export type ProfissionalApiItem = { id: number; nome: string; ativo: boolean };

function nomeNormalizado(n: string): string {
  return n.trim();
}

async function existeNomeOutro(
  db: Db,
  nome: string,
  excetoId?: number,
): Promise<boolean> {
  const n = nomeNormalizado(nome);
  if (!n) return false;
  const cond =
    excetoId != null
      ? and(
          sql`lower(trim(${profissionais.nome})) = lower(trim(${n}))`,
          ne(profissionais.id, excetoId),
        )
      : sql`lower(trim(${profissionais.nome})) = lower(trim(${n}))`;
  const [r] = await db
    .select({ id: profissionais.id })
    .from(profissionais)
    .where(cond)
    .limit(1);
  return Boolean(r);
}

export async function listProfissionaisForApi(
  db: Db,
  opts?: { incluirInativos?: boolean },
): Promise<ProfissionalApiItem[]> {
  const todos = opts?.incluirInativos === true;
  const rows = todos
    ? await db
        .select({
          id: profissionais.id,
          nome: profissionais.nome,
          ativo: profissionais.ativo,
        })
        .from(profissionais)
        .orderBy(asc(profissionais.nome))
    : await db
        .select({
          id: profissionais.id,
          nome: profissionais.nome,
          ativo: profissionais.ativo,
        })
        .from(profissionais)
        .where(eq(profissionais.ativo, true))
        .orderBy(asc(profissionais.nome));
  return rows
    .map((r) => ({
      id: r.id,
      nome: String(r.nome || '').trim(),
      ativo: Boolean(r.ativo),
    }))
    .filter((x) => x.nome);
}

export async function criarProfissional(
  db: Db,
  input: { nome: string; ativo?: boolean },
): Promise<ProfissionalApiItem> {
  const nome = nomeNormalizado(input.nome);
  if (!nome) {
    throw new Error('Nome é obrigatório');
  }
  if (await existeNomeOutro(db, nome)) {
    throw new Error('Já existe um profissional com este nome');
  }
  const ativo = input.ativo !== false;
  const [ins] = await db
    .insert(profissionais)
    .values({ nome, ativo })
    .returning({
      id: profissionais.id,
      nome: profissionais.nome,
      ativo: profissionais.ativo,
    });
  if (!ins) throw new Error('Não foi possível criar o profissional');
  return {
    id: ins.id,
    nome: String(ins.nome || '').trim(),
    ativo: Boolean(ins.ativo),
  };
}

export async function atualizarProfissional(
  db: Db,
  id: number,
  input: { nome?: string; ativo?: boolean },
): Promise<ProfissionalApiItem> {
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('id inválido');
  }
  const [atual] = await db
    .select({
      id: profissionais.id,
      nome: profissionais.nome,
      ativo: profissionais.ativo,
    })
    .from(profissionais)
    .where(eq(profissionais.id, id))
    .limit(1);
  if (!atual) {
    throw new Error('Profissional não encontrado');
  }
  const patch: { nome?: string; ativo?: boolean } = {};
  if (input.nome !== undefined) {
    const nome = nomeNormalizado(input.nome);
    if (!nome) {
      throw new Error('Nome é obrigatório');
    }
    if (await existeNomeOutro(db, nome, id)) {
      throw new Error('Já existe um profissional com este nome');
    }
    patch.nome = nome;
  }
  if (input.ativo !== undefined) {
    patch.ativo = Boolean(input.ativo);
  }
  if (Object.keys(patch).length === 0) {
    return {
      id: atual.id,
      nome: String(atual.nome || '').trim(),
      ativo: Boolean(atual.ativo),
    };
  }
  const [upd] = await db
    .update(profissionais)
    .set(patch)
    .where(eq(profissionais.id, id))
    .returning({
      id: profissionais.id,
      nome: profissionais.nome,
      ativo: profissionais.ativo,
    });
  if (!upd) throw new Error('Profissional não encontrado');
  return {
    id: upd.id,
    nome: String(upd.nome || '').trim(),
    ativo: Boolean(upd.ativo),
  };
}
