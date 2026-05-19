/**
 * Uma ocorrência extra além do agendamento base, para N em 1–60
 * (“Além deste, repetir mais N vezes” com o intervalo escolhido).
 */
export type FrequenciaRepetirAgendamento =
  | 'diario'
  | 'semanal'
  | 'duas_semanas'
  | 'um_mes'
  | 'dois_meses';

export type ValorRepetirAgendamento =
  | { modo: 'nenhum' }
  | { modo: 'repetir'; frequencia: FrequenciaRepetirAgendamento; vezes: number };

export const ROTULO_FREQUENCIA: Record<FrequenciaRepetirAgendamento, string> = {
  diario: 'Diário',
  semanal: 'Semanal',
  duas_semanas: 'Duas semanas',
  um_mes: '1 mês',
  dois_meses: '2 meses',
};

export const ITENS_FREQUENCIA: FrequenciaRepetirAgendamento[] = [
  'diario',
  'semanal',
  'duas_semanas',
  'um_mes',
  'dois_meses',
];
