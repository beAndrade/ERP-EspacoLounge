/** Reforço no cliente: mesmo algoritmo que a API (`descricaoParaListaLinha`) para o rótulo Pacote. */
export function enriquecerRotuloPacote(params: {
  texto: string;
  tipo: string;
  pacote: string;
  etapa: string;
}): string {
  const tipoN = params.tipo.trim().toLowerCase();
  const p = params.pacote.trim();
  const e = params.etapa.trim();
  if (tipoN !== 'pacote' || !p) return params.texto.trim();

  let t = params.texto.trim();
  if (!t) t = e ? `${p} · ${e}` : p;
  if (/\bPacote\b/i.test(t)) return t;
  const pe = e ? `${p} · ${e}` : p;
  if (t === p && e) return `${p} · Pacote · ${e}`;
  if (t === pe || t === p) return e ? `${p} · Pacote · ${e}` : `${p} · Pacote`;
  return `${t} · Pacote`;
}
