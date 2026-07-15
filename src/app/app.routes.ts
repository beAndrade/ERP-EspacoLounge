import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { AgendaComponent } from './features/agenda/pages/main/agenda.component';
import { AgendaHubComponent } from './features/agenda/pages/hub/agenda-hub.component';
import { AgendaListaComponent } from './features/agenda/pages/lista/agenda-lista.component';
import { AgendaNovoComponent } from './features/agenda/pages/novo/agenda-novo.component';
import { AgendarPublicoComponent } from './features/agendamento-publico/pages/agendar/agendar-publico.component';
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
import { ConfiguracoesShellComponent } from './features/configuracoes/pages/shell/configuracoes-shell.component';
import { ConfiguracoesWhatsappComponent } from './features/configuracoes/pages/whatsapp/configuracoes-whatsapp.component';
import { EstoqueComponent } from './features/estoque/pages/main/estoque.component';
import { ProfissionaisComponent } from './features/profissionais/pages/main/profissionais.component';
import { FornecedoresComponent } from './features/fornecedores/pages/main/fornecedores.component';
import { ComandasComponent } from './features/comandas/pages/main/comandas.component';
import { PainelComponent } from './features/painel/pages/main/painel.component';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'agendar', component: AgendarPublicoComponent },
  { path: '', pathMatch: 'full', redirectTo: 'painel' },
  {
    path: 'painel',
    component: PainelComponent,
    canActivate: [authGuard],
    data: { titulo: 'Painel' },
  },
  {
    path: 'pacotes',
    component: EmBreveComponent,
    canActivate: [authGuard, adminGuard],
    data: { titulo: 'Pacotes' },
  },
  {
    path: 'pacotes/predefinidos',
    component: EmBreveComponent,
    canActivate: [authGuard, adminGuard],
    data: { titulo: 'Pacotes Predefinidos' },
  },
  { path: 'comandas', component: ComandasComponent, canActivate: [authGuard] },
  { path: 'atendimentos', redirectTo: 'comandas', pathMatch: 'full' },
  { path: 'agenda/novo', component: AgendaNovoComponent, canActivate: [authGuard] },
  { path: 'agenda/lista', component: AgendaListaComponent, canActivate: [authGuard] },
  { path: 'agenda/calendario', component: AgendaComponent, canActivate: [authGuard] },
  { path: 'agenda', component: AgendaHubComponent, canActivate: [authGuard] },
  { path: 'clientes', component: ClientesComponent, canActivate: [authGuard] },
  { path: 'clientes/novo', component: ClientesNovoComponent, canActivate: [authGuard] },
  {
    path: 'clientes/:id/editar',
    component: ClientesEditarComponent,
    canActivate: [authGuard],
  },
  {
    path: 'servicos',
    component: ServicosComponent,
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'estoque',
    component: EstoqueComponent,
    canActivate: [authGuard, adminGuard],
    data: { titulo: 'Produtos' },
  },
  {
    path: 'categorias',
    component: EmBreveComponent,
    canActivate: [authGuard, adminGuard],
    data: { titulo: 'Categorias' },
  },
  {
    path: 'marcas',
    component: EmBreveComponent,
    canActivate: [authGuard, adminGuard],
    data: { titulo: 'Marcas' },
  },
  {
    path: 'compras',
    component: EmBreveComponent,
    canActivate: [authGuard, adminGuard],
    data: { titulo: 'Compras' },
  },
  {
    path: 'promocoes',
    component: EmBreveComponent,
    canActivate: [authGuard, adminGuard],
    data: { titulo: 'Promoções' },
  },
  {
    path: 'cashback',
    component: EmBreveComponent,
    canActivate: [authGuard, adminGuard],
    data: { titulo: 'Cashback' },
  },
  {
    path: 'avaliacoes',
    component: EmBreveComponent,
    canActivate: [authGuard, adminGuard],
    data: { titulo: 'Avaliações' },
  },
  {
    path: 'relatorios/painel',
    component: EmBreveComponent,
    canActivate: [authGuard, adminGuard],
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
    canActivate: [authGuard, adminGuard],
    data: { titulo: 'Consultoria' },
  },
  {
    path: 'profissionais',
    component: ProfissionaisComponent,
    canActivate: [authGuard, adminGuard],
    data: { titulo: 'Profissionais' },
  },
  {
    path: 'fornecedores',
    component: FornecedoresComponent,
    canActivate: [authGuard, adminGuard],
    data: { titulo: 'Fornecedores' },
  },
  {
    path: 'configuracoes',
    component: ConfiguracoesShellComponent,
    canActivate: [authGuard, adminGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'whatsapp' },
      { path: 'whatsapp', component: ConfiguracoesWhatsappComponent },
    ],
  },
  {
    path: 'financeiro',
    component: FinanceiroShellComponent,
    canActivate: [authGuard, adminGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'painel' },
      { path: 'painel', component: FinanceiroPainelComponent },
      { path: 'transacoes', component: FinanceiroTransacoesComponent },
      { path: 'comissoes', component: FinanceiroComissoesComponent },
      { path: 'cadastros', component: FinanceiroCadastrosComponent },
    ],
  },
  { path: '**', redirectTo: 'painel' },
];
