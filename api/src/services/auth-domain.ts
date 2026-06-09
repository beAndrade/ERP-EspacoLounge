import bcrypt from 'bcryptjs';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { profissionais, usuarios } from '../db/schema';
import { signAccessToken } from '../lib/jwt';

export type UsuarioRole = 'admin' | 'profissional';

export type AuthUser = {
  id: number;
  email: string;
  role: UsuarioRole;
  profissional_id: number | null;
  nome_exibicao: string;
};

export type UsuarioApiItem = AuthUser & {
  ativo: boolean;
  tem_senha: boolean;
};

const BCRYPT_ROUNDS = 10;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, BCRYPT_ROUNDS);
}

export async function verifySenha(
  senha: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

function mapUsuarioRow(r: {
  id: number;
  email: string;
  role: UsuarioRole;
  profissionalId: number | null;
  nomeExibicao: string;
  ativo: boolean;
  senhaHash: string;
}): UsuarioApiItem {
  return {
    id: r.id,
    email: r.email,
    role: r.role,
    profissional_id: r.profissionalId,
    nome_exibicao: r.nomeExibicao,
    ativo: r.ativo,
    tem_senha: Boolean(r.senhaHash),
  };
}

export async function ensureAdminBootstrap(db: Db): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim();
  const senha = process.env.ADMIN_PASSWORD?.trim();
  const nome = process.env.ADMIN_NOME?.trim() || 'Administrador';
  if (!email || !senha) return;

  const [existing] = await db.select({ id: usuarios.id }).from(usuarios).limit(1);
  if (existing) return;

  const senhaHash = await hashSenha(senha);
  await db.insert(usuarios).values({
    email: normalizeEmail(email),
    senhaHash,
    nomeExibicao: nome,
    role: 'admin',
    profissionalId: null,
    ativo: true,
  });
  console.log(`[auth] Utilizador admin criado: ${normalizeEmail(email)}`);
}

export async function loginUsuario(
  db: Db,
  emailRaw: string,
  senha: string,
): Promise<
  | { ok: true; token: string; user: AuthUser }
  | { ok: false; message: string }
> {
  const email = normalizeEmail(emailRaw);
  if (!email || !senha) {
    return { ok: false, message: 'E-mail e senha são obrigatórios.' };
  }
  const [row] = await db
    .select()
    .from(usuarios)
    .where(
      and(
        sql`lower(trim(${usuarios.email})) = ${email}`,
        eq(usuarios.ativo, true),
      ),
    )
    .limit(1);
  if (!row) {
    return { ok: false, message: 'E-mail ou senha incorretos.' };
  }
  const valid = await verifySenha(senha, row.senhaHash);
  if (!valid) {
    return { ok: false, message: 'E-mail ou senha incorretos.' };
  }
  const user: AuthUser = {
    id: row.id,
    email: row.email,
    role: row.role,
    profissional_id: row.profissionalId,
    nome_exibicao: row.nomeExibicao,
  };
  const token = await signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    profissional_id: user.profissional_id,
    nome: user.nome_exibicao,
  });
  return { ok: true, token, user };
}

export async function getUsuarioById(
  db: Db,
  id: number,
): Promise<UsuarioApiItem | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  const [row] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.id, id))
    .limit(1);
  if (!row) return null;
  return mapUsuarioRow(row);
}

export async function getUsuarioByProfissionalId(
  db: Db,
  profissionalId: number,
): Promise<UsuarioApiItem | null> {
  if (!Number.isFinite(profissionalId) || profissionalId <= 0) return null;
  const [row] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.profissionalId, profissionalId))
    .limit(1);
  if (!row) return null;
  return mapUsuarioRow(row);
}

export type UpsertUsuarioProfissionalInput = {
  email: string;
  senha?: string;
  ativo?: boolean;
};

export async function upsertUsuarioForProfissional(
  db: Db,
  profissionalId: number,
  input: UpsertUsuarioProfissionalInput,
): Promise<UsuarioApiItem> {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error('E-mail é obrigatório.');

  const prof = await db
    .select({ id: profissionais.id, nome: profissionais.nome })
    .from(profissionais)
    .where(eq(profissionais.id, profissionalId))
    .limit(1);
  if (!prof.length) throw new Error('Profissional não encontrado.');

  const [existing] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.profissionalId, profissionalId))
    .limit(1);

  const senha = input.senha?.trim();
  if (!existing && !senha) {
    throw new Error('Senha é obrigatória ao criar o usuário.');
  }

  if (existing) {
    const patch: Partial<{
      email: string;
      senhaHash: string;
      ativo: boolean;
      updatedAt: Date;
    }> = {
      email,
      updatedAt: new Date(),
    };
    if (senha) patch.senhaHash = await hashSenha(senha);
    if (input.ativo !== undefined) patch.ativo = input.ativo;

    const [updated] = await db
      .update(usuarios)
      .set(patch)
      .where(eq(usuarios.id, existing.id))
      .returning();
    if (!updated) throw new Error('Não foi possível atualizar o usuário.');
    return mapUsuarioRow(updated);
  }

  const senhaHash = await hashSenha(senha!);
  const [created] = await db
    .insert(usuarios)
    .values({
      email,
      senhaHash,
      nomeExibicao: String(prof[0]!.nome || '').trim() || email,
      role: 'profissional',
      profissionalId,
      ativo: input.ativo !== false,
    })
    .returning();
  if (!created) throw new Error('Não foi possível criar o usuário.');
  return mapUsuarioRow(created);
}
