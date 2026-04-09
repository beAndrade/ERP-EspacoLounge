import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const seedDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(seedDir, '../../..');

export function defaultXlsxPath(): string {
  const env = process.env.XLSX_PATH?.trim();
  if (env) return path.resolve(env);
  return path.join(repoRoot, 'docs', 'ERP Espaço Lounge.xlsx');
}

export function loadWorkbook(filePath: string): XLSX.WorkBook {
  const buf = readFileSync(filePath);
  return XLSX.read(buf, { type: 'buffer', cellDates: true, raw: false });
}

export function normalizeSheetName(s: string): string {
  return s.normalize('NFC').trim().toLowerCase();
}

export function resolveSheet(
  wb: XLSX.WorkBook,
  candidates: string[],
): XLSX.WorkSheet | null {
  const names = wb.SheetNames;
  const want = candidates.map(normalizeSheetName);
  for (const n of names) {
    if (want.includes(normalizeSheetName(n))) {
      return wb.Sheets[n]!;
    }
  }
  return null;
}

export function sheetToMatrix(sheet: XLSX.WorkSheet): string[][] {
  return XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as string[][];
}

/** Serial Excel (aprox. 1980–2070) → YYYY-MM-DD em UTC (evita erro de fuso em datas “só dia”). */
function excelSerialToYmd(serial: number): string {
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const d = new Date(utc);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function cellToString(v: unknown): string {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = Math.floor(v);
    if (n >= 30000 && n <= 65000) {
      return excelSerialToYmd(n);
    }
  }
  return String(v).trim();
}

/** Converte texto típico de planilha (BR) para ISO usado no Postgres. */
export function parseFlexibleDateToIso(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\b/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const month = m[2].padStart(2, '0');
    const year = m[3];
    return `${year}-${month}-${day}`;
  }
  const num = Number(t.replace(/\s/g, '').replace(',', '.'));
  if (Number.isFinite(num) && num >= 30000 && num <= 65000) {
    return excelSerialToYmd(Math.floor(num));
  }
  return null;
}

/** Primeira ocorrência de cada cabeçalho não vazio (evita duplicados Regras Mega). */
export function rowObjectsFirstWins(
  matrix: string[][],
  headerRow = 0,
): Record<string, string>[] {
  return rowObjectsFirstWinsWithSheetRow(matrix, headerRow).map((x) => x.row);
}

/** Inclui número da linha na folha (1-based), como na API legada (`servico_id` = linha). */
export function rowObjectsFirstWinsWithSheetRow(
  matrix: string[][],
  headerRow = 0,
): { sheetRow: number; row: Record<string, string> }[] {
  if (!matrix.length || headerRow >= matrix.length) return [];
  const headers = (matrix[headerRow] || []).map((h) => String(h ?? '').trim());
  const out: { sheetRow: number; row: Record<string, string> }[] = [];
  for (let r = headerRow + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const o: Record<string, string> = {};
    let any = false;
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      if (!h) continue;
      if (h in o) continue;
      const val = cellToString(row[c]);
      o[h] = val;
      if (val) any = true;
    }
    if (any) out.push({ sheetRow: r + 1, row: o });
  }
  return out;
}

export function findCorHeaderColumn(matrix: string[][]): {
  headerRow: number;
  col: number;
} | null {
  const maxR = Math.min(matrix.length, 20);
  for (let r = 0; r < maxR; r++) {
    const row = matrix[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (String(row[c] ?? '').trim() === 'Cor') {
        return { headerRow: r, col: c };
      }
    }
  }
  return null;
}

export function rowObjectsCabelos(matrix: string[][]): Record<string, string>[] {
  const found = findCorHeaderColumn(matrix);
  if (!found) return [];
  const { headerRow, col } = found;
  const header = matrix[headerRow] || [];
  const keys = [
    'Cor',
    String(header[col + 1] ?? 'Tamanho (cm)').trim() || 'Tamanho (cm)',
    String(header[col + 2] ?? 'Método').trim() || 'Método',
    String(header[col + 3] ?? 'Valor Base').trim() || 'Valor Base',
  ];
  const out: Record<string, string>[] = [];
  for (let r = headerRow + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const cor = cellToString(row[col]);
    const tamanho = cellToString(row[col + 1]);
    const metodo = cellToString(row[col + 2]);
    const valorBase = cellToString(row[col + 3]);
    if (!cor && !tamanho && !metodo && !valorBase) continue;
    out.push({
      Cor: cor,
      'Tamanho (cm)': tamanho,
      'Método': metodo,
      'Valor Base': valorBase,
    });
  }
  return out;
}
