import type {
  whatsappConnectionStatusEnum,
  whatsappProviderEnum,
} from '../../db/schema';

export type WhatsappProviderType =
  (typeof whatsappProviderEnum.enumValues)[number];

export type WhatsappConnectionStatus =
  (typeof whatsappConnectionStatusEnum.enumValues)[number];

export type WhatsappConfigRow = {
  id: number;
  provider: WhatsappProviderType;
  apiBaseUrl: string | null;
  apiKey: string | null;
  instanceName: string | null;
  numeroSalao: string | null;
  nomeEmpresa: string | null;
  connectionStatus: WhatsappConnectionStatus;
  connectionCheckedAt: Date | null;
  ativo: boolean;
};

export type WhatsappSendParams = {
  to: string;
  text: string;
};

export type ConnectionTestResult = {
  ok: boolean;
  status: WhatsappConnectionStatus;
  message: string;
  raw?: unknown;
};

export type SendMessageResult = {
  ok: boolean;
  providerMessageId?: string;
  raw?: unknown;
  errorMessage?: string;
};

export interface WhatsAppProvider {
  readonly type: WhatsappProviderType;
  testConnection(config: WhatsappConfigRow): Promise<ConnectionTestResult>;
  sendText(
    config: WhatsappConfigRow,
    params: WhatsappSendParams,
  ): Promise<SendMessageResult>;
}
