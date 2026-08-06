import { EvolutionProvider } from './evolution.provider';
import type {
  WhatsappProviderType,
  WhatsAppProvider,
} from './whatsapp-provider.interface';

const evolutionProvider = new EvolutionProvider();

const registry: Record<WhatsappProviderType, WhatsAppProvider> = {
  evolution: evolutionProvider,
};

export function getWhatsAppProvider(type: WhatsappProviderType): WhatsAppProvider {
  const provider = registry[type];
  if (!provider) {
    throw new Error(`Provedor WhatsApp não suportado: ${type}`);
  }
  return provider;
}
