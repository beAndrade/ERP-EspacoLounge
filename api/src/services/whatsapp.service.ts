import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db';
import {
  clientes,
  whatsappConfig,
  whatsappLogs,
  whatsappProviderEnum,
} from '../db/schema';
import { getWhatsAppProvider } from '../infrastructure/integrations/whatsapp/providers/provider-registry';
import type { WhatsappConfigRow } from '../infrastructure/integrations/whatsapp/providers/whatsapp-provider.interface';
import { telefoneParaWhatsappBr } from '../infrastructure/integrations/whatsapp/providers/evolution.provider';
import {
  getWhatsappTemplateByCodigoApi,
  renderWhatsappTemplate,
  tipoFromTemplateCodigo,
  type WhatsappMessageTipo,
} from './whatsapp-templates.service';
import { whatsappMessageTipoEnum } from '../db/schema';

const CONFIG_ID = 1;

export type WhatsappConfigApiItem = {
  id: number;
  provider: (typeof whatsappProviderEnum.enumValues)[number];
  api_base_url: string | null;
  api_key_masked: string | null;
  instance_name: string | null;
  numero_salao: string | null;
  nome_empresa: string | null;
  connection_status: string;
  connection_checked_at: string | null;
  ativo: boolean;
};

export type WhatsappConfigWriteInput = {
  provider?: (typeof whatsappProviderEnum.enumValues)[number];
  api_base_url?: string | null;
  api_key?: string | null;
  instance_name?: string | null;
  numero_salao?: string | null;
  nome_empresa?: string | null;
  ativo?: boolean;
};

export type WhatsappSendInput = {
  telefone: string;
  cliente_id?: string | null;
  template_codigo?: string | null;
  variaveis?: Record<string, string | null | undefined>;
  texto?: string | null;
  id_atendimento?: string | null;
};

export type WhatsappLogApiItem = {
  id: number;
  created_at: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  telefone: string;
  tipo: WhatsappMessageTipo;
  template_id: number | null;
  id_atendimento: string | null;
  conteudo: string;
  status: string;
  erro: string | null;
  provider: string;
  provider_message_id: string | null;
};

function maskApiKey(key: string | null | undefined): string | null {
  const k = String(key ?? '').trim();
  if (!k) return null;
  if (k.length <= 4) return '****';
  return `****${k.slice(-4)}`;
}

function mapConfigRow(row: typeof whatsappConfig.$inferSelect): WhatsappConfigRow {
  return {
    id: row.id,
    provider: row.provider,
    apiBaseUrl: row.apiBaseUrl,
    apiKey: row.apiKey,
    instanceName: row.instanceName,
    numeroSalao: row.numeroSalao,
    nomeEmpresa: row.nomeEmpresa,
    connectionStatus: row.connectionStatus,
    connectionCheckedAt: row.connectionCheckedAt,
    ativo: row.ativo,
  };
}

function mapConfigApi(
  row: typeof whatsappConfig.$inferSelect,
): WhatsappConfigApiItem {
  return {
    id: row.id,
    provider: row.provider,
    api_base_url: row.apiBaseUrl,
    api_key_masked: maskApiKey(row.apiKey),
    instance_name: row.instanceName,
    numero_salao: row.numeroSalao,
    nome_empresa: row.nomeEmpresa,
    connection_status: row.connectionStatus,
    connection_checked_at: row.connectionCheckedAt?.toISOString() ?? null,
    ativo: row.ativo,
  };
}

async function ensureConfigRow(db: Db): Promise<typeof whatsappConfig.$inferSelect> {
  const [existing] = await db
    .select()
    .from(whatsappConfig)
    .where(eq(whatsappConfig.id, CONFIG_ID))
    .limit(1);
  if (existing) return existing;

  const [inserted] = await db
    .insert(whatsappConfig)
    .values({ id: CONFIG_ID })
    .onConflictDoNothing()
    .returning();
  if (inserted) return inserted;

  const [row] = await db
    .select()
    .from(whatsappConfig)
    .where(eq(whatsappConfig.id, CONFIG_ID))
    .limit(1);
  if (!row) throw new Error('Não foi possível inicializar configuração WhatsApp.');
  return row;
}

export async function getWhatsappConfigApi(db: Db): Promise<WhatsappConfigApiItem> {
  const row = await ensureConfigRow(db);
  return mapConfigApi(row);
}

export async function saveWhatsappConfigApi(
  db: Db,
  input: WhatsappConfigWriteInput,
): Promise<WhatsappConfigApiItem> {
  await ensureConfigRow(db);

  const patch: Partial<typeof whatsappConfig.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.provider !== undefined) {
    if (!(whatsappProviderEnum.enumValues as readonly string[]).includes(input.provider)) {
      throw new Error('Provedor WhatsApp inválido.');
    }
    patch.provider = input.provider;
  }
  if (input.api_base_url !== undefined) {
    patch.apiBaseUrl = String(input.api_base_url ?? '').trim() || null;
  }
  if (input.api_key !== undefined) {
    const key = String(input.api_key ?? '').trim();
    if (key && !key.startsWith('****')) {
      patch.apiKey = key;
    }
  }
  if (input.instance_name !== undefined) {
    patch.instanceName = String(input.instance_name ?? '').trim() || null;
  }
  if (input.numero_salao !== undefined) {
    patch.numeroSalao = String(input.numero_salao ?? '').trim() || null;
  }
  if (input.nome_empresa !== undefined) {
    patch.nomeEmpresa = String(input.nome_empresa ?? '').trim() || null;
  }
  if (input.ativo !== undefined) patch.ativo = Boolean(input.ativo);

  const [row] = await db
    .update(whatsappConfig)
    .set(patch)
    .where(eq(whatsappConfig.id, CONFIG_ID))
    .returning();
  if (!row) throw new Error('Configuração WhatsApp não encontrada.');
  return mapConfigApi(row);
}

export async function testWhatsappConnectionApi(
  db: Db,
  override?: WhatsappConfigWriteInput,
): Promise<{
  ok: boolean;
  connection_status: string;
  message: string;
}> {
  const row = await ensureConfigRow(db);
  const config = mapConfigRow(row);

  const apiBaseUrl =
    override?.api_base_url !== undefined
      ? String(override.api_base_url ?? '').trim() || null
      : config.apiBaseUrl;
  let apiKey = config.apiKey;
  if (override?.api_key !== undefined) {
    const key = String(override.api_key ?? '').trim();
    if (key && !key.startsWith('****')) apiKey = key;
  }
  const instanceName =
    override?.instance_name !== undefined
      ? String(override.instance_name ?? '').trim() || null
      : config.instanceName;

  const testConfig: WhatsappConfigRow = {
    ...config,
    apiBaseUrl,
    apiKey,
    instanceName,
  };

  const provider = getWhatsAppProvider(testConfig.provider);
  const result = await provider.testConnection(testConfig);

  await db
    .update(whatsappConfig)
    .set({
      connectionStatus: result.status,
      connectionCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(whatsappConfig.id, CONFIG_ID));

  return {
    ok: result.ok,
    connection_status: result.status,
    message: result.message,
  };
}

export async function sendWhatsappMessageApi(
  db: Db,
  input: WhatsappSendInput,
  opts?: { nomeRemetente?: string | null },
): Promise<{ log_id: number; status: string }> {
  const configRow = await ensureConfigRow(db);
  const config = mapConfigRow(configRow);

  if (!config.ativo) {
    throw new Error('Integração WhatsApp está desativada. Ative em Configurações.');
  }

  const telefoneNorm = telefoneParaWhatsappBr(input.telefone);
  if (!telefoneNorm) {
    throw new Error('Telefone inválido para envio.');
  }

  const clienteId = input.cliente_id?.trim() || null;
  let nomeClienteWhatsapp = '';
  if (clienteId) {
    const [cli] = await db
      .select({
        notificacoesAtivo: clientes.notificacoesAtivo,
        nome: clientes.nomeExibido,
        apelido: clientes.apelido,
      })
      .from(clientes)
      .where(eq(clientes.idCliente, clienteId))
      .limit(1);
    if (!cli) throw new Error('Cliente não encontrado.');
    if (!cli.notificacoesAtivo) {
      throw new Error('Cliente desativou notificações por WhatsApp/SMS.');
    }
    nomeClienteWhatsapp =
      String(cli.apelido ?? '').trim() || String(cli.nome ?? '').trim();
  }

  let conteudo = String(input.texto ?? '').trim();
  let tipo: WhatsappMessageTipo = 'manual';
  let templateId: number | null = null;

  const templateCodigo = input.template_codigo?.trim();
  if (templateCodigo) {
    const template = await getWhatsappTemplateByCodigoApi(db, templateCodigo);
    if (!template) throw new Error(`Template "${templateCodigo}" não encontrado.`);
    if (!template.ativo) throw new Error(`Template "${templateCodigo}" está inativo.`);
    const vars = {
      ...(input.variaveis ?? {}),
      /** Apelido (ou nome) do cadastro — variável `{{cliente}}`. */
      cliente:
        nomeClienteWhatsapp ||
        String(input.variaveis?.cliente ?? '').trim(),
      empresa: input.variaveis?.empresa ?? config.nomeEmpresa ?? '',
      profissional:
        String(opts?.nomeRemetente ?? '').trim() ||
        String(input.variaveis?.profissional ?? '').trim(),
    };
    conteudo = renderWhatsappTemplate(template.corpo, vars);
    tipo = tipoFromTemplateCodigo(template.codigo);
    templateId = template.id;
  }

  if (!conteudo) {
    throw new Error('Informe um template ou texto para envio.');
  }

  const [logRow] = await db
    .insert(whatsappLogs)
    .values({
      clienteId,
      telefone: telefoneNorm,
      tipo,
      templateId,
      idAtendimento: input.id_atendimento?.trim() || null,
      conteudo,
      status: 'pending',
      provider: config.provider,
    })
    .returning({ id: whatsappLogs.id });

  const logId = logRow?.id;
  if (!logId) throw new Error('Falha ao registrar log de envio.');

  const provider = getWhatsAppProvider(config.provider);
  const result = await provider.sendText(config, {
    to: telefoneNorm,
    text: conteudo,
  });

  if (result.ok) {
    await db
      .update(whatsappLogs)
      .set({
        status: 'sent',
        providerMessageId: result.providerMessageId ?? null,
        erro: null,
      })
      .where(eq(whatsappLogs.id, logId));
    return { log_id: logId, status: 'sent' };
  }

  const errMsg = result.errorMessage ?? 'Falha ao enviar mensagem.';
  await db
    .update(whatsappLogs)
    .set({
      status: 'failed',
      erro: errMsg,
    })
    .where(eq(whatsappLogs.id, logId));
  throw new Error(errMsg);
}

export async function listWhatsappLogsApi(
  db: Db,
  opts: {
    page?: number;
    pageSize?: number;
    clienteId?: string | null;
    tipo?: string | null;
  },
): Promise<{ items: WhatsappLogApiItem[]; total: number; page: number; page_size: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (opts.clienteId?.trim()) {
    conditions.push(eq(whatsappLogs.clienteId, opts.clienteId.trim()));
  }
  if (opts.tipo?.trim()) {
    const t = opts.tipo.trim();
    if ((whatsappMessageTipoEnum.enumValues as readonly string[]).includes(t)) {
      conditions.push(eq(whatsappLogs.tipo, t as WhatsappMessageTipo));
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(whatsappLogs)
    .where(whereClause);
  const total = countRow?.n ?? 0;

  const rows = await db
    .select({
      log: whatsappLogs,
      clienteNome: clientes.nomeExibido,
    })
    .from(whatsappLogs)
    .leftJoin(clientes, eq(whatsappLogs.clienteId, clientes.idCliente))
    .where(whereClause)
    .orderBy(desc(whatsappLogs.createdAt), desc(whatsappLogs.id))
    .limit(pageSize)
    .offset(offset);

  const items: WhatsappLogApiItem[] = rows.map(({ log, clienteNome }) => ({
    id: log.id,
    created_at: log.createdAt.toISOString(),
    cliente_id: log.clienteId,
    cliente_nome: clienteNome,
    telefone: log.telefone,
    tipo: log.tipo,
    template_id: log.templateId,
    id_atendimento: log.idAtendimento,
    conteudo: log.conteudo,
    status: log.status,
    erro: log.erro,
    provider: log.provider,
    provider_message_id: log.providerMessageId,
  }));

  return { items, total, page, page_size: pageSize };
}
