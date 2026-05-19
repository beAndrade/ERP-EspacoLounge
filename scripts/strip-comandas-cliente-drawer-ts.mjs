import fs from 'fs';

const path = 'src/app/pages/comandas/comandas.component.ts';
let src = fs.readFileSync(path, 'utf8');

const stateStart = '  clienteDrawerAberto = false;';
const stateEnd = '  private comandaDrawerCloseTimer';
const i0 = src.indexOf(stateStart);
const i1 = src.indexOf(stateEnd);
if (i0 < 0 || i1 < 0 || i1 <= i0) {
  console.error('state block markers not found', i0, i1);
  process.exit(1);
}
src = src.slice(0, i0) + src.slice(i1);

const methodMarkers = [
  ['  tituloCabecalhoClienteDrawer(): string {', '  ariaLabelComandaDrawer(): string {'],
  ['  ariaLabelClienteDrawer(): string {', '  ariaLabelComandaDrawer(): string {'],
  ['  abaClienteDesabilitada(aba: string): boolean {', '  ariaLabelComandaDrawer(): string {'],
  ['  onClienteNavTooltipEnter(event: Event, aba: string, imediato = false): void {', '  ariaLabelComandaDrawer(): string {'],
  ['  selecionarAbaCliente(aba: string): void {', '  /** Abre o drawer de cadastro vazio'],
  ['  /** Abre o drawer de cadastro vazio (botão «Criar cliente» no agendamento). */\n  abrirClienteDrawerNovo(): void {', '  /** Índice da aba ativa'],
  ['  /** Índice da aba ativa para animar a barra direita na `.cliente-nav` (desktop). */\n  abaAtivaClienteIndex(): number {', '  private opcoesClientes(): SaasSelectOption[] {'],
  ['  private resetCadastroClienteValidacao(): void {', '  private opcoesClientes(): SaasSelectOption[] {'],
  ['  private preencherCadastroClienteFormularioVazio(', '  private atualizarGruposECatalogo(): void {'],
  ['  private preencherCadastroClienteInicialDoGrupo(g: ComandaGrupo): void {', '  private atualizarGruposECatalogo(): void {'],
  ['  private hidratarClienteNaForm(c: Cliente): void {', '  private atualizarGruposECatalogo(): void {'],
  ['  private abrirPainelClienteDrawer(): void {', '  fecharComandaDrawer(): void {'],
  ['  fecharClienteDrawer(): void {', '  toggleDescontoDropdown(ev: Event): void {'],
  ['  toggleDescontoDropdown(ev: Event): void {', '  private opcoesClientes(): SaasSelectOption[] {'],
  ['  private carregarClienteNoDrawer(cid: string): void {', '  fecharComandaDrawer(): void {'],
  ['  /** Reduz foto para caber em `foto_url` e exibir no drawer sem travar o save. */\n  private comprimirFotoCliente(file: File): Promise<string> {', '  removerFotoSelecionada(): void {'],
  ['  removerFotoSelecionada(): void {', '  private opcoesClientes(): SaasSelectOption[] {'],
];

function removeBetween(startNeedle, endNeedle) {
  const a = src.indexOf(startNeedle);
  const b = src.indexOf(endNeedle, a + 1);
  if (a < 0 || b < 0 || b <= a) {
    console.warn('skip', startNeedle.slice(0, 40));
    return;
  }
  src = src.slice(0, a) + src.slice(b);
}

// Remove block from tituloCabecalho through before ariaLabelComandaDrawer
removeBetween('  tituloCabecalhoClienteDrawer(): string {', '  ariaLabelComandaDrawer(): string {');

// Remove salvar through montarPayload block ending before atualizarGrupos - actually salvar is between blur and pulse - complex

// Simpler: remove from abrirClienteDrawerNovo through fecharClienteDrawer inclusive, replace abrirClienteDrawerNovo
const novoStart = '  /** Abre o drawer de cadastro vazio (botão «Criar cliente» no agendamento). */\n  abrirClienteDrawerNovo(): void {';
const novoEnd = '  fecharComandaDrawer(): void {';
const ns = src.indexOf(novoStart);
const ne = src.indexOf(novoEnd);
if (ns >= 0 && ne > ns) {
  const replacement = `  /** Abre o drawer de cadastro vazio (botão «Criar cliente» no agendamento). */
  abrirClienteDrawerNovo(): void {
    this.cadastroDrawer.abrirNovo('', {
      onSalvo: (salvo) => {
        this.atualizarGruposECatalogo();
        const cid = (salvo.id ?? '').trim();
        if (cid) {
          const ix = this.clientesCatalogo.findIndex((c) => c.id === cid);
          if (ix >= 0) {
            const next = [...this.clientesCatalogo];
            next[ix] = salvo;
            this.clientesCatalogo = next;
          } else {
            this.clientesCatalogo = [...this.clientesCatalogo, salvo];
          }
          this.comandaDrawerRef?.recarregarClienteAposSalvarFicha(cid);
        }
        this.agendaEditComandaRef?.aplicarClienteAposCriacao(salvo);
      },
    });
  }

`;
  src = src.slice(0, ns) + replacement + src.slice(ne);
}

// Remove toggleDesconto through removerFoto before opcoesClientes
removeBetween('  toggleDescontoDropdown(ev: Event): void {', '  private opcoesClientes(): SaasSelectOption[] {');

// Remove carregarClienteNoDrawer and abrirPainel if still present
removeBetween('  private carregarClienteNoDrawer(cid: string): void {', '  fecharComandaDrawer(): void {');

// Replace abrirDrawerCliente and onAbrirCadastroClienteDaComandaSidebar - find and replace whole methods
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

fs.writeFileSync(path, src);
console.log('stripped ts');
