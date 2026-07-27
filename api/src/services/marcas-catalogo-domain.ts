import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { marcas, produtos } from '../db/schema';

export type MarcaCatalogoApi = {
  id: number;
  nome: string;
  ativo: boolean;
  qtd_itens: number;
};

function trimNome(raw: string): string {
  return String(raw ?? '').trim();
}

function keyNome(raw: string): string {
  return trimNome(raw).toLocaleLowerCase('pt-BR');
}

async function nomeDuplicado(
  db: Db,
  nome: string,
  exceptId?: number,
): Promise<boolean> {
  const key = keyNome(nome);
  const rows = await db.select({ id: marcas.id, nome: marcas.nome }).from(marcas);
  return rows.some(
    (r) => keyNome(r.nome) === key && (exceptId == null || r.id !== exceptId),
  );
}

/** Insere no catálogo nomes ainda só presentes em produtos. */
async function sincronizarNomesLivres(db: Db): Promise<void> {
  await db.execute(sql`
    INSERT INTO marcas (nome, ativo)
    SELECT DISTINCT trim(src.marca) AS nome, true
    FROM (
      SELECT marca FROM produtos
      WHERE trim(coalesce(marca, '')) <> ''
    ) AS src
    WHERE NOT EXISTS (
      SELECT 1
      FROM marcas m
      WHERE lower(trim(m.nome)) = lower(trim(src.marca))
    )
  `);
}

async function countsPorNome(db: Db): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const rows = await db.select({ marca: produtos.marca }).from(produtos);
  for (const r of rows) {
    const nome = trimNome(r.marca ?? '');
    if (!nome) continue;
    const key = keyNome(nome);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export async function listMarcasCatalogoApi(
  db: Db,
  opts?: { incluirInativas?: boolean },
): Promise<MarcaCatalogoApi[]> {
  await sincronizarNomesLivres(db);
  const counts = await countsPorNome(db);
  const rows = opts?.incluirInativas
    ? await db.select().from(marcas).orderBy(asc(marcas.nome))
    : await db
        .select()
        .from(marcas)
        .where(eq(marcas.ativo, true))
        .orderBy(asc(marcas.nome));

  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    ativo: r.ativo,
    qtd_itens: counts.get(keyNome(r.nome)) ?? 0,
  }));
}

export async function criarMarcaCatalogoApi(
  db: Db,
  body: { nome: string; ativo?: boolean },
): Promise<number> {
  const nome = trimNome(body.nome);
  if (!nome) throw new Error('Informe o nome da marca.');
  if (await nomeDuplicado(db, nome)) {
    throw new Error('Já existe uma marca com este nome.');
  }
  const ativo = body.ativo !== false;
  const [ins] = await db
    .insert(marcas)
    .values({ nome, ativo })
    .returning({ id: marcas.id });
  return ins!.id;
}

export async function atualizarMarcaCatalogoApi(
  db: Db,
  id: number,
  body: { nome?: string; ativo?: boolean },
): Promise<void> {
  const [row] = await db.select().from(marcas).where(eq(marcas.id, id)).limit(1);
  if (!row) throw new Error('Marca não encontrada.');

  const patch: Partial<{ nome: string; ativo: boolean }> = {};
  if (body.nome !== undefined) {
    const nome = trimNome(body.nome);
    if (!nome) throw new Error('Informe o nome da marca.');
    if (await nomeDuplicado(db, nome, id)) {
      throw new Error('Já existe uma marca com este nome.');
    }
    patch.nome = nome;
  }
  if (body.ativo !== undefined) {
    patch.ativo = Boolean(body.ativo);
  }
  if (Object.keys(patch).length === 0) return;

  await db.update(marcas).set(patch).where(eq(marcas.id, id));

  if (patch.nome && patch.nome !== row.nome) {
    await db
      .update(produtos)
      .set({ marca: patch.nome })
      .where(
        sql`lower(trim(coalesce(${produtos.marca}, ''))) = lower(trim(${row.nome}))`,
      );
  }
}

export async function excluirMarcaCatalogoApi(
  db: Db,
  id: number,
): Promise<'removed' | 'deactivated'> {
  const [row] = await db.select().from(marcas).where(eq(marcas.id, id)).limit(1);
  if (!row) throw new Error('Marca não encontrada.');

  const counts = await countsPorNome(db);
  const qtd = counts.get(keyNome(row.nome)) ?? 0;
  if (qtd > 0) {
    await db.update(marcas).set({ ativo: false }).where(eq(marcas.id, id));
    return 'deactivated';
  }

  await db.delete(marcas).where(eq(marcas.id, id));
  return 'removed';
}
