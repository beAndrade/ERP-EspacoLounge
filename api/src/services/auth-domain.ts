import bcrypt from 'bcryptjs';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { profissionais, usuarios } from '../db/schema';
import { signAccessToken } from '../platform/auth/jwt';

export type UsuarioRole = 'admin' | 'profissional';

export type AuthUser = {
  id: number;
  email: string;
  role: UsuarioRole;
  profissional_id: number | null;
  nome_exibicao: string;
  foto_url?: string | null;
};

export type UsuarioApiItem = AuthUser & {
  ativo: boolean;
  tem_senha: boolean;
};

async function enrichAuthUser(
  db: Db,
  user: AuthUser,
): Promise<AuthUser> {
  if (user.profissional_id == null || !Number.isFinite(user.profissional_id)) {
    return user;
  }
  const [row] = await db
    .select({ nome: profissionais.nome, fotoUrl: profissionais.fotoUrl })
    .from(profissionais)
    .where(eq(profissionais.id, user.profissional_id))
    .limit(1);
  if (!row) return user;
  const nome = String(row.nome || '').trim();
  const foto = row.fotoUrl ? String(row.fotoUrl).trim() : '';
  return {
    ...user,
    ...(nome ? { nome_exibicao: nome } : {}),
    ...(foto ? { foto_url: foto } : {}),
  };
}

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

async function resolveAdminProfissionalId(db: Db): Promise<number | null> {
  const nomeProf = process.env.ADMIN_PROFISSIONAL_NOME?.trim();
  if (!nomeProf) return null;
  const [p] = await db
    .select({ id: profissionais.id })
    .from(profissionais)
    .where(
      sql`lower(trim(${profissionais.nome})) = lower(trim(${nomeProf}))`,
    )
    .limit(1);
  return p?.id ?? null;
}

export async function ensureAdminBootstrap(db: Db): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim();
  const senha = process.env.ADMIN_PASSWORD?.trim();
  const nome = process.env.ADMIN_NOME?.trim() || 'Administrador';
  if (!email || !senha) return;

  const [existing] = await db.select({ id: usuarios.id }).from(usuarios).limit(1);
  if (existing) return;

  const profissionalId = await resolveAdminProfissionalId(db);
  const senhaHash = await hashSenha(senha);
  await db.insert(usuarios).values({
    email: normalizeEmail(email),
    senhaHash,
    nomeExibicao: nome,
    role: 'admin',
    profissionalId,
    ativo: true,
  });
  console.log(`[auth] Utilizador admin criado: ${normalizeEmail(email)}`);
}

/** Liga o utilizador admin ao cadastro do profissional (`ADMIN_PROFISSIONAL_NOME`). */
export async function ensureAdminProfissionalLink(db: Db): Promise<void> {
  const profissionalId = await resolveAdminProfissionalId(db);
  if (!profissionalId) return;

  const email = process.env.ADMIN_EMAIL?.trim();
  if (email) {
    await db
      .update(usuarios)
      .set({ profissionalId, updatedAt: new Date() })
      .where(
        and(
          eq(usuarios.role, 'admin'),
          sql`lower(trim(${usuarios.email})) = ${normalizeEmail(email)}`,
        ),
      );
    return;
  }

  await db
    .update(usuarios)
    .set({ profissionalId, updatedAt: new Date() })
    .where(and(eq(usuarios.role, 'admin'), sql`${usuarios.profissionalId} IS NULL`));
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
  const userComFoto = await enrichAuthUser(db, user);
  const token = await signAccessToken({
    sub: userComFoto.id,
    email: userComFoto.email,
    role: userComFoto.role,
    profissional_id: userComFoto.profissional_id,
    nome: userComFoto.nome_exibicao,
  });
  return { ok: true, token, user: userComFoto };
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
  const item = mapUsuarioRow(row);
  const enriched = await enrichAuthUser(db, item);
  return { ...item, ...enriched };
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
  const item = mapUsuarioRow(row);
  const enriched = await enrichAuthUser(db, item);
  return { ...item, ...enriched };
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
    if (existing.role === 'admin' && input.ativo === false) {
      throw new Error('A conta do admin do sistema não pode ser desativada.');
    }
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

async function getUsuarioRowById(db: Db, userId: number) {
  const [row] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.id, userId))
    .limit(1);
  if (!row) throw new Error('Usuário não encontrado.');
  return row;
}

function authUserFromRow(row: {
  id: number;
  email: string;
  role: UsuarioRole;
  profissionalId: number | null;
  nomeExibicao: string;
}): AuthUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    profissional_id: row.profissionalId,
    nome_exibicao: row.nomeExibicao,
  };
}

async function tokenForUser(user: AuthUser): Promise<string> {
  return signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    profissional_id: user.profissional_id,
    nome: user.nome_exibicao,
  });
}

export async function alterarEmailUsuario(
  db: Db,
  userId: number,
  input: { email: string; senha_atual: string },
): Promise<{ user: AuthUser; token: string }> {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error('E-mail é obrigatório.');
  const senhaAtual = input.senha_atual?.trim();
  if (!senhaAtual) throw new Error('Senha atual é obrigatória.');

  const row = await getUsuarioRowById(db, userId);
  const valid = await verifySenha(senhaAtual, row.senhaHash);
  if (!valid) throw new Error('Senha atual incorreta.');

  const [dup] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(
      and(
        sql`lower(trim(${usuarios.email})) = ${email}`,
        sql`${usuarios.id} <> ${userId}`,
      ),
    )
    .limit(1);
  if (dup) throw new Error('Este e-mail já está em uso.');

  const [updated] = await db
    .update(usuarios)
    .set({ email, updatedAt: new Date() })
    .where(eq(usuarios.id, userId))
    .returning();
  if (!updated) throw new Error('Não foi possível atualizar o e-mail.');

  const user = authUserFromRow(updated);
  const token = await tokenForUser(user);
  return { user, token };
}

export async function alterarSenhaUsuario(
  db: Db,
  userId: number,
  input: {
    senha_atual: string;
    senha_nova: string;
    senha_nova_confirmacao: string;
  },
): Promise<void> {
  const senhaAtual = input.senha_atual?.trim();
  const senhaNova = input.senha_nova?.trim();
  const confirmacao = input.senha_nova_confirmacao?.trim();
  if (!senhaAtual) throw new Error('Senha atual é obrigatória.');
  if (!senhaNova) throw new Error('Nova senha é obrigatória.');
  if (senhaNova !== confirmacao) {
    throw new Error('A confirmação da nova senha não coincide.');
  }
  if (senhaNova.length < 6) {
    throw new Error('A nova senha deve ter pelo menos 6 caracteres.');
  }

  const row = await getUsuarioRowById(db, userId);
  const valid = await verifySenha(senhaAtual, row.senhaHash);
  if (!valid) throw new Error('Senha atual incorreta.');

  const senhaHash = await hashSenha(senhaNova);
  const [updated] = await db
    .update(usuarios)
    .set({ senhaHash, updatedAt: new Date() })
    .where(eq(usuarios.id, userId))
    .returning();
  if (!updated) throw new Error('Não foi possível atualizar a senha.');
}
