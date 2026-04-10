/**
 * Texto de descrição para listagens (UI). Pacote: insere o rótulo `Pacote` após o nome do pacote.
 * `tipo` é comparado sem distinção de maiúsculas (ex.: PACOTE, Pacote).
 */
export function descricaoParaListaLinha(a: {
  descricao: string | null;
  descricaoManual: string | null;
  tipo: string | null;
  pacote: string | null;
  etapa: string | null;
  produto: string | null;
  servicos: string | null;
}): string {
  const tipoN = (a.tipo ?? '').trim().toLowerCase();
  const d = (a.descricao ?? '').trim();
  const m = (a.descricaoManual ?? '').trim();
  const p = (a.pacote ?? '').trim();
  const e = (a.etapa ?? '').trim();
  const base = d || m;

  if (tipoN === 'pacote' && p) {
    let t = base;
    if (!t) t = e ? `${p} · ${e}` : p;
    if (!/\bPacote\b/i.test(t)) {
      const pe = e ? `${p} · ${e}` : p;
      if (t === p && e) {
        t = `${p} · Pacote · ${e}`;
      } else if (t === pe || t === p) {
        t = e ? `${p} · Pacote · ${e}` : `${p} · Pacote`;
      } else {
        t = `${t} · Pacote`;
      }
    }
    return t;
  }

  let t = base;
  if (t) return t;
  if (tipoN === 'mega') {
    const parts = [p, e].filter(Boolean);
    if (parts.length) return parts.join(' · ');
  }
  const srv = (a.servicos ?? '').trim();
  if (srv) return srv;
  const prod = (a.produto ?? '').trim();
  if (prod) return prod;
  return '';
}
