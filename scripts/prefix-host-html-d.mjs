import fs from 'fs';

const p =
  'src/app/shared/cliente-cadastro-drawer/cliente-cadastro-drawer-host.component.html';
let h = fs.readFileSync(p, 'utf8');
const members = [
  'cadastroNome',
  'cadastroApelido',
  'cadastroCelular',
  'cadastroTelefone',
  'cadastroEmail',
  'cadastroAniversario',
  'cadastroCnpj',
  'cadastroCpf',
  'cadastroRg',
  'cadastroFotoUrl',
  'cadastroCep',
  'cadastroLogradouro',
  'cadastroEnderecoNumero',
  'cadastroComplemento',
  'cadastroBairro',
  'cadastroEstado',
  'cadastroCidade',
  'cadastroInstagram',
  'cadastroFacebook',
  'secaoEnderecoAberta',
  'secaoRedesAberta',
  'secaoConfiguracoesAberta',
  'descontoDropdownAberto',
  'descontoPadraoModo',
  'descontoPadraoTexto',
  'notificacoesAtivo',
  'notificacoesToggleLiqArmed',
  'ocultarClienteNavLockTooltip',
  'onClienteNavTooltipEnter',
  'onClienteNavTooltipLeave',
  'onFotoSelecionada',
  'removerFotoSelecionada',
  'toggleDescontoDropdown',
  'selecionarDescontoModo',
  'onCelularChange',
  'onTelefoneChange',
  'onNotificacoesToggleClick',
  'onNotificacoesToggleKeydown',
];
for (const m of members.sort((a, b) => b.length - a.length)) {
  const escaped = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![.\\w])${escaped}`, 'g');
  h = h.replace(re, `d.${m}`);
}
h = h.replace(/\bd\.d\./g, 'd.');
fs.writeFileSync(p, h);
console.log('prefixed');
