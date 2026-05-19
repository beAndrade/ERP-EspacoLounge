import fs from 'fs';

const path = 'src/app/pages/comandas/comandas.component.ts';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

function findLine(pred, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (pred(lines[i], i)) return i;
  }
  return -1;
}

const removeRanges = [];
const a = findLine((l) => l.includes('_REMOVE_CLIENTE_DRAWER_START'));
const b = findLine((l) => l.startsWith('  private atualizarGruposECatalogo'));
if (a >= 0 && b > a) removeRanges.push([a, b - 1]);

const c = findLine((l) => l.startsWith('  fecharClienteDrawer():'));
const d = findLine((l) => l.startsWith('  private opcoesClientes():'), c);
if (c >= 0 && d > c) removeRanges.push([c, d - 1]);

const remove = new Set();
for (const [s, e] of removeRanges) {
  for (let i = s; i <= e; i++) remove.add(i);
}
let out = lines.filter((_, i) => !remove.has(i));

let src = out.join('\n');

src = src.replace(
  /  abrirDrawerCliente\(g: ComandaGrupo, ev: Event\): void \{[\s\S]*?if \(cid\) this\.carregarClienteNoDrawer\(cid\);\n  \}/,
  `  abrirDrawerCliente(g: ComandaGrupo, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    if (this.comandaPainelAberto) {
      this.comandaPainelAberto = false;
      this.comandaDrawerPanelOpen = false;
      this.comandaDrawerContexto = null;
      this.comandaDataYmdParaFaturar = null;
      if (this.comandaDrawerCloseTimer != null) {
        clearTimeout(this.comandaDrawerCloseTimer);
        this.comandaDrawerCloseTimer = null;
      }
    }
    const cid = this.idCliente(g);
    if (!cid) return;
    this.cadastroDrawer.abrirEdicao(cid, {
      nomeLista: g.nomeCliente?.trim() ?? '',
      callbacks: {
        onSalvo: () => this.atualizarGruposECatalogo(),
      },
    });
  }`,
);

src = src.replace(
  /  onAbrirCadastroClienteDaComandaSidebar\(\): void \{[\s\S]*?this\.carregarClienteNoDrawer\(cid\);\n  \}/,
  `  onAbrirCadastroClienteDaComandaSidebar(): void {
    const ctx = this.comandaDrawerContexto;
    const cid = ctx?.clienteId?.trim();
    if (!cid) return;

    const nomeLista = String(ctx?.cliente?.nome ?? '').trim();
    this.cadastroDrawer.abrirEdicao(cid, {
      nomeLista,
      callbacks: {
        onClienteCarregado: (c) => {
          const ctxId = this.comandaDrawerContexto?.clienteId?.trim();
          if (
            ctxId === cid &&
            this.comandaDrawerContexto != null &&
            this.comandaDrawerContexto.clienteId === cid
          ) {
            this.comandaDrawerContexto = {
              ...this.comandaDrawerContexto,
              cliente: c,
            };
          }
          const ix = this.clientesCatalogo.findIndex((cl) => cl.id === cid);
          if (ix >= 0) {
            const next = [...this.clientesCatalogo];
            next[ix] = c;
            this.clientesCatalogo = next;
          }
        },
        onSalvo: (salvo) => {
          this.atualizarGruposECatalogo();
          const cidSalvo = (salvo.id ?? cid).trim();
          if (cidSalvo) {
            this.comandaDrawerRef?.recarregarClienteAposSalvarFicha(cidSalvo);
          }
        },
      },
    });
  }`,
);

fs.writeFileSync(path, src.endsWith('\n') ? src : src + '\n');
console.log('fixed', removeRanges);
