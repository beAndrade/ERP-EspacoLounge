import fs from 'fs';
import path from 'path';

const src = path.resolve('src/app/pages/comandas/comandas.component.html');
const dest = path.resolve(
  'src/app/shared/cliente-cadastro-drawer/cliente-cadastro-drawer-host.component.html',
);
const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/);
const startLine = lines.findIndex((l) => l.includes('@if (clienteDrawerAberto)'));
if (startLine < 0) {
  console.error('start marker not found');
  process.exit(1);
}
// comandas.component.html lines 831–1483 (1-based)
const endLine = 1482;
const block = lines.slice(startLine, endLine + 1).join('\n');

const reps = [
  ['@if (clienteDrawerAberto)', '@if (d.aberto)'],
  ['clienteDrawerPanelOpen', 'd.panelOpen'],
  ['fecharClienteDrawer()', 'd.fechar()'],
  ['ariaLabelClienteDrawer()', 'd.ariaLabelDrawer()'],
  ['tituloCabecalhoClienteDrawer()', 'd.tituloCabecalho()'],
  ['clienteDrawerModo', 'd.modo'],
  ['clienteAbaAtiva', 'd.abaAtiva'],
  ['abasCliente', 'd.abas'],
  ['abaAtivaClienteIndex()', 'd.abaAtivaIndex()'],
  ['abaClienteDesabilitada(', 'd.abaDesabilitada('],
  ['selecionarAbaCliente(', 'd.selecionarAba('],
  ['erroClienteCampo(', 'd.erroCampo('],
  ['blurCadastroCliente(', 'd.blurCadastro('],
  ['onAniversarioCadastroChange', 'd.onAniversarioChange'],
  ['onCpfCadastroChange', 'd.onCpfChange'],
  ['onCnpjCadastroChange', 'd.onCnpjChange'],
  ['onRgCadastroChange', 'd.onRgChange'],
  ['onCepCadastroChange', 'd.onCepChange'],
  ['clienteSaveErro', 'd.saveErro'],
  ['cadastroSalvando', 'd.salvando'],
  ['salvarClienteDrawer()', 'd.salvar()'],
  ['clienteNavLockTooltipVisible', 'd.clienteNavLockTooltipVisible'],
  ['clienteNavLockTooltipX', 'd.clienteNavLockTooltipX'],
  ['clienteNavLockTooltipY', 'd.clienteNavLockTooltipY'],
];

let html = block;
for (const [from, to] of reps) {
  html = html.split(from).join(to);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, html.trim() + '\n');
console.log('Wrote', dest, 'chars', html.length);
