import type { FrequenciaRepetirAgendamento } from './agenda-repetir-cascade.models';

/**
 * Gera a linha de descrição (subtítulo) para cada opção, com base na data do atendimento.
 * Texto alinhado ao pedido: ex. semanal consoante o dia, “14 dias” para 2 semanas, etc.
 */
export function descricaoFrequenciaParaData(
  f: FrequenciaRepetirAgendamento,
  data: Date,
): string {
  const diaM = data.getDate();

  switch (f) {
    case 'diario':
      return 'Inclui todos os dias, inclusive fins de semana';
    case 'semanal':
      return fraseDiaSemanalPT(data);
    case 'duas_semanas':
      return '14 dias entre ocorrências';
    case 'um_mes':
      return `Todo dia ${diaM} de cada mês`;
    case 'dois_meses':
      return '2 meses entre ocorrências';
    default:
      return '';
  }
}

function fraseDiaSemanalPT(d: Date): string {
  const w = d.getDay();
  if (w === 0) return 'Todo o domingo';
  if (w === 6) return 'Todo o sábado';
  if (w === 1) return 'Toda a segunda-feira';
  if (w === 2) return 'Toda a terça-feira';
  if (w === 3) return 'Toda a quarta-feira';
  if (w === 4) return 'Toda a quinta-feira';
  return 'Toda a sexta-feira';
}
