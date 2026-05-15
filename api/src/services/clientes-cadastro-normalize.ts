/**
 * Cadastro de cliente: campos estruturados em colunas SQL (`clientes.*`)
 * e extras (foto, desconto padrão, texto livre legado) em `observacoes` JSON `{ _elCli: 1, … }`.
 *
 * A API continua a expor `observacoes` como JSON completo para o front actual;
 * na BD persistimos colunas + JSON «slim» só com extras.
 */

export type ClienteStructuredDraft = {
  apelido: string;
  email: string;
  celular: string;
  telefoneFixo: string;
  aniversario: string;
  cnpj: string;
  cpf: string;
  rg: string;
};

const EMPTY_STRUCTURED: ClienteStructuredDraft = {
  apelido: '',
  email: '',
  celular: '',
  telefoneFixo: '',
  aniversario: '',
  cnpj: '',
  cpf: '',
  rg: '',
};

const EXTRAS_KEYS = [
  'fotoUrl',
  'textoLivre',
  'notificacoesAtivo',
  'descontoPadraoTexto',
  'descontoPadraoModo',
] as const;

function str(v: unknown): string {
  return v != null ? String(v).trim() : '';
}

export type ClienteObservacoesFonte = 'empty' | 'plaintext' | 'json_elcli';

/** Interpreta `notas` / `observacoes` vindos do cliente (JSON _elCli ou texto livre). */
export function splitClienteObservacoesInput(
  notas: string | null | undefined,
): {
  structured: ClienteStructuredDraft;
  extras: Record<string, unknown>;
  fonte: ClienteObservacoesFonte;
} {
  if (notas == null || !String(notas).trim()) {
    return {
      structured: { ...EMPTY_STRUCTURED },
      extras: { _elCli: 1 },
      fonte: 'empty',
    };
  }
  const raw = String(notas).trim();
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o && typeof o === 'object' && o._elCli === 1) {
      const structured: ClienteStructuredDraft = {
        apelido: str(o.apelido),
        email: str(o.email),
        celular: str(o.celular),
        telefoneFixo: str(o.telefoneFixo),
        aniversario: str(o.aniversario),
        cnpj: str(o.cnpj),
        cpf: str(o.cpf),
        rg: str(o.rg),
      };
      const extras: Record<string, unknown> = { _elCli: 1 };
      for (const k of EXTRAS_KEYS) {
        if (k in o && o[k] !== undefined) extras[k] = o[k];
      }
      return { structured, extras, fonte: 'json_elcli' };
    }
  } catch {
    /* não JSON */
  }
  return {
    structured: { ...EMPTY_STRUCTURED },
    extras: { _elCli: 1, textoLivre: raw },
    fonte: 'plaintext',
  };
}

/** Coluna `observacoes`: só extras (sem duplicar dados já em colunas). */
export function observacoesColumnFromExtras(
  extras: Record<string, unknown>,
): string | null {
  const keys = Object.keys(extras).filter((k) => k !== '_elCli');
  if (keys.length === 0) return null;
  try {
    return JSON.stringify(extras);
  } catch {
    return null;
  }
}

function coalesceStructured(
  col: string | null | undefined,
  fallback: string,
): string {
  const c = col != null ? String(col).trim() : '';
  if (c) return c;
  return fallback.trim();
}

/**
 * JSON «completo» para `Cliente.observacoes` na API (drawer comandas, agenda, etc.).
 */
export function mergeObservacoesRespostaApi(input: {
  row: Record<string, string | null | undefined>;
}): string | null {
  const parsed = splitClienteObservacoesInput(
    input.row.observacoes != null ? String(input.row.observacoes) : null,
  );
  const structured: ClienteStructuredDraft = {
    apelido: coalesceStructured(input.row.apelido, parsed.structured.apelido),
    email: coalesceStructured(input.row.email, parsed.structured.email),
    celular: coalesceStructured(input.row.celular, parsed.structured.celular),
    telefoneFixo: coalesceStructured(
      input.row.telefoneFixo,
      parsed.structured.telefoneFixo,
    ),
    aniversario: coalesceStructured(
      input.row.aniversario,
      parsed.structured.aniversario,
    ),
    cnpj: coalesceStructured(input.row.cnpj, parsed.structured.cnpj),
    cpf: coalesceStructured(input.row.cpf, parsed.structured.cpf),
    rg: coalesceStructured(input.row.rg, parsed.structured.rg),
  };

  const merged: Record<string, unknown> = {
    ...parsed.extras,
    _elCli: 1,
    ...structured,
  };

  const prune: Record<string, unknown> = { _elCli: 1 };
  for (const [k, v] of Object.entries(merged)) {
    if (k === '_elCli') continue;
    if (typeof v === 'string' && !v.trim()) continue;
    if (v === undefined) continue;
    prune[k] = v;
  }

  try {
    const s = JSON.stringify(prune);
    return Object.keys(prune).length <= 1 ? null : s;
  } catch {
    return null;
  }
}

export function structuredDraftToColumnPatch(
  draft: ClienteStructuredDraft,
): Record<string, string | null> {
  const toNull = (s: string) => (s.trim() ? s.trim() : null);
  return {
    apelido: toNull(draft.apelido),
    email: toNull(draft.email),
    celular: toNull(draft.celular),
    telefoneFixo: toNull(draft.telefoneFixo),
    aniversario: toNull(draft.aniversario),
    cnpj: toNull(draft.cnpj),
    cpf: toNull(draft.cpf),
    rg: toNull(draft.rg),
  };
}
