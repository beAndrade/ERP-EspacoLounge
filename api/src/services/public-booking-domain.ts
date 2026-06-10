import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../db';
import {
  atendimentos,
  clientes,
  profissionais,
  servicos,
} from '../db/schema';
import { createAtendimento } from './atendimentos-domain';
import { allocNextClienteClId, listServicosForApi } from './queries';
import {
  addMinutesToParts,
  formatSqlLocalDateTime,
  parseSqlLocalDateTime,
} from '../lib/sql-local-datetime';

const HORA_ABERTURA = 8;
const HORA_FECHAMENTO = 20;
const INTERVALO_MINUTOS = 30;

export async function listServicosPublic(db: Db) {
  const items = await listServicosForApi(db);
  return items
    .filter((s) => String(s.Serviço || '').trim())
    .map((s) => ({
      id: s.id,
      nome: String(s.Serviço || '').trim(),
      tipo: s.Tipo ? String(s.Tipo).trim() : null,
      duracao_minutos: s.duracao_minutos ?? 30,
    }));
}

export async function listProfissionaisPublic(db: Db) {
  const rows = await db
    .select({
      id: profissionais.id,
      nome: profissionais.nome,
      apelido: profissionais.apelido,
    })
    .from(profissionais)
    .where(
      and(
        eq(profissionais.ativo, true),
        eq(profissionais.gerarAgenda, true),
        eq(profissionais.disponivelAgendamentoOnline, true),
      ),
    )
    .orderBy(asc(profissionais.ordem), asc(profissionais.nome));
  return rows.map((r) => ({
    id: r.id,
    nome: String(r.nome || '').trim(),
    apelido: r.apelido ? String(r.apelido).trim() : null,
  }));
}

function ymdFromDate(d: string | Date | null): string | null {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function duracaoServicoMinutos(
  row: {
    duracaoMinutos: number;
    duracaoCurto: number | null;
    duracaoMedio: number | null;
    duracaoMedioLongo: number | null;
    duracaoLongo: number | null;
    tipo: string | null;
  },
  tamanho?: string,
): number {
  const base = Number(row.duracaoMinutos) || 30;
  const t = String(tamanho || '').trim().toLowerCase();
  if (row.tipo === 'Tamanho' && t) {
    if (t === 'curto' && row.duracaoCurto) return row.duracaoCurto;
    if (t === 'médio' || t === 'medio') {
      if (row.duracaoMedio) return row.duracaoMedio;
    }
    if ((t === 'm/l' || t === 'm-l') && row.duracaoMedioLongo) {
      return row.duracaoMedioLongo;
    }
    if (t === 'longo' && row.duracaoLongo) return row.duracaoLongo;
  }
  return base;
}

function minutosDoDia(isoLocal: string): number | null {
  const p = parseSqlLocalDateTime(isoLocal);
  if (!p) return null;
  return p.hours * 60 + p.minutes;
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export async function listSlotsDisponiveisPublic(
  db: Db,
  opts: {
    profissional_id: number;
    data: string;
    servico_id: string;
    tamanho?: string;
  },
): Promise<{ slots: string[]; duracao_minutos: number }> {
  const data = opts.data.trim();
  const profId = opts.profissional_id;
  const servicoId = opts.servico_id.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error('Data inválida.');
  }
  if (!Number.isFinite(profId) || profId <= 0) {
    throw new Error('Profissional inválido.');
  }
  if (!servicoId) throw new Error('Serviço é obrigatório.');

  const [prof] = await db
    .select({ id: profissionais.id })
    .from(profissionais)
    .where(
      and(
        eq(profissionais.id, profId),
        eq(profissionais.ativo, true),
        eq(profissionais.disponivelAgendamentoOnline, true),
      ),
    )
    .limit(1);
  if (!prof) throw new Error('Profissional não disponível para agendamento online.');

  const servicoLine = Number.parseInt(servicoId, 10);
  if (!Number.isFinite(servicoLine) || servicoLine <= 0) {
    throw new Error('Serviço inválido.');
  }
  const [svc] = await db
    .select()
    .from(servicos)
    .where(eq(servicos.id, servicoLine))
    .limit(1);
  if (!svc) throw new Error('Serviço não encontrado.');

  const duracao = duracaoServicoMinutos(svc, opts.tamanho);

  const ocupados = await db
    .select({
      inicio: atendimentos.inicio,
      fim: atendimentos.fim,
    })
    .from(atendimentos)
    .where(
      and(
        eq(atendimentos.profissionalId, profId),
        eq(atendimentos.data, data),
      ),
    );

  const blocos: { start: number; end: number }[] = [];
  for (const o of ocupados) {
    const ini = o.inicio ? String(o.inicio).trim() : '';
    const fim = o.fim ? String(o.fim).trim() : '';
    if (!ini) continue;
    const start = minutosDoDia(ini);
    let end = fim ? minutosDoDia(fim) : null;
    if (start == null) continue;
    if (end == null || end <= start) end = start + duracao;
    blocos.push({ start, end });
  }

  const slots: string[] = [];
  const abertura = HORA_ABERTURA * 60;
  const fechamento = HORA_FECHAMENTO * 60;

  for (let m = abertura; m + duracao <= fechamento; m += INTERVALO_MINUTOS) {
    const end = m + duracao;
    const conflito = blocos.some((b) => overlaps(m, end, b.start, b.end));
    if (!conflito) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      slots.push(`${hh}:${mm}`);
    }
  }

  return { slots, duracao_minutos: duracao };
}

function telefoneDigitos(raw: string): string {
  return raw.replace(/\D/g, '');
}

async function resolverOuCriarCliente(
  db: Db,
  nome: string,
  telefone: string,
  email?: string,
): Promise<string> {
  const tel = telefone.trim();
  const dig = telefoneDigitos(tel);
  if (!dig || dig.length < 10) {
    throw new Error('Telefone inválido. Informe DDD + número.');
  }

  const rows = await db.select().from(clientes);
  for (const c of rows) {
    const cDig = telefoneDigitos(String(c.telefone || c.celular || ''));
    if (cDig && cDig === dig) {
      return c.idCliente;
    }
  }

  const id = await allocNextClienteClId(db);
  await db.insert(clientes).values({
    idCliente: id,
    nomeExibido: nome.trim(),
    telefone: tel,
    celular: tel,
    email: email?.trim() || null,
  });
  return id;
}

export async function criarAgendamentoPublico(
  db: Db,
  input: {
    nome: string;
    telefone: string;
    email?: string;
    servico_id: string;
    profissional_id: number;
    data: string;
    hora: string;
    tamanho?: string;
    observacao?: string;
  },
) {
  const nome = input.nome.trim();
  const data = input.data.trim();
  const hora = input.hora.trim();
  if (!nome) throw new Error('Nome é obrigatório.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Data inválida.');
  if (!/^\d{2}:\d{2}$/.test(hora)) throw new Error('Horário inválido.');

  const { slots } = await listSlotsDisponiveisPublic(db, {
    profissional_id: input.profissional_id,
    data,
    servico_id: input.servico_id,
    tamanho: input.tamanho,
  });
  if (!slots.includes(hora)) {
    throw new Error('Horário não está mais disponível. Escolha outro horário.');
  }

  const clienteId = await resolverOuCriarCliente(
    db,
    nome,
    input.telefone,
    input.email,
  );

  const [h, min] = hora.split(':').map(Number);
  const inicio = formatSqlLocalDateTime({
    year: Number(data.slice(0, 4)),
    month: Number(data.slice(5, 7)),
    day: Number(data.slice(8, 10)),
    hours: h!,
    minutes: min!,
    seconds: 0,
  });

  const servicoLine = Number.parseInt(input.servico_id, 10);
  const [svc] =
    Number.isFinite(servicoLine) && servicoLine > 0
      ? await db
          .select()
          .from(servicos)
          .where(eq(servicos.id, servicoLine))
          .limit(1)
      : [];
  const duracao = svc ? duracaoServicoMinutos(svc, input.tamanho) : 30;
  const pIni = parseSqlLocalDateTime(inicio!);
  const fimParts = pIni ? addMinutesToParts(pIni, duracao) : null;
  const fim = fimParts ? formatSqlLocalDateTime(fimParts) : null;

  const result = await createAtendimento(db, {
    tipo: 'Serviço',
    cliente_id: clienteId,
    data,
    profissional_id: input.profissional_id,
    servico_id: String(servicoLine),
    tamanho: input.tamanho,
    observacao: input.observacao?.trim() || 'Agendamento online',
    inicio,
    fim,
    agenda_status: 'confirmado',
  } as Parameters<typeof createAtendimento>[1]);

  return {
    id_atendimento: result.id,
    cliente_id: clienteId,
    data,
    hora,
  };
}
