/** Mescla variáveis do template; `profissional` = utilizador autenticado. */
export function mesclarVariaveisWhatsapp(
  base: Record<string, string | null | undefined> = {},
  opts: {
    nomeProfissional: string;
    nomeEmpresa?: string;
    clienteNome?: string;
  },
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(base)) {
    const s = String(val ?? '').trim();
    if (s) out[key] = s;
  }
  const cliente = String(opts.clienteNome ?? out['cliente'] ?? '').trim();
  if (cliente) out['cliente'] = cliente;
  const empresa = String(opts.nomeEmpresa ?? out['empresa'] ?? '').trim();
  if (empresa) out['empresa'] = empresa;
  out['profissional'] = String(opts.nomeProfissional ?? '').trim();
  return out;
}
