import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { profissionais, usuarios } from '../db/schema';
import { isCelularBr11Digitos, telefoneBrDigitos } from '../shared/utils/telefone-br';
import { parseComissaoListagemModoInput } from './profissional-comissao-domain.js';
import { parseFotoUrlInput } from '../shared/utils/foto-url.js';

export type ProfissionalApiItem = {
  id: number;
  nome: string;
  ativo: boolean;
  celular: string | null;
  apelido: string | null;
  profissao: string | null;
  aniversario: string | null;
  cpf_cnpj: string | null;
  rg: string | null;
  anotacoes: string | null;
  disponivel_agendamento_online: boolean;
  gerar_agenda: boolean;
  recebe_comissao: boolean;
  comissao_listagem_modo: 'pagamento_cliente' | 'competencia';
  cep: string | null;
  logradouro: string | null;
  endereco_numero: string | null;
  complemento: string | null;
  bairro: string | null;
  estado: string | null;
  cidade: string | null;
  foto_url: string | null;
  ordem: number;
  /** Papel da conta de acesso ligada ao profissional (`usuarios.role`), se existir. */
  usuario_role: 'admin' | 'profissional' | null;
  /** E-mail de login da conta ligada (`usuarios.email`), se existir. */
  usuario_email: string | null;
};

export type ProfissionalWriteInput = {
  nome?: string;
  celular?: string;
  apelido?: string | null;
  profissao?: string | null;
  aniversario?: string | null;
  cpf_cnpj?: string | null;
  rg?: string | null;
  anotacoes?: string | null;
  ativo?: boolean;
  disponivel_agendamento_online?: boolean;
  gerar_agenda?: boolean;
  recebe_comissao?: boolean;
  comissao_listagem_modo?: 'pagamento_cliente' | 'competencia';
  cep?: string | null;
  logradouro?: string | null;
  endereco_numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  estado?: string | null;
  cidade?: string | null;
  foto_url?: string | null;
};

const profSelect = {
  id: profissionais.id,
  nome: profissionais.nome,
  ativo: profissionais.ativo,
  celular: profissionais.celular,
  apelido: profissionais.apelido,
  profissao: profissionais.profissao,
  aniversario: profissionais.aniversario,
  cpfCnpj: profissionais.cpfCnpj,
  rg: profissionais.rg,
  anotacoes: profissionais.anotacoes,
  disponivelAgendamentoOnline: profissionais.disponivelAgendamentoOnline,
  gerarAgenda: profissionais.gerarAgenda,
  recebeComissao: profissionais.recebeComissao,
  comissaoListagemModo: profissionais.comissaoListagemModo,
  cep: profissionais.cep,
  logradouro: profissionais.logradouro,
  enderecoNumero: profissionais.enderecoNumero,
  complemento: profissionais.complemento,
  bairro: profissionais.bairro,
  estado: profissionais.estado,
  cidade: profissionais.cidade,
  fotoUrl: profissionais.fotoUrl,
  ordem: profissionais.ordem,
};

function nomeNormalizado(n: string): string {
  return n.trim();
}

function textoOpcional(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

function parseAniversario(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  throw new Error('Aniversário inválido; use DD/MM/AAAA ou AAAA-MM-DD');
}

function mapRow(r: {
  id: number;
  nome: string | null;
  ativo: boolean;
  celular: string | null;
  apelido: string | null;
  profissao: string | null;
  aniversario: string | Date | null;
  cpfCnpj: string | null;
  rg: string | null;
  anotacoes: string | null;
  disponivelAgendamentoOnline: boolean;
  gerarAgenda: boolean;
  recebeComissao: boolean;
  comissaoListagemModo: string | null;
  cep: string | null;
  logradouro: string | null;
  enderecoNumero: string | null;
  complemento: string | null;
  bairro: string | null;
  estado: string | null;
  cidade: string | null;
  fotoUrl: string | null;
  ordem: number;
  usuarioRole?: 'admin' | 'profissional' | null;
  usuarioEmail?: string | null;
}): ProfissionalApiItem {
  let aniversario: string | null = null;
  if (r.aniversario) {
    if (r.aniversario instanceof Date) {
      aniversario = r.aniversario.toISOString().slice(0, 10);
    } else {
      aniversario = String(r.aniversario).slice(0, 10);
    }
  }
  return {
    id: r.id,
    nome: String(r.nome || '').trim(),
    ativo: Boolean(r.ativo),
    celular: r.celular ? String(r.celular).trim() : null,
    apelido: r.apelido ? String(r.apelido).trim() : null,
    profissao: r.profissao ? String(r.profissao).trim() : null,
    aniversario,
    cpf_cnpj: r.cpfCnpj ? String(r.cpfCnpj).trim() : null,
    rg: r.rg ? String(r.rg).trim() : null,
    anotacoes: r.anotacoes ? String(r.anotacoes).trim() : null,
    disponivel_agendamento_online: Boolean(r.disponivelAgendamentoOnline),
    gerar_agenda: Boolean(r.gerarAgenda),
    recebe_comissao: Boolean(r.recebeComissao),
    comissao_listagem_modo: parseComissaoListagemModoInput(r.comissaoListagemModo),
    cep: r.cep ? String(r.cep).trim() : null,
    logradouro: r.logradouro ? String(r.logradouro).trim() : null,
    endereco_numero: r.enderecoNumero ? String(r.enderecoNumero).trim() : null,
    complemento: r.complemento ? String(r.complemento).trim() : null,
    bairro: r.bairro ? String(r.bairro).trim() : null,
    estado: r.estado ? String(r.estado).trim() : null,
    cidade: r.cidade ? String(r.cidade).trim() : null,
    foto_url: r.fotoUrl ? String(r.fotoUrl).trim() : null,
    ordem: Number(r.ordem) || 0,
    usuario_role: r.usuarioRole ?? null,
    usuario_email: r.usuarioEmail ? String(r.usuarioEmail).trim() || null : null,
  };
}

function validarCelularObrigatorio(celular: string): string {
  const digits = telefoneBrDigitos(celular);
  if (!isCelularBr11Digitos(digits)) {
    throw new Error('Celular é obrigatório (DDD + 9 dígitos, 11 no total)');
  }
  return digits;
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

function buildWhereList(opts?: {
  incluirInativos?: boolean;
  contexto?: 'agenda' | 'default';
}) {
  const parts = [];
  if (opts?.contexto === 'agenda') {
    parts.push(eq(profissionais.gerarAgenda, true));
    parts.push(eq(profissionais.ativo, true));
  } else if (opts?.incluirInativos !== true) {
    parts.push(eq(profissionais.ativo, true));
  }
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return and(...parts);
}

async function loadUsuarioMetaByProfissionalId(
  db: Db,
): Promise<Map<number, { role: 'admin' | 'profissional'; email: string }>> {
  const rows = await db
    .select({
      profissionalId: usuarios.profissionalId,
      role: usuarios.role,
      email: usuarios.email,
    })
    .from(usuarios)
    .where(sql`${usuarios.profissionalId} IS NOT NULL`);
  const map = new Map<
    number,
    { role: 'admin' | 'profissional'; email: string }
  >();
  for (const r of rows) {
    const id = r.profissionalId;
    if (id == null || id <= 0) continue;
    const email = String(r.email || '').trim();
    const role = r.role === 'admin' ? 'admin' : 'profissional';
    const prev = map.get(id);
    /** Preferir conta admin se houver mais de uma ligada. */
    if (!prev || (role === 'admin' && prev.role !== 'admin')) {
      map.set(id, { role, email });
    }
  }
  return map;
}

export async function listProfissionaisForApi(
  db: Db,
  opts?: { incluirInativos?: boolean; contexto?: 'agenda' | 'default' },
): Promise<ProfissionalApiItem[]> {
  const where = buildWhereList(opts);
  const usuarioMeta = await loadUsuarioMetaByProfissionalId(db);
  const rows = await db
    .select(profSelect)
    .from(profissionais)
    .where(where)
    .orderBy(asc(profissionais.ordem), asc(profissionais.nome));
  return rows
    .map((r) => {
      const meta = usuarioMeta.get(r.id);
      return mapRow({
        ...r,
        usuarioRole: meta?.role === 'admin' ? 'admin' : meta ? 'profissional' : null,
        usuarioEmail: meta?.email ?? null,
      });
    })
    .filter((x) => x.nome);
}

export async function getProfissionalById(
  db: Db,
  id: number,
): Promise<ProfissionalApiItem | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  const usuarioMeta = await loadUsuarioMetaByProfissionalId(db);
  const [r] = await db
    .select(profSelect)
    .from(profissionais)
    .where(eq(profissionais.id, id))
    .limit(1);
  if (!r) return null;
  const meta = usuarioMeta.get(r.id);
  const item = mapRow({
    ...r,
    usuarioRole: meta?.role === 'admin' ? 'admin' : meta ? 'profissional' : null,
    usuarioEmail: meta?.email ?? null,
  });
  return item.nome ? item : null;
}

export async function profissionalRecebeComissao(
  db: Db,
  profissionalId: number | null | undefined,
): Promise<boolean> {
  if (profissionalId == null || !Number.isFinite(profissionalId)) {
    return true;
  }
  const [r] = await db
    .select({ recebe: profissionais.recebeComissao })
    .from(profissionais)
    .where(eq(profissionais.id, profissionalId))
    .limit(1);
  if (!r) return true;
  return Boolean(r.recebe);
}

function patchFromInput(input: ProfissionalWriteInput): Partial<{
  nome: string;
  celular: string;
  apelido: string | null;
  profissao: string | null;
  aniversario: string | null;
  cpfCnpj: string | null;
  rg: string | null;
  anotacoes: string | null;
  ativo: boolean;
  disponivelAgendamentoOnline: boolean;
  gerarAgenda: boolean;
  recebeComissao: boolean;
  comissaoListagemModo: string;
  cep: string | null;
  logradouro: string | null;
  enderecoNumero: string | null;
  complemento: string | null;
  bairro: string | null;
  estado: string | null;
  cidade: string | null;
  fotoUrl: string | null;
}> {
  const patch: ReturnType<typeof patchFromInput> = {};
  if (input.nome !== undefined) {
    patch.nome = nomeNormalizado(input.nome);
  }
  if (input.celular !== undefined) {
    patch.celular = validarCelularObrigatorio(input.celular);
  }
  if (input.apelido !== undefined) patch.apelido = textoOpcional(input.apelido);
  if (input.profissao !== undefined) {
    patch.profissao = textoOpcional(input.profissao);
  }
  if (input.aniversario !== undefined) {
    patch.aniversario = input.aniversario
      ? parseAniversario(input.aniversario)
      : null;
  }
  if (input.cpf_cnpj !== undefined) {
    patch.cpfCnpj = textoOpcional(input.cpf_cnpj);
  }
  if (input.rg !== undefined) patch.rg = textoOpcional(input.rg);
  if (input.anotacoes !== undefined) {
    patch.anotacoes = textoOpcional(input.anotacoes);
  }
  if (input.ativo !== undefined) patch.ativo = Boolean(input.ativo);
  if (input.disponivel_agendamento_online !== undefined) {
    patch.disponivelAgendamentoOnline = Boolean(
      input.disponivel_agendamento_online,
    );
  }
  if (input.gerar_agenda !== undefined) {
    patch.gerarAgenda = Boolean(input.gerar_agenda);
  }
  if (input.recebe_comissao !== undefined) {
    patch.recebeComissao = Boolean(input.recebe_comissao);
  }
  if (input.comissao_listagem_modo !== undefined) {
    patch.comissaoListagemModo = parseComissaoListagemModoInput(
      input.comissao_listagem_modo,
    );
  }
  if (input.cep !== undefined) patch.cep = textoOpcional(input.cep);
  if (input.logradouro !== undefined) {
    patch.logradouro = textoOpcional(input.logradouro);
  }
  if (input.endereco_numero !== undefined) {
    patch.enderecoNumero = textoOpcional(input.endereco_numero);
  }
  if (input.complemento !== undefined) {
    patch.complemento = textoOpcional(input.complemento);
  }
  if (input.bairro !== undefined) patch.bairro = textoOpcional(input.bairro);
  if (input.estado !== undefined) patch.estado = textoOpcional(input.estado);
  if (input.cidade !== undefined) patch.cidade = textoOpcional(input.cidade);
  if (input.foto_url !== undefined) {
    patch.fotoUrl = parseFotoUrlInput(input.foto_url) ?? null;
  }
  return patch;
}

export async function criarProfissional(
  db: Db,
  input: ProfissionalWriteInput & { nome: string; celular: string },
): Promise<ProfissionalApiItem> {
  const nome = nomeNormalizado(input.nome);
  if (!nome) {
    throw new Error('Nome é obrigatório');
  }
  const celular = validarCelularObrigatorio(input.celular);
  if (await existeNomeOutro(db, nome)) {
    throw new Error('Já existe um profissional com este nome');
  }
  const ativo = input.ativo !== false;
  const disponivelAgendamentoOnline =
    input.disponivel_agendamento_online !== false;
  const gerarAgenda = input.gerar_agenda !== false;
  const recebeComissao = input.recebe_comissao !== false;
  const comissaoListagemModo = parseComissaoListagemModoInput(
    input.comissao_listagem_modo,
  );
  const aniversario =
    input.aniversario != null && String(input.aniversario).trim()
      ? parseAniversario(input.aniversario)
      : null;

  const [maxOrd] = await db
    .select({ m: sql<number>`coalesce(max(${profissionais.ordem}), 0)` })
    .from(profissionais);
  const ordem = Number(maxOrd?.m ?? 0) + 10;

  const [ins] = await db
    .insert(profissionais)
    .values({
      nome,
      celular,
      ordem,
      ativo,
      apelido: textoOpcional(input.apelido),
      profissao: textoOpcional(input.profissao),
      aniversario,
      cpfCnpj: textoOpcional(input.cpf_cnpj),
      rg: textoOpcional(input.rg),
      anotacoes: textoOpcional(input.anotacoes),
      disponivelAgendamentoOnline,
      gerarAgenda,
      recebeComissao,
      comissaoListagemModo,
      cep: textoOpcional(input.cep),
      logradouro: textoOpcional(input.logradouro),
      enderecoNumero: textoOpcional(input.endereco_numero),
      complemento: textoOpcional(input.complemento),
      bairro: textoOpcional(input.bairro),
      estado: textoOpcional(input.estado),
      cidade: textoOpcional(input.cidade),
      fotoUrl:
        input.foto_url !== undefined
          ? (parseFotoUrlInput(input.foto_url) ?? null)
          : null,
    })
    .returning(profSelect);
  if (!ins) throw new Error('Não foi possível criar o profissional');
  return mapRow(ins);
}

export async function atualizarProfissional(
  db: Db,
  id: number,
  input: ProfissionalWriteInput,
): Promise<ProfissionalApiItem> {
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('id inválido');
  }
  const [atual] = await db
    .select(profSelect)
    .from(profissionais)
    .where(eq(profissionais.id, id))
    .limit(1);
  if (!atual) {
    throw new Error('Profissional não encontrado');
  }
  const patch = patchFromInput(input);
  if (patch.nome !== undefined) {
    if (!patch.nome) {
      throw new Error('Nome é obrigatório');
    }
    if (await existeNomeOutro(db, patch.nome, id)) {
      throw new Error('Já existe um profissional com este nome');
    }
  }
  if (Object.keys(patch).length === 0) {
    return mapRow(atual);
  }
  const [upd] = await db
    .update(profissionais)
    .set(patch)
    .where(eq(profissionais.id, id))
    .returning(profSelect);
  if (!upd) throw new Error('Profissional não encontrado');
  return mapRow(upd);
}

/** Atualiza `ordem` na sequência recebida (10, 20, 30…). */
export async function reordenarProfissionais(
  db: Db,
  ids: number[],
): Promise<void> {
  const unique = [...new Set(ids)].filter((id) => Number.isFinite(id) && id > 0);
  if (unique.length === 0) {
    throw new Error('Lista de ids vazia');
  }
  const existentes = await db
    .select({ id: profissionais.id })
    .from(profissionais)
    .where(inArray(profissionais.id, unique));
  if (existentes.length !== unique.length) {
    throw new Error('Um ou mais profissionais não foram encontrados');
  }
  await db.transaction(async (tx) => {
    for (let i = 0; i < unique.length; i++) {
      await tx
        .update(profissionais)
        .set({ ordem: (i + 1) * 10 })
        .where(eq(profissionais.id, unique[i]!));
    }
  });
}
