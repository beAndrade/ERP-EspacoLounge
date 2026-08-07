/**
 * Mensagens amigáveis para erros comuns do Postgres expostos ao cliente da API.
 * O driver (`pg`) coloca `code`, `constraint` e `message` no erro; o Drizzle pode
 * encadear o erro original em `cause`.
 */
function walkErrorChain(e: unknown, maxDepth = 8): unknown[] {
  const out: unknown[] = [];
  let cur: unknown = e;
  let d = 0;
  while (cur != null && d < maxDepth) {
    out.push(cur);
    if (typeof cur !== 'object') break;
    cur = (cur as { cause?: unknown }).cause;
    d += 1;
  }
  return out;
}

function collectStrings(e: unknown): { codes: string[]; constraints: string[]; messages: string[] } {
  const codes: string[] = [];
  const constraints: string[] = [];
  const messages: string[] = [];
  for (const node of walkErrorChain(e)) {
    if (typeof node !== 'object' || node === null) continue;
    const o = node as Record<string, unknown>;
    if (typeof o.code === 'string') codes.push(o.code);
    if (typeof o.constraint === 'string') constraints.push(o.constraint);
    if (typeof o.message === 'string') messages.push(o.message);
  }
  return { codes, constraints, messages };
}

/** Se for violação de unicidade conhecida, devolve mensagem em PT-BR; senão `null`. */
export function mapPostgresUniqueViolationToPtBr(e: unknown): string | null {
  const { codes, constraints, messages } = collectStrings(e);
  const is23505 = codes.includes('23505');
  const blob = [...constraints, ...messages].join('\n');
  const looksDuplicate =
    is23505 ||
    /duplicate\s+key/i.test(blob) ||
    /unique\s+constraint/i.test(blob);
  if (!looksDuplicate) return null;

  if (
    constraints.some((c) => c === 'atendimento_itens_uq_produto') ||
    blob.includes('atendimento_itens_uq_produto')
  ) {
    return 'Este produto já está nesta comanda. Remova a linha duplicada ou ajuste a quantidade na linha existente.';
  }
  if (
    constraints.some((c) => c === 'atendimento_itens_uq_servico') ||
    blob.includes('atendimento_itens_uq_servico')
  ) {
    return 'Este serviço (com o mesmo tamanho) já está nesta comanda. Remova a linha duplicada ou ajuste a quantidade na linha existente.';
  }
  return null;
}
