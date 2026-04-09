/**
 * Importação em massa a partir do XLSX **sem** truncar tabelas (cutover incremental).
 * Pode duplicar linhas se executado várias vezes; use após migração ou com BD limpo.
 */
import { seedFromXlsx } from '../seed/run';

await seedFromXlsx({ truncate: false });
console.log('ETL import (sem truncate) concluído.');
process.exit(0);
