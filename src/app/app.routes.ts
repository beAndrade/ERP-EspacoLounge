import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { AgendaComponent } from './features/agenda/pages/main/agenda.component';
import { AgendaHubComponent } from './features/agenda/pages/hub/agenda-hub.component';
import { AgendaListaComponent } from './features/agenda/pages/lista/agenda-lista.component';
import { AgendaNovoComponent } from './features/agenda/pages/novo/agenda-novo.component';
import { ClientesComponent } from './features/clientes/pages/lista/clientes.component';
import { ClientesNovoComponent } from './features/clientes/pages/novo/clientes-novo.component';
import { ClientesEditarComponent } from './features/clientes/pages/editar/clientes-editar.component';
import { ServicosComponent } from './features/servicos/pages/main/servicos.component';
import { FinanceiroComissoesComponent } from './features/financeiro/pages/comissoes/financeiro-comissoes.component';
import { FinanceiroShellComponent } from './features/financeiro/pages/shell/financeiro-shell.component';
import { FinanceiroPainelComponent } from './features/financeiro/pages/painel/financeiro-painel.component';
import { FinanceiroTransacoesComponent } from './features/financeiro/pages/transacoes/financeiro-transacoes.component';
import { FinanceiroCadastrosComponent } from './features/financeiro/pages/cadastros/financeiro-cadastros.component';
import { EmBreveComponent } from './pages/em-breve/em-breve.component';
import { EstoqueComponent } from './features/estoque/pages/main/estoque.component';
import { ProfissionaisComponent } from './features/profissionais/pages/main/profissionais.component';
import { FornecedoresComponent } from './features/fornecedores/pages/main/fornecedores.component';
import { ComandasComponent } from './features/comandas/pages/main/comandas.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  {
    path: 'painel',
    component: EmBreveComponent,
    data: { titulo: 'Painel' },
  },
  {
    path: 'pacotes',
    component: EmBreveComponent,
    data: { titulo: 'Pacotes' },
  },
  {
    path: 'pacotes/predefinidos',
    component: EmBreveComponent,
    data: { titulo: 'Pacotes Predefinidos' },
  },
  { path: 'comandas', component: ComandasComponent },
  { path: 'atendimentos', redirectTo: 'comandas', pathMatch: 'full' },
  { path: 'agenda/novo', component: AgendaNovoComponent },
  { path: 'agenda/lista', component: AgendaListaComponent },
  { path: 'agenda/calendario', component: AgendaComponent },
  { path: 'agenda', component: AgendaHubComponent },
  { path: 'clientes', component: ClientesComponent },
  { path: 'clientes/novo', component: ClientesNovoComponent },
  { path: 'clientes/:id/editar', component: ClientesEditarComponent },
  { path: 'servicos', component: ServicosComponent },
  {
    path: 'estoque',
    component: EstoqueComponent,
    data: { titulo: 'Produtos' },
  },
  {
    path: 'categorias',
    component: EmBreveComponent,
    data: { titulo: 'Categorias' },
  },
  {
    path: 'marcas',
    component: EmBreveComponent,
    data: { titulo: 'Marcas' },
  },
  {
    path: 'compras',
    component: EmBreveComponent,
    data: { titulo: 'Compras' },
  },
  {
    path: 'promocoes',
    component: EmBreveComponent,
    data: { titulo: 'Promoções' },
  },
  {
    path: 'cashback',
    component: EmBreveComponent,
    data: { titulo: 'Cashback' },
  },
  {
    path: 'avaliacoes',
    component: EmBreveComponent,
    data: { titulo: 'Avaliações' },
  },
  {
    path: 'relatorios/painel',
    component: EmBreveComponent,
    data: { titulo: 'Relatórios — Painel' },
  },
  {
    path: 'relatorios/meta',
    redirectTo: '/relatorios/painel',
    pathMatch: 'full',
  },
  { path: 'relatorios', redirectTo: '/relatorios/painel', pathMatch: 'full' },
  {
    path: 'consultoria',
    component: EmBreveComponent,
    data: { titulo: 'Consultoria' },
  },
  {
    path: 'profissionais',
    component: ProfissionaisComponent,
    data: { titulo: 'Profissionais' },
  },
  {
    path: 'fornecedores',
    component: FornecedoresComponent,
    data: { titulo: 'Fornecedores' },
  },
  {
    path: 'configuracoes',
    component: EmBreveComponent,
    data: { titulo: 'Configurações' },
  },
  {
    path: 'financeiro',
    component: FinanceiroShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'painel' },
      { path: 'painel', component: FinanceiroPainelComponent },
      { path: 'transacoes', component: FinanceiroTransacoesComponent },
      { path: 'comissoes', component: FinanceiroComissoesComponent },
      { path: 'cadastros', component: FinanceiroCadastrosComponent },
    ],
  },
  { path: '**', redirectTo: '' },
];
