import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
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
import { CategoriasComponent } from './features/categorias/pages/main/categorias.component';
import { MarcasComponent } from './features/marcas/pages/main/marcas.component';
import { ProfissionaisComponent } from './features/profissionais/pages/main/profissionais.component';
import { FornecedoresComponent } from './features/fornecedores/pages/main/fornecedores.component';
import { ComandasComponent } from './features/comandas/pages/main/comandas.component';
import { OrcamentosComponent } from './features/orcamentos/pages/main/orcamentos.component';
import { PainelComponent } from './features/painel/pages/main/painel.component';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

/** /pacotes → Serviços aba Megahair. */
const redirectPacotesToMegahair: CanActivateFn = () =>
  inject(Router).createUrlTree(['/servicos'], {
    queryParams: { aba: 'megahair' },
  });

export const routes: Routes = [
  { path: 'login', component: LoginComponent, title: 'Entrar' },
  { path: 'agendar', component: AgendarPublicoComponent, title: 'Agendamento Online' },
  { path: '', pathMatch: 'full', redirectTo: 'painel' },
  {
    path: 'painel',
    component: PainelComponent,
    canActivate: [authGuard],
    title: 'Painel',
    data: { titulo: 'Painel' },
  },
  {
    path: 'pacotes',
    component: EmBreveComponent,
    canActivate: [authGuard, adminGuard, redirectPacotesToMegahair],
    title: 'Pacotes',
    data: { titulo: 'Pacotes' },
  },
  {
    path: 'pacotes/predefinidos',
    component: EmBreveComponent,
    canActivate: [authGuard, adminGuard],
    title: 'Pacotes Predefinidos',
    data: { titulo: 'Pacotes Predefinidos' },
  },
  { path: 'comandas', component: ComandasComponent, canActivate: [authGuard], title: 'Comandas' },
  {
    path: 'orcamentos',
    component: OrcamentosComponent,
    canActivate: [authGuard],
    title: 'Orçamentos',
    data: { titulo: 'Orçamentos' },
  },
  { path: 'atendimentos', redirectTo: 'comandas', pathMatch: 'full' },
  {
    path: 'agenda/novo',
    component: AgendaNovoComponent,
    canActivate: [authGuard],
    title: 'Novo Agendamento',
  },
  {
    path: 'agenda/lista',
    component: AgendaListaComponent,
    canActivate: [authGuard],
    title: 'Agenda — Lista',
  },
  {
    path: 'agenda/calendario',
    component: AgendaComponent,
    canActivate: [authGuard],
    title: 'Agenda — Calendário',
  },
  { path: 'agenda', component: AgendaHubComponent, canActivate: [authGuard], title: 'Agenda' },
  { path: 'clientes', component: ClientesComponent, canActivate: [authGuard], title: 'Clientes' },
  {
    path: 'clientes/novo',
    component: ClientesNovoComponent,
    canActivate: [authGuard],
    title: 'Novo Cliente',
  },
  {
    path: 'clientes/:id/editar',
    component: ClientesEditarComponent,
    canActivate: [authGuard],
    title: 'Editar Cliente',
  },
  {
    path: 'servicos',
    component: ServicosComponent,
    canActivate: [authGuard, adminGuard],
    title: 'Serviços',
    data: { titulo: 'Serviços' },
  },
  {
    path: 'estoque',
    component: EstoqueComponent,
    canActivate: [authGuard, adminGuard],
    title: 'Produtos',
    data: { titulo: 'Produtos' },
  },
  {
    path: 'categorias',
    component: CategoriasComponent,
    canActivate: [authGuard, adminGuard],
    title: 'Categorias',
    data: { titulo: 'Categorias' },
  },
  {
    path: 'marcas',
    component: MarcasComponent,
    canActivate: [authGuard, adminGuard],
    title: 'Marcas',
    data: { titulo: 'Marcas' },
  },
  {
    path: 'compras',
    component: EmBreveComponent,
    canActivate: [authGuard, adminGuard],
    title: 'Compras',
    data: { titulo: 'Compras' },
  },
  {
    path: 'promocoes',
    component: EmBreveComponent,
    canActivate: [authGuard, adminGuard],
    title: 'Promoções',
    data: { titulo: 'Promoções' },
  },
  {
    path: 'cashback',
    component: EmBreveComponent,
    canActivate: [authGuard, adminGuard],
    title: 'Cashback',
    data: { titulo: 'Cashback' },
  },
  {
    path: 'avaliacoes',
    component: EmBreveComponent,
    canActivate: [authGuard, adminGuard],
    title: 'Avaliações',
    data: { titulo: 'Avaliações' },
  },
  {
    path: 'relatorios/painel',
    component: EmBreveComponent,
    canActivate: [authGuard, adminGuard],
    title: 'Relatórios — Painel',
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
    title: 'Consultoria',
    data: { titulo: 'Consultoria' },
  },
  {
    path: 'profissionais',
    component: ProfissionaisComponent,
    canActivate: [authGuard, adminGuard],
    title: 'Profissionais',
    data: { titulo: 'Profissionais' },
  },
  {
    path: 'fornecedores',
    component: FornecedoresComponent,
    canActivate: [authGuard, adminGuard],
    title: 'Fornecedores',
    data: { titulo: 'Fornecedores' },
  },
  {
    path: 'configuracoes',
    component: ConfiguracoesShellComponent,
    canActivate: [authGuard, adminGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'whatsapp' },
      {
        path: 'whatsapp',
        component: ConfiguracoesWhatsappComponent,
        title: 'Configurações — WhatsApp',
      },
    ],
  },
  {
    path: 'financeiro',
    component: FinanceiroShellComponent,
    canActivate: [authGuard, adminGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'painel' },
      { path: 'painel', component: FinanceiroPainelComponent, title: 'Financeiro — Painel' },
      {
        path: 'transacoes',
        component: FinanceiroTransacoesComponent,
        title: 'Financeiro — Transações',
      },
      {
        path: 'comissoes',
        component: FinanceiroComissoesComponent,
        title: 'Financeiro — Comissões',
      },
      {
        path: 'cadastros',
        component: FinanceiroCadastrosComponent,
        title: 'Financeiro — Cadastros',
      },
    ],
  },
  { path: '**', redirectTo: 'painel' },
];
