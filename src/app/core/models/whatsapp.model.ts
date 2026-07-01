export type WhatsappProvider = 'evolution';

export type WhatsappConnectionStatus =
  | 'unknown'
  | 'open'
  | 'close'
  | 'connecting'
  | 'error';

export type WhatsappMessageTipo =
  | 'confirmacao'
  | 'lembrete'
  | 'cobranca'
  | 'aniversario'
  | 'manual';

export type WhatsappLogStatus = 'pending' | 'sent' | 'failed';

export interface WhatsappConfig {
  id: number;
  provider: WhatsappProvider;
  api_base_url: string | null;
  api_key_masked: string | null;
  instance_name: string | null;
  numero_salao: string | null;
  nome_empresa: string | null;
  connection_status: WhatsappConnectionStatus;
  connection_checked_at: string | null;
  ativo: boolean;
}

export interface WhatsappConfigPayload {
  provider?: WhatsappProvider;
  api_base_url?: string | null;
  api_key?: string | null;
  instance_name?: string | null;
  numero_salao?: string | null;
  nome_empresa?: string | null;
  ativo?: boolean;
}

export interface WhatsappTemplate {
  id: number;
  codigo: string;
  nome: string;
  corpo: string;
  ativo: boolean;
  ordem: number;
}

export interface WhatsappTemplateUpdatePayload {
  corpo?: string;
  ativo?: boolean;
  nome?: string;
}

export interface WhatsappSendPayload {
  telefone: string;
  cliente_id?: string;
  template_codigo?: string;
  variaveis?: Record<string, string>;
  texto?: string;
  id_atendimento?: string;
}

export interface WhatsappSendResult {
  log_id: number;
  status: WhatsappLogStatus;
}

export interface WhatsappLogItem {
  id: number;
  created_at: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  telefone: string;
  tipo: WhatsappMessageTipo;
  template_id: number | null;
  id_atendimento: string | null;
  conteudo: string;
  status: WhatsappLogStatus;
  erro: string | null;
  provider: string;
  provider_message_id: string | null;
}

export interface WhatsappLogsPage {
  items: WhatsappLogItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface WhatsappConnectionTestResult {
  ok: boolean;
  connection_status: WhatsappConnectionStatus;
  message: string;
}

export const WHATSAPP_PLACEHOLDERS = [
  'cliente',
  'empresa',
  'data',
  'hora',
  'profissional',
  'valor',
] as const;

export type WhatsappPlaceholder = (typeof WHATSAPP_PLACEHOLDERS)[number];

export interface WhatsappEnviarContexto {
  telefone: string;
  clienteId?: string;
  clienteNome?: string;
  idAtendimento?: string;
  templateCodigo?: string;
  variaveis?: Record<string, string>;
}
