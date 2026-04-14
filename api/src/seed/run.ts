import { sql } from 'drizzle-orm';
import { db } from '../db';
import {
  atendimentos,
  cabelos,
  clientes,
  despesas,
  folha,
  pacotes,
  pagamentos,
  produtos,
  regrasMega,
  servicos,
} from '../db/schema';
import { normalizeComissaoParaBD } from '../lib/normalize-comissao';
import {
  defaultXlsxPath,
  loadWorkbook,
  parseFlexibleDateToIso,
  resolveSheet,
  rowObjectsCabelos,
  rowObjectsFirstWins,
  rowObjectsFirstWinsWithSheetRow,
  sheetToMatrix,
} from './xlsx';

function pick(
  row: Record<string, string>,
  keys: string[],
): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== '') return row[k]!;
  }
  return '';
}

async function truncateAll() {
  await db.execute(sql.raw(`
    TRUNCATE TABLE
      movimentacoes,
      atendimentos,
      pagamentos,
      despesas,
      folha,
      cabelos,
      regras_mega,
      produtos,
      pacotes,
      servicos,
      clientes
    RESTART IDENTITY CASCADE
  `));
}

export async function seedFromXlsx(options?: { truncate?: boolean }) {
  const shouldTruncate =
    options?.truncate ??
    (process.env.SEED_SKIP_TRUNCATE !== '1' &&
      process.argv.indexOf('--no-truncate') < 0);

  const xlsxPath = defaultXlsxPath();
  console.log('XLSX:', xlsxPath);
  const wb = loadWorkbook(xlsxPath);

  if (shouldTruncate) await truncateAll();

  const shClientes = resolveSheet(wb, ['Clientes']);
  if (shClientes) {
    const rows = rowObjectsFirstWins(sheetToMatrix(shClientes));
    for (const row of rows) {
      const id = pick(row, ['ID Cliente']);
      const nome = pick(row, ['Nome Exibido']);
      if (!id?.trim() || !nome?.trim()) continue;
      await db.insert(clientes).values({
        idCliente: id.trim(),
        nomeExibido: nome.trim(),
        telefone: pick(row, ['Telefone']) || null,
        observacoes: pick(row, ['Observações', 'Observacoes']) || null,
      });
    }
  }

  const clientIds = new Set(
    (await db.select({ id: clientes.idCliente }).from(clientes)).map((r) => r.id),
  );

  const shServ = resolveSheet(wb, ['Serviços', 'Servicos']);
  if (shServ) {
    const matrix = sheetToMatrix(shServ);
    const withRows = rowObjectsFirstWinsWithSheetRow(matrix);
    for (const { sheetRow, row } of withRows) {
      await db.insert(servicos).values({
        linha: sheetRow,
        servico: pick(row, ['Serviço', 'Servico']) || null,
        tipo: row['Tipo'] || null,
        valorBase: pick(row, ['Valor Base']) || null,
        comissaoFixa: pick(row, ['Comissão Fixa', 'Comissao Fixa']) || null,
        comissaoPct: pick(row, ['Comissão %', 'Comissao %']) || null,
        precoCurto: pick(row, ['Preço Curto', 'Preco Curto']) || null,
        precoMedio: pick(row, ['Preço Médio', 'Preco Medio']) || null,
        precoMedioLongo:
          pick(row, ['Preço Médio/Longo', 'Preco Medio/Longo']) || null,
        precoLongo: pick(row, ['Preço Longo', 'Preco Longo']) || null,
        custoFixo: pick(row, ['Custo Fixo']) || null,
        curto: pick(row, ['Curto']) || null,
        medio: pick(row, ['Médio', 'Medio']) || null,
        mL: pick(row, ['M/L']) || null,
        longo: pick(row, ['Longo']) || null,
      });
    }
  }

  const shPac = resolveSheet(wb, ['Pacotes']);
  if (shPac) {
    for (const row of rowObjectsFirstWins(sheetToMatrix(shPac))) {
      const nome = pick(row, ['Pacote']);
      if (!nome) continue;
      const preco =
        pick(row, ['Preço pacote', 'Preço Pacote', 'Preco pacote', 'Preço', 'Preco']) ||
        null;
      await db.insert(pacotes).values({ pacote: nome, precoPacote: preco });
    }
  }

  const shProd = resolveSheet(wb, ['Produtos']);
  if (shProd) {
    for (const row of rowObjectsFirstWins(sheetToMatrix(shProd))) {
      const nome = pick(row, ['Produto']);
      if (!nome) continue;
      await db.insert(produtos).values({
        produto: nome,
        categoria: pick(row, ['Categoria']) || null,
        custo: pick(row, ['Custo']) || null,
        preco: pick(row, ['Preço', 'Preco']) || null,
        estoque: pick(row, ['Estoque']) || null,
        estoqueInicial: pick(row, ['Estoque Inicial']) || null,
        unidade: pick(row, ['Unidade']) || '',
      });
    }
  }

  const shRM = resolveSheet(wb, ['Regras Mega']);
  if (shRM) {
    for (const row of rowObjectsFirstWins(sheetToMatrix(shRM))) {
      const pac = pick(row, ['Pacote']);
      const et = pick(row, ['Etapa']);
      if (!pac || !et) continue;
      await db.insert(regrasMega).values({
        pacote: pac,
        etapa: et,
        valor: pick(row, ['Valor']) || null,
        comissao: pick(row, ['Comissão', 'Comissao']) || null,
      });
    }
  }

  const shCab = resolveSheet(wb, ['Cabelos']);
  if (shCab) {
    const cabeloRows = rowObjectsCabelos(sheetToMatrix(shCab));
    for (const row of cabeloRows) {
      await db.insert(cabelos).values({
        cor: row['Cor'] || null,
        tamanhoCm: row['Tamanho (cm)'] || row['Tamanho'] || null,
        metodo: row['Método'] || row['Metodo'] || null,
        valorBase: row['Valor Base'] || null,
      });
    }
  }

  const shFolha = resolveSheet(wb, ['Folha']);
  if (shFolha) {
    for (const row of rowObjectsFirstWins(sheetToMatrix(shFolha))) {
      await db.insert(folha).values({
        profissional: pick(row, ['Profissional']) || null,
        mes: pick(row, ['Mês', 'Mes']) || null,
        totalComissao: pick(row, ['Total Comissão', 'Total Comissao']) || null,
        totalPago: pick(row, ['Total Pago']) || null,
        saldo: pick(row, ['Saldo']) || null,
        status: pick(row, ['Status']) || null,
      });
    }
  }

  const shPag = resolveSheet(wb, ['Pagamentos']);
  if (shPag) {
    for (const row of rowObjectsFirstWins(sheetToMatrix(shPag))) {
      await db.insert(pagamentos).values({
        data: pick(row, ['Data']) || null,
        profissional: pick(row, ['Profissional']) || null,
        tipo: pick(row, ['Tipo']) || null,
        valor: pick(row, ['Valor']) || null,
        mesRef: pick(row, ['Mês Ref', 'Mes Ref']) || null,
        observacao: pick(row, ['Observação', 'Observacao']) || null,
      });
    }
  }

  const shDesp = resolveSheet(wb, ['Despesas']);
  if (shDesp) {
    for (const row of rowObjectsFirstWins(sheetToMatrix(shDesp))) {
      await db.insert(despesas).values({
        data: pick(row, ['Data']) || null,
        tipo: pick(row, ['Tipo']) || null,
        categoria: pick(row, ['Categoria']) || null,
        descricao: pick(row, ['Descrição', 'Descricao']) || null,
        valor: pick(row, ['Valor']) || null,
      });
    }
  }

  const shAt = resolveSheet(wb, ['Atendimentos']);
  if (shAt) {
    const folhaRows = await db
      .select({ id: folha.id, nome: folha.profissional })
      .from(folha);
    const nomeParaId = new Map<string, number>();
    const idsFolha = new Set<number>();
    for (const f of folhaRows) {
      idsFolha.add(f.id);
      const n = String(f.nome || '').trim();
      if (n && !nomeParaId.has(n)) nomeParaId.set(n, f.id);
    }
    for (const row of rowObjectsFirstWins(sheetToMatrix(shAt))) {
      const idAt = pick(row, ['ID Atendimento']).trim();
      if (!idAt) continue;
      const idCliente = pick(row, ['ID Cliente']);
      if (!idCliente || !clientIds.has(idCliente.trim())) continue;
      const dataRaw = pick(row, ['Data']);
      const dataSql = dataRaw ? parseFlexibleDateToIso(dataRaw) : null;
      const profCell =
        pick(row, ['profissional_id', 'Profissional ID']) ||
        pick(row, ['Profissional']);
      let profissionalId: number | null = null;
      if (profCell) {
        const t = String(profCell).trim();
        const asNum = parseInt(t, 10);
        if (!Number.isNaN(asNum) && String(asNum) === t && idsFolha.has(asNum)) {
          profissionalId = asNum;
        } else if (t) {
          profissionalId = nomeParaId.get(t) ?? null;
        }
      }
      await db.insert(atendimentos).values({
        idAtendimento: idAt,
        data: dataSql,
        idCliente: idCliente.trim(),
        nomeCliente: pick(row, ['Nome Cliente']) || null,
        tipo: pick(row, ['Tipo']) || null,
        pacote: pick(row, ['Pacote']) || null,
        etapa: pick(row, ['Etapa']) || null,
        produto: pick(row, ['Produto']) || null,
        servicos: pick(row, ['Serviços', 'Servicos']) || null,
        tamanho: pick(row, ['Tamanho']) || null,
        profissionalId,
        valor: pick(row, ['Valor']) || null,
        valorManual: pick(row, ['Valor Manual']) || null,
        comissao:
          normalizeComissaoParaBD(pick(row, ['Comissão', 'Comissao'])) ||
          null,
        desconto: pick(row, ['Desconto']) || null,
        descricao: pick(row, ['Descrição', 'Descricao']) || null,
        descricaoManual:
          pick(row, ['Descrição Manual', 'Descricao Manual']) || null,
        custo: pick(row, ['Custo']) || null,
        lucro: pick(row, ['Lucro']) || null,
      });
    }
  }

  console.log('Seed concluído.');
}
