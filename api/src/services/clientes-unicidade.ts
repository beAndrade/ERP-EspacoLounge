import { and, ne, or, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { clientes } from '../db/schema';
import type { ClienteCadastroBody } from './clientes-cadastro-normalize';

function apenasDigitos(s: string): string {
  return s.replace(/\D/g, '');
}

/** Celular informado no body (campo `celular` ou `telefone` com 11 dígitos). */
function celularDigitosDoBody(body: ClienteCadastroBody): string {
  const cel = apenasDigitos(String(body.celular ?? ''));
  if (cel.length >= 10) return cel;
  const tel = apenasDigitos(String(body.telefone ?? ''));
  return tel.length >= 10 ? tel : '';
}

async function existeOutroComNome(
  db: Db,
  nome: string,
  excludeId?: string,
): Promise<boolean> {
  const n = nome.trim();
  if (!n) return false;
  const cond =
    excludeId != null && excludeId !== ''
      ? and(
          sql`lower(trim(${clientes.nomeExibido})) = lower(trim(${n}))`,
          ne(clientes.idCliente, excludeId),
        )
      : sql`lower(trim(${clientes.nomeExibido})) = lower(trim(${n}))`;
  const [r] = await db
    .select({ id: clientes.idCliente })
    .from(clientes)
    .where(cond)
    .limit(1);
  return Boolean(r);
}

async function existeOutroComCelular(
  db: Db,
  digitos: string,
  excludeId?: string,
): Promise<boolean> {
  if (digitos.length < 10) return false;
  const matchPhone = or(
    sql`regexp_replace(coalesce(${clientes.celular}, ''), '\\D', '', 'g') = ${digitos}`,
    sql`regexp_replace(coalesce(${clientes.telefone}, ''), '\\D', '', 'g') = ${digitos}`,
  );
  const cond =
    excludeId != null && excludeId !== ''
      ? and(matchPhone, ne(clientes.idCliente, excludeId))
      : matchPhone;
  const [r] = await db
    .select({ id: clientes.idCliente })
    .from(clientes)
    .where(cond)
    .limit(1);
  return Boolean(r);
}

async function existeOutroComCpf(
  db: Db,
  digitos: string,
  excludeId?: string,
): Promise<boolean> {
  if (digitos.length !== 11) return false;
  const matchCpf = sql`regexp_replace(coalesce(${clientes.cpf}, ''), '\\D', '', 'g') = ${digitos}`;
  const cond =
    excludeId != null && excludeId !== ''
      ? and(matchCpf, ne(clientes.idCliente, excludeId))
      : matchCpf;
  const [r] = await db
    .select({ id: clientes.idCliente })
    .from(clientes)
    .where(cond)
    .limit(1);
  return Boolean(r);
}

/**
 * Impede cadastro/edição com nome, celular ou CPF já usados por outro cliente.
 */
export async function assertClienteCadastroUnico(
  db: Db,
  body: ClienteCadastroBody,
  opts?: { excludeClienteId?: string },
): Promise<void> {
  const excludeId = opts?.excludeClienteId?.trim();
  const nome = String(body.nome ?? '').trim();

  if (nome && (await existeOutroComNome(db, nome, excludeId))) {
    throw new Error('Já existe um cliente com este nome');
  }

  const cel = celularDigitosDoBody(body);
  if (cel && (await existeOutroComCelular(db, cel, excludeId))) {
    throw new Error('Já existe um cliente com este celular');
  }

  const cpf = apenasDigitos(String(body.cpf ?? ''));
  if (cpf.length === 11 && (await existeOutroComCpf(db, cpf, excludeId))) {
    throw new Error('Já existe um cliente com este CPF');
  }
}
