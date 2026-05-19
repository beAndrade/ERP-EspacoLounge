import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { AgendaComponent } from './features/agenda/pages/main/agenda.component';
import { AgendaHubComponent } from './features/agenda/pages/hub/agenda-hub.component';
import { AgendaListaComponent } from './features/agenda/pages/lista/agenda-lista.component';
import { AgendaNovoComponent } from './features/agenda/pages/novo/agenda-novo.component';
import { ClientesComponent } from './pages/clientes/clientes.component';
import { ClientesNovoComponent } from './pages/clientes-novo/clientes-novo.component';
import { ClientesEditarComponent } from './pages/clientes-editar/clientes-editar.component';
import { ServicosComponent } from './pages/servicos/servicos.component';
import { FinanceiroComissoesComponent } from './pages/financeiro-comissoes/financeiro-comissoes.component';
import { FinanceiroShellComponent } from './pages/financeiro-shell/financeiro-shell.component';
import { FinanceiroComponent } from './pages/financeiro/financeiro.component';
import { EmBreveComponent } from './pages/em-breve/em-breve.component';
import { EstoqueComponent } from './pages/estoque/estoque.component';
import { ProfissionaisComponent } from './pages/profissionais/profissionais.component';
import { FornecedoresComponent } from './pages/fornecedores/fornecedores.component';
import { ComandasComponent } from './pages/comandas/comandas.component';

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
      { path: 'painel', component: FinanceiroComponent },
      {
        path: 'transacoes',
        component: EmBreveComponent,
        data: { titulo: 'Transações' },
      },
      { path: 'comissoes', component: FinanceiroComissoesComponent },
    ],
  },
  { path: '**', redirectTo: '' },
];
