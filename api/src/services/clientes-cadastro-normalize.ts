/**
 * Cadastro de cliente: todos os campos em colunas SQL (`clientes.*`).
 * O body da API aceita campos explícitos e/ou `notas` JSON legado `{ _elCli: 1, … }`.
 */

import type { InferSelectModel } from 'drizzle-orm';
import type { clientes } from '../db/schema';

export type ClienteRowDb = InferSelectModel<typeof clientes>;

export type ClienteCadastroBody = {
  nome?: string;
  telefone?: string | null;
  /** JSON legado do drawer (Comandas); sobrescreve campos explícitos quando válido. */
  notas?: string | null;
  apelido?: string | null;
  email?: string | null;
  celular?: string | null;
  telefoneFixo?: string | null;
  aniversario?: string | null;
  cnpj?: string | null;
  cpf?: string | null;
  rg?: string | null;
  fotoUrl?: string | null;
  notificacoesAtivo?: boolean | null;
  descontoPadraoTexto?: string | null;
  descontoPadraoModo?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  enderecoNumero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  estado?: string | null;
  cidade?: string | null;
  instagram?: string | null;
  facebook?: string | null;
};

type Draft = {
  apelido: string;
  email: string;
  celular: string;
  telefoneFixo: string;
  aniversario: string;
  cnpj: string;
  cpf: string;
  rg: string;
  fotoUrl: string;
  descontoPadraoTexto: string;
  descontoPadraoModo: string;
  notificacoesAtivo: boolean | undefined;
  cep: string;
  logradouro: string;
  enderecoNumero: string;
  complemento: string;
  bairro: string;
  estado: string;
  cidade: string;
  instagram: string;
  facebook: string;
};

const EMPTY: Draft = {
  apelido: '',
  email: '',
  celular: '',
  telefoneFixo: '',
  aniversario: '',
  cnpj: '',
  cpf: '',
  rg: '',
  fotoUrl: '',
  descontoPadraoTexto: '',
  descontoPadraoModo: '',
  notificacoesAtivo: undefined,
  cep: '',
  logradouro: '',
  enderecoNumero: '',
  complemento: '',
  bairro: '',
  estado: '',
  cidade: '',
  instagram: '',
  facebook: '',
};

function str(v: unknown): string {
  return v != null ? String(v).trim() : '';
}

function toNull(s: string): string | null {
  return s.trim() ? s.trim() : null;
}

function parseNotasJson(notas: string | null | undefined): Draft | null {
  if (notas == null || !String(notas).trim()) return null;
  const raw = String(notas).trim();
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== 'object' || o._elCli !== 1) return null;
    return {
      apelido: str(o.apelido),
      email: str(o.email),
      celular: str(o.celular),
      telefoneFixo: str(o.telefoneFixo),
      aniversario: str(o.aniversario),
      cnpj: str(o.cnpj),
      cpf: str(o.cpf),
      rg: str(o.rg),
      fotoUrl: str(o.fotoUrl),
      descontoPadraoTexto: str(o.descontoPadraoTexto),
      descontoPadraoModo: str(o.descontoPadraoModo),
      notificacoesAtivo:
        typeof o.notificacoesAtivo === 'boolean'
          ? o.notificacoesAtivo
          : undefined,
      cep: str(o.cep),
      logradouro: str(o.logradouro),
      enderecoNumero: str(o.enderecoNumero ?? o.numero),
      complemento: str(o.complemento),
      bairro: str(o.bairro),
      estado: str(o.estado),
      cidade: str(o.cidade),
      instagram: str(o.instagram),
      facebook: str(o.facebook),
    };
  } catch {
    return null;
  }
}

function draftFromExplicit(body: ClienteCadastroBody): Draft {
  return {
    apelido: str(body.apelido),
    email: str(body.email),
    celular: str(body.celular),
    telefoneFixo: str(body.telefoneFixo),
    aniversario: str(body.aniversario),
    cnpj: str(body.cnpj),
    cpf: str(body.cpf),
    rg: str(body.rg),
    fotoUrl: str(body.fotoUrl),
    descontoPadraoTexto: str(body.descontoPadraoTexto),
    descontoPadraoModo: str(body.descontoPadraoModo),
    notificacoesAtivo:
      body.notificacoesAtivo === true || body.notificacoesAtivo === false
        ? body.notificacoesAtivo
        : undefined,
    cep: str(body.cep),
    logradouro: str(body.logradouro),
    enderecoNumero: str(body.enderecoNumero),
    complemento: str(body.complemento),
    bairro: str(body.bairro),
    estado: str(body.estado),
    cidade: str(body.cidade),
    instagram: str(body.instagram),
    facebook: str(body.facebook),
  };
}

function mergeDraft(base: Draft, overlay: Draft): Draft {
  const pick = (k: keyof Draft, useBool = false) => {
    if (useBool) {
      const v = overlay[k];
      if (v !== undefined) return v;
      return base[k];
    }
    const v = overlay[k];
    if (typeof v === 'string' && v.trim()) return v;
    return base[k];
  };
  return {
    apelido: pick('apelido') as string,
    email: pick('email') as string,
    celular: pick('celular') as string,
    telefoneFixo: pick('telefoneFixo') as string,
    aniversario: pick('aniversario') as string,
    cnpj: pick('cnpj') as string,
    cpf: pick('cpf') as string,
    rg: pick('rg') as string,
    fotoUrl: pick('fotoUrl') as string,
    descontoPadraoTexto: pick('descontoPadraoTexto') as string,
    descontoPadraoModo: pick('descontoPadraoModo') as string,
    notificacoesAtivo: pick('notificacoesAtivo', true) as boolean | undefined,
    cep: pick('cep') as string,
    logradouro: pick('logradouro') as string,
    enderecoNumero: pick('enderecoNumero') as string,
    complemento: pick('complemento') as string,
    bairro: pick('bairro') as string,
    estado: pick('estado') as string,
    cidade: pick('cidade') as string,
    instagram: pick('instagram') as string,
    facebook: pick('facebook') as string,
  };
}

const EXPLICIT_KEYS: (keyof ClienteCadastroBody)[] = [
  'apelido',
  'email',
  'celular',
  'telefoneFixo',
  'aniversario',
  'cnpj',
  'cpf',
  'rg',
  'fotoUrl',
  'notificacoesAtivo',
  'descontoPadraoTexto',
  'descontoPadraoModo',
  'cep',
  'logradouro',
  'enderecoNumero',
  'complemento',
  'bairro',
  'estado',
  'cidade',
  'instagram',
  'facebook',
];

function hasExplicitCadastro(body: ClienteCadastroBody): boolean {
  return EXPLICIT_KEYS.some((k) => body[k] !== undefined);
}

/** Monta patch de colunas a partir do body (POST/PATCH). */
export function columnPatchFromClienteBody(
  body: ClienteCadastroBody,
  opts?: { partial?: boolean },
): Partial<ClienteRowDb> {
  const fromJson = parseNotasJson(body.notas);
  if (opts?.partial && !fromJson && !hasExplicitCadastro(body)) {
    return {};
  }

  const draft = fromJson
    ? mergeDraft(draftFromExplicit(body), fromJson)
    : draftFromExplicit(body);

  const patch: Partial<ClienteRowDb> = {
    apelido: toNull(draft.apelido),
    email: toNull(draft.email),
    celular: toNull(draft.celular),
    telefoneFixo: toNull(draft.telefoneFixo),
    aniversario: toNull(draft.aniversario),
    cnpj: toNull(draft.cnpj),
    cpf: toNull(draft.cpf),
    rg: toNull(draft.rg),
    fotoUrl: toNull(draft.fotoUrl),
    descontoPadraoTexto: toNull(draft.descontoPadraoTexto),
    descontoPadraoModo: toNull(draft.descontoPadraoModo),
    cep: toNull(draft.cep),
    logradouro: toNull(draft.logradouro),
    enderecoNumero: toNull(draft.enderecoNumero),
    complemento: toNull(draft.complemento),
    bairro: toNull(draft.bairro),
    estado: toNull(draft.estado),
    cidade: toNull(draft.cidade),
    instagram: toNull(draft.instagram),
    facebook: toNull(draft.facebook),
  };

  if (draft.notificacoesAtivo !== undefined) {
    patch.notificacoesAtivo = draft.notificacoesAtivo;
  }

  if (!opts?.partial) {
    return patch;
  }

  const partial: Partial<ClienteRowDb> = {};
  const keys: (keyof ClienteCadastroBody)[] = [
    'apelido',
    'email',
    'celular',
    'telefoneFixo',
    'aniversario',
    'cnpj',
    'cpf',
    'rg',
    'fotoUrl',
    'descontoPadraoTexto',
    'descontoPadraoModo',
    'cep',
    'logradouro',
    'enderecoNumero',
    'complemento',
    'bairro',
    'estado',
    'cidade',
    'instagram',
    'facebook',
  ];
  for (const k of keys) {
    if (body[k] !== undefined) {
      partial[k as keyof ClienteRowDb] = patch[k as keyof ClienteRowDb] as never;
    }
  }
  if (body.notificacoesAtivo !== undefined) {
    partial.notificacoesAtivo = patch.notificacoesAtivo;
  }
  return partial;
}

function creditoSaldoNum(v: unknown): number {
  const n = parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Linha SQL → objeto plano na API. */
export function mapClienteRowToApi(r: ClienteRowDb) {
  return {
    id: String(r.idCliente || ''),
    nome: String(r.nomeExibido || ''),
    telefone:
      r.telefone != null && r.telefone !== '' ? String(r.telefone) : null,
    apelido: r.apelido != null && r.apelido !== '' ? String(r.apelido) : null,
    email: r.email != null && r.email !== '' ? String(r.email) : null,
    celular: r.celular != null && r.celular !== '' ? String(r.celular) : null,
    telefoneFixo:
      r.telefoneFixo != null && r.telefoneFixo !== ''
        ? String(r.telefoneFixo)
        : null,
    aniversario:
      r.aniversario != null && r.aniversario !== ''
        ? String(r.aniversario)
        : null,
    cnpj: r.cnpj != null && r.cnpj !== '' ? String(r.cnpj) : null,
    cpf: r.cpf != null && r.cpf !== '' ? String(r.cpf) : null,
    rg: r.rg != null && r.rg !== '' ? String(r.rg) : null,
    fotoUrl:
      r.fotoUrl != null && r.fotoUrl !== '' ? String(r.fotoUrl) : null,
    notificacoesAtivo: r.notificacoesAtivo,
    descontoPadraoTexto:
      r.descontoPadraoTexto != null && r.descontoPadraoTexto !== ''
        ? String(r.descontoPadraoTexto)
        : null,
    descontoPadraoModo:
      r.descontoPadraoModo != null && r.descontoPadraoModo !== ''
        ? String(r.descontoPadraoModo)
        : null,
    cep: r.cep != null && r.cep !== '' ? String(r.cep) : null,
    logradouro:
      r.logradouro != null && r.logradouro !== ''
        ? String(r.logradouro)
        : null,
    enderecoNumero:
      r.enderecoNumero != null && r.enderecoNumero !== ''
        ? String(r.enderecoNumero)
        : null,
    complemento:
      r.complemento != null && r.complemento !== ''
        ? String(r.complemento)
        : null,
    bairro: r.bairro != null && r.bairro !== '' ? String(r.bairro) : null,
    estado: r.estado != null && r.estado !== '' ? String(r.estado) : null,
    cidade: r.cidade != null && r.cidade !== '' ? String(r.cidade) : null,
    instagram:
      r.instagram != null && r.instagram !== '' ? String(r.instagram) : null,
    facebook:
      r.facebook != null && r.facebook !== '' ? String(r.facebook) : null,
    creditoSaldo: creditoSaldoNum(r.creditoSaldo),
  };
}
