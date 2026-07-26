import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { categorias, produtos, servicos } from '../db/schema';

export type CategoriaCatalogoApi = {
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
  const rows = await db
    .select({ id: categorias.id, nome: categorias.nome })
    .from(categorias);
  return rows.some(
    (r) => keyNome(r.nome) === key && (exceptId == null || r.id !== exceptId),
  );
}

/** Insere no catálogo nomes ainda só presentes em produtos/serviços. */
async function sincronizarNomesLivres(db: Db): Promise<void> {
  await db.execute(sql`
    INSERT INTO categorias (nome, ativo)
    SELECT DISTINCT trim(src.categoria) AS nome, true
    FROM (
      SELECT categoria FROM produtos
      WHERE trim(coalesce(categoria, '')) <> ''
      UNION
      SELECT categoria FROM servicos
      WHERE trim(coalesce(categoria, '')) <> ''
    ) AS src
    WHERE NOT EXISTS (
      SELECT 1
      FROM categorias c
      WHERE lower(trim(c.nome)) = lower(trim(src.categoria))
    )
  `);
}

async function countsPorNome(db: Db): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const bump = (raw: string | null | undefined) => {
    const nome = trimNome(raw ?? '');
    if (!nome) return;
    const key = keyNome(nome);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  const [prodRows, servRows] = await Promise.all([
    db.select({ categoria: produtos.categoria }).from(produtos),
    db.select({ categoria: servicos.categoria }).from(servicos),
  ]);
  for (const r of prodRows) bump(r.categoria);
  for (const r of servRows) bump(r.categoria);
  return counts;
}

export async function listCategoriasCatalogoApi(
  db: Db,
  opts?: { incluirInativas?: boolean },
): Promise<CategoriaCatalogoApi[]> {
  await sincronizarNomesLivres(db);
  const counts = await countsPorNome(db);
  const rows = opts?.incluirInativas
    ? await db.select().from(categorias).orderBy(asc(categorias.nome))
    : await db
        .select()
        .from(categorias)
        .where(eq(categorias.ativo, true))
        .orderBy(asc(categorias.nome));

  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    ativo: r.ativo,
    qtd_itens: counts.get(keyNome(r.nome)) ?? 0,
  }));
}

export async function criarCategoriaCatalogoApi(
  db: Db,
  body: { nome: string; ativo?: boolean },
): Promise<number> {
  const nome = trimNome(body.nome);
  if (!nome) throw new Error('Informe o nome da categoria.');
  if (await nomeDuplicado(db, nome)) {
    throw new Error('Já existe uma categoria com este nome.');
  }
  const ativo = body.ativo !== false;
  const [ins] = await db
    .insert(categorias)
    .values({ nome, ativo })
    .returning({ id: categorias.id });
  return ins!.id;
}

export async function atualizarCategoriaCatalogoApi(
  db: Db,
  id: number,
  body: { nome?: string; ativo?: boolean },
): Promise<void> {
  const [row] = await db
    .select()
    .from(categorias)
    .where(eq(categorias.id, id))
    .limit(1);
  if (!row) throw new Error('Categoria não encontrada.');

  const patch: Partial<{ nome: string; ativo: boolean }> = {};
  if (body.nome !== undefined) {
    const nome = trimNome(body.nome);
    if (!nome) throw new Error('Informe o nome da categoria.');
    if (await nomeDuplicado(db, nome, id)) {
      throw new Error('Já existe uma categoria com este nome.');
    }
    patch.nome = nome;
  }
  if (body.ativo !== undefined) {
    patch.ativo = Boolean(body.ativo);
  }
  if (Object.keys(patch).length === 0) return;

  await db.update(categorias).set(patch).where(eq(categorias.id, id));

  if (patch.nome && patch.nome !== row.nome) {
    await db
      .update(produtos)
      .set({ categoria: patch.nome })
      .where(
        sql`lower(trim(coalesce(${produtos.categoria}, ''))) = lower(trim(${row.nome}))`,
      );
    await db
      .update(servicos)
      .set({ categoria: patch.nome })
      .where(
        sql`lower(trim(coalesce(${servicos.categoria}, ''))) = lower(trim(${row.nome}))`,
      );
  }
}

export async function excluirCategoriaCatalogoApi(
  db: Db,
  id: number,
): Promise<'removed' | 'deactivated'> {
  const [row] = await db
    .select()
    .from(categorias)
    .where(eq(categorias.id, id))
    .limit(1);
  if (!row) throw new Error('Categoria não encontrada.');

  const counts = await countsPorNome(db);
  const qtd = counts.get(keyNome(row.nome)) ?? 0;
  if (qtd > 0) {
    await db
      .update(categorias)
      .set({ ativo: false })
      .where(eq(categorias.id, id));
    return 'deactivated';
  }

  await db.delete(categorias).where(eq(categorias.id, id));
  return 'removed';
}
