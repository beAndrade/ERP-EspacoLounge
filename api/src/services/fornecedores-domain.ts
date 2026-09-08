import { asc, eq } from 'drizzle-orm';
import { syncSerialIdSequence, type Db } from '../db';
import { fornecedores } from '../db/schema';

export type FornecedorApi = {
  id: number;
  nome: string;
  email: string | null;
  celular: string | null;
  telefone: string | null;
  inscricaoEstadual: string | null;
  cnpj: string | null;
  ativo: boolean;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  estado: string | null;
  cidade: string | null;
};

export type FornecedorWriteInput = {
  nome: string;
  email?: string | null;
  celular?: string | null;
  telefone?: string | null;
  inscricaoEstadual?: string | null;
  cnpj?: string | null;
  ativo?: boolean;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  estado?: string | null;
  cidade?: string | null;
};

function trimText(raw: unknown): string {
  return String(raw ?? '').trim();
}

function nullIfEmpty(raw: unknown): string | null {
  const v = trimText(raw);
  return v ? v : null;
}

function keyNome(raw: string): string {
  return trimText(raw).toLocaleLowerCase('pt-BR');
}

function rowToApi(r: typeof fornecedores.$inferSelect): FornecedorApi {
  return {
    id: r.id,
    nome: r.nome,
    email: r.email ?? null,
    celular: r.celular ?? null,
    telefone: r.telefone ?? null,
    inscricaoEstadual: r.inscricaoEstadual ?? null,
    cnpj: r.cnpj ?? null,
    ativo: r.ativo !== false,
    cep: r.cep ?? null,
    logradouro: r.logradouro ?? null,
    numero: r.numero ?? null,
    complemento: r.complemento ?? null,
    bairro: r.bairro ?? null,
    estado: r.estado ?? null,
    cidade: r.cidade ?? null,
  };
}

async function nomeDuplicado(
  db: Db,
  nome: string,
  exceptId?: number,
): Promise<boolean> {
  const key = keyNome(nome);
  const rows = await db
    .select({ id: fornecedores.id, nome: fornecedores.nome })
    .from(fornecedores);
  return rows.some(
    (r) => keyNome(r.nome) === key && (exceptId == null || r.id !== exceptId),
  );
}

/**
 * Contagem de vínculos (Compras / financeiro / etc.).
 * Hoje não há FKs — retorna 0; ao introduzir relacionamentos, somar aqui
 * para o DELETE soft (padrão Marcas).
 */
async function countUsoFornecedor(_db: Db, _id: number): Promise<number> {
  return 0;
}

function normalizeWrite(body: FornecedorWriteInput): {
  nome: string;
  email: string | null;
  celular: string | null;
  telefone: string | null;
  inscricaoEstadual: string | null;
  cnpj: string | null;
  ativo: boolean;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  estado: string | null;
  cidade: string | null;
} {
  const nome = trimText(body.nome);
  if (!nome) throw new Error('Informe o nome do fornecedor.');
  return {
    nome,
    email: nullIfEmpty(body.email),
    celular: nullIfEmpty(body.celular),
    telefone: nullIfEmpty(body.telefone),
    inscricaoEstadual: nullIfEmpty(body.inscricaoEstadual),
    cnpj: nullIfEmpty(body.cnpj),
    ativo: body.ativo !== false,
    cep: nullIfEmpty(body.cep),
    logradouro: nullIfEmpty(body.logradouro),
    numero: nullIfEmpty(body.numero),
    complemento: nullIfEmpty(body.complemento),
    bairro: nullIfEmpty(body.bairro),
    estado: nullIfEmpty(body.estado)?.toUpperCase() ?? null,
    cidade: nullIfEmpty(body.cidade),
  };
}

export async function listFornecedoresApi(
  db: Db,
  opts?: { incluirInativas?: boolean },
): Promise<FornecedorApi[]> {
  const rows = opts?.incluirInativas
    ? await db.select().from(fornecedores).orderBy(asc(fornecedores.nome))
    : await db
        .select()
        .from(fornecedores)
        .where(eq(fornecedores.ativo, true))
        .orderBy(asc(fornecedores.nome));
  return rows.map(rowToApi);
}

export async function criarFornecedorApi(
  db: Db,
  body: FornecedorWriteInput,
): Promise<number> {
  const data = normalizeWrite(body);
  if (await nomeDuplicado(db, data.nome)) {
    throw new Error('Já existe um fornecedor com este nome.');
  }
  await syncSerialIdSequence('fornecedores');
  const [ins] = await db
    .insert(fornecedores)
    .values(data)
    .returning({ id: fornecedores.id });
  return ins!.id;
}

export async function atualizarFornecedorApi(
  db: Db,
  id: number,
  body: Partial<FornecedorWriteInput>,
): Promise<void> {
  const [row] = await db
    .select()
    .from(fornecedores)
    .where(eq(fornecedores.id, id))
    .limit(1);
  if (!row) throw new Error('Fornecedor não encontrado.');

  const patch: Partial<typeof fornecedores.$inferInsert> = {};

  if (body.nome !== undefined) {
    const nome = trimText(body.nome);
    if (!nome) throw new Error('Informe o nome do fornecedor.');
    if (await nomeDuplicado(db, nome, id)) {
      throw new Error('Já existe um fornecedor com este nome.');
    }
    patch.nome = nome;
  }
  if (body.email !== undefined) patch.email = nullIfEmpty(body.email);
  if (body.celular !== undefined) patch.celular = nullIfEmpty(body.celular);
  if (body.telefone !== undefined) patch.telefone = nullIfEmpty(body.telefone);
  if (body.inscricaoEstadual !== undefined) {
    patch.inscricaoEstadual = nullIfEmpty(body.inscricaoEstadual);
  }
  if (body.cnpj !== undefined) patch.cnpj = nullIfEmpty(body.cnpj);
  if (body.ativo !== undefined) patch.ativo = Boolean(body.ativo);
  if (body.cep !== undefined) patch.cep = nullIfEmpty(body.cep);
  if (body.logradouro !== undefined) {
    patch.logradouro = nullIfEmpty(body.logradouro);
  }
  if (body.numero !== undefined) patch.numero = nullIfEmpty(body.numero);
  if (body.complemento !== undefined) {
    patch.complemento = nullIfEmpty(body.complemento);
  }
  if (body.bairro !== undefined) patch.bairro = nullIfEmpty(body.bairro);
  if (body.estado !== undefined) {
    patch.estado = nullIfEmpty(body.estado)?.toUpperCase() ?? null;
  }
  if (body.cidade !== undefined) patch.cidade = nullIfEmpty(body.cidade);

  if (Object.keys(patch).length === 0) return;
  await db.update(fornecedores).set(patch).where(eq(fornecedores.id, id));
}

export async function excluirFornecedorApi(
  db: Db,
  id: number,
): Promise<'removed' | 'deactivated'> {
  const [row] = await db
    .select()
    .from(fornecedores)
    .where(eq(fornecedores.id, id))
    .limit(1);
  if (!row) throw new Error('Fornecedor não encontrado.');

  const qtd = await countUsoFornecedor(db, id);
  if (qtd > 0) {
    await db
      .update(fornecedores)
      .set({ ativo: false })
      .where(eq(fornecedores.id, id));
    return 'deactivated';
  }

  await db.delete(fornecedores).where(eq(fornecedores.id, id));
  return 'removed';
}
