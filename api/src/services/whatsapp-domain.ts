export {
  getWhatsappConfigApi,
  saveWhatsappConfigApi,
  testWhatsappConnectionApi,
  sendWhatsappMessageApi,
  listWhatsappLogsApi,
  type WhatsappConfigApiItem,
  type WhatsappConfigWriteInput,
  type WhatsappSendInput,
  type WhatsappLogApiItem,
} from './whatsapp.service';

export {
  listWhatsappTemplatesApi,
  updateWhatsappTemplateApi,
  renderWhatsappTemplate,
  WHATSAPP_PLACEHOLDERS,
  type WhatsappTemplateApiItem,
} from './whatsapp-templates.service';
