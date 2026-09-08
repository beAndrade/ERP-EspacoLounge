import type { OrcamentoPrintPayload } from '../models/orcamento-print.models';

function formataMoeda(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

/** Variáveis do template WhatsApp `orcamento`. */
export function variaveisWhatsappOrcamento(
  payload: OrcamentoPrintPayload,
): Record<string, string> {
  const resumo = payload.itens
    .map((it) =>
      it.total > 0
        ? `• ${it.descricao}: ${formataMoeda(it.total)}`
        : `• ${it.descricao}`,
    )
    .join('\n');
  return {
    cliente: payload.clienteNome,
    numero_comanda: payload.numeroComanda || '',
    resumo,
    valor: formataMoeda(payload.total),
  };
}

export function nomeArquivoPdfOrcamento(payload: OrcamentoPrintPayload): string {
  const n = String(payload.numeroComanda ?? '').trim() || 'orcamento';
  const safe = n.replace(/[^\w.-]+/g, '_');
  return `orcamento-${safe}.pdf`;
}

/**
 * Gera PDF a partir do DOM do orçamento (preview) e dispara o download.
 * O WhatsApp Web (wa.me) não anexa arquivos — o PDF fica no download para anexar na conversa.
 */
export async function baixarPdfOrcamentoDoDom(
  elemento: HTMLElement,
  nomeArquivo: string,
): Promise<void> {
  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');

  const canvas = await html2canvas(elemento, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  /**
   * Zoom do OpenAction é fator (1 = 100%), não porcentagem.
   * `100` faz o WhatsApp abrir em zoom máximo; leitores de PC costumam “perdoar”.
   */
  pdf.setDisplayMode(1, 'continuous');

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  /** Margem A4 padrão — evita conteúdo colado nas bordas no viewer do WhatsApp. */
  const marginMm = 14;
  const contentW = pageW - marginMm * 2;
  const contentH = pageH - marginMm * 2;
  const imgW = contentW;
  const imgH = (canvas.height * imgW) / canvas.width;

  let heightLeft = imgH;
  let position = 0;

  pdf.addImage(imgData, 'PNG', marginMm, marginMm + position, imgW, imgH);
  heightLeft -= contentH;

  while (heightLeft > 0) {
    position = heightLeft - imgH;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', marginMm, marginMm + position, imgW, imgH);
    heightLeft -= contentH;
  }

  pdf.save(nomeArquivo);
}

/** Elemento impresso visível no overlay de preview. */
export function elementoOrcamentoPrintNoDom(): HTMLElement | null {
  return document.querySelector(
    'app-orcamento-preview-overlay .orcamento-print',
  ) as HTMLElement | null;
}
