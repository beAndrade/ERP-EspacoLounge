import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db';
import {
  whatsappMessageTipoEnum,
  whatsappTemplates,
} from '../db/schema';

export type WhatsappMessageTipo =
  (typeof whatsappMessageTipoEnum.enumValues)[number];

export type WhatsappTemplateApiItem = {
  id: number;
  codigo: string;
  nome: string;
  corpo: string;
  ativo: boolean;
  ordem: number;
};

const PLACEHOLDER_RE = /\{\{([a-zA-Z0-9_]+)\}\}/g;

export function renderWhatsappTemplate(
  corpo: string,
  variaveis: Record<string, string | null | undefined>,
): string {
  return String(corpo ?? '').replace(PLACEHOLDER_RE, (_match, key: string) => {
    const val = variaveis[key];
    return val != null ? String(val) : '';
  });
}

function mapTemplateRow(row: typeof whatsappTemplates.$inferSelect): WhatsappTemplateApiItem {
  return {
    id: row.id,
    codigo: row.codigo,
    nome: row.nome,
    corpo: row.corpo,
    ativo: row.ativo,
    ordem: row.ordem,
  };
}

export async function listWhatsappTemplatesApi(db: Db): Promise<WhatsappTemplateApiItem[]> {
  const rows = await db
    .select()
    .from(whatsappTemplates)
    .orderBy(asc(whatsappTemplates.ordem), asc(whatsappTemplates.id));
  return rows.map(mapTemplateRow);
}

export async function getWhatsappTemplateByCodigoApi(
  db: Db,
  codigo: string,
): Promise<WhatsappTemplateApiItem | null> {
  const [row] = await db
    .select()
    .from(whatsappTemplates)
    .where(eq(whatsappTemplates.codigo, codigo))
    .limit(1);
  return row ? mapTemplateRow(row) : null;
}

export async function getWhatsappTemplateByIdApi(
  db: Db,
  id: number,
): Promise<WhatsappTemplateApiItem | null> {
  const [row] = await db
    .select()
    .from(whatsappTemplates)
    .where(eq(whatsappTemplates.id, id))
    .limit(1);
  return row ? mapTemplateRow(row) : null;
}

export async function updateWhatsappTemplateApi(
  db: Db,
  id: number,
  input: { corpo?: string; ativo?: boolean; nome?: string },
): Promise<void> {
  const existing = await getWhatsappTemplateByIdApi(db, id);
  if (!existing) throw new Error('Template não encontrado.');

  const patch: Partial<typeof whatsappTemplates.$inferInsert> = {};
  if (input.corpo !== undefined) {
    const corpo = String(input.corpo).trim();
    if (!corpo) throw new Error('Corpo do template não pode ser vazio.');
    patch.corpo = corpo;
  }
  if (input.ativo !== undefined) patch.ativo = Boolean(input.ativo);
  if (input.nome !== undefined) {
    const nome = String(input.nome).trim();
    if (!nome) throw new Error('Nome do template não pode ser vazio.');
    patch.nome = nome;
  }

  if (Object.keys(patch).length === 0) return;

  await db.update(whatsappTemplates).set(patch).where(eq(whatsappTemplates.id, id));
}

export function tipoFromTemplateCodigo(codigo: string): WhatsappMessageTipo {
  const c = codigo.trim().toLowerCase();
  const values = whatsappMessageTipoEnum.enumValues;
  if ((values as readonly string[]).includes(c)) {
    return c as WhatsappMessageTipo;
  }
  return 'manual';
}

export const WHATSAPP_PLACEHOLDERS = [
  'cliente',
  'empresa',
  'data',
  'hora',
  'profissional',
  'valor',
] as const;
