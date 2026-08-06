import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then((m) => m.LoginComponent),
    title: 'Entrar',
  },
  {
    path: 'agendar',
    loadComponent: () =>
      import('./features/agendamento-publico/pages/agendar/agendar-publico.component').then(
        (m) => m.AgendarPublicoComponent,
      ),
    title: 'Agendamento Online',
  },
  { path: '', pathMatch: 'full', redirectTo: 'painel' },
  {
    path: 'painel',
    loadComponent: () =>
      import('./features/painel/pages/main/painel.component').then(
        (m) => m.PainelComponent,
      ),
    canActivate: [authGuard],
    title: 'Painel',
    data: { titulo: 'Painel' },
  },
  {
    path: 'pacotes',
    loadComponent: () =>
      import('./pages/em-breve/em-breve.component').then((m) => m.EmBreveComponent),
    canActivate: [authGuard, adminGuard],
    title: 'Pacotes',
    data: { titulo: 'Pacotes' },
  },
  {
    path: 'pacotes/predefinidos',
    loadComponent: () =>
      import('./pages/em-breve/em-breve.component').then((m) => m.EmBreveComponent),
    canActivate: [authGuard, adminGuard],
    title: 'Pacotes Predefinidos',
    data: { titulo: 'Pacotes Predefinidos' },
  },
  {
    path: 'comandas',
    loadComponent: () =>
      import('./features/comandas/pages/main/comandas.component').then(
        (m) => m.ComandasComponent,
      ),
    canActivate: [authGuard],
    title: 'Comandas',
  },
  {
    path: 'orcamentos',
    loadComponent: () =>
      import('./features/orcamentos/pages/main/orcamentos.component').then(
        (m) => m.OrcamentosComponent,
      ),
    canActivate: [authGuard],
    title: 'Orçamentos',
    data: { titulo: 'Orçamentos' },
  },
  { path: 'atendimentos', redirectTo: 'comandas', pathMatch: 'full' },
  {
    path: 'agenda/novo',
    loadComponent: () =>
      import('./features/agenda/pages/novo/agenda-novo.component').then(
        (m) => m.AgendaNovoComponent,
      ),
    canActivate: [authGuard],
    title: 'Novo Agendamento',
  },
  {
    path: 'agenda/lista',
    loadComponent: () =>
      import('./features/agenda/pages/lista/agenda-lista.component').then(
        (m) => m.AgendaListaComponent,
      ),
    canActivate: [authGuard],
    title: 'Agenda — Lista',
  },
  {
    path: 'agenda/calendario',
    loadComponent: () =>
      import('./features/agenda/pages/main/agenda.component').then(
        (m) => m.AgendaComponent,
      ),
    canActivate: [authGuard],
    title: 'Agenda — Calendário',
  },
  {
    path: 'agenda',
    loadComponent: () =>
      import('./features/agenda/pages/hub/agenda-hub.component').then(
        (m) => m.AgendaHubComponent,
      ),
    canActivate: [authGuard],
    title: 'Agenda',
  },
  {
    path: 'clientes',
    loadComponent: () =>
      import('./features/clientes/pages/lista/clientes.component').then(
        (m) => m.ClientesComponent,
      ),
    canActivate: [authGuard],
    title: 'Clientes',
  },
  {
    path: 'clientes/novo',
    loadComponent: () =>
      import('./features/clientes/pages/novo/clientes-novo.component').then(
        (m) => m.ClientesNovoComponent,
      ),
    canActivate: [authGuard],
    title: 'Novo Cliente',
  },
  {
    path: 'clientes/:id/editar',
    loadComponent: () =>
      import('./features/clientes/pages/editar/clientes-editar.component').then(
        (m) => m.ClientesEditarComponent,
      ),
    canActivate: [authGuard],
    title: 'Editar Cliente',
  },
  {
    path: 'servicos',
    loadComponent: () =>
      import('./features/servicos/pages/main/servicos.component').then(
        (m) => m.ServicosComponent,
      ),
    canActivate: [authGuard, adminGuard],
    title: 'Serviços',
  },
  {
    path: 'estoque',
    loadComponent: () =>
      import('./features/estoque/pages/main/estoque.component').then(
        (m) => m.EstoqueComponent,
      ),
    canActivate: [authGuard, adminGuard],
    title: 'Produtos',
    data: { titulo: 'Produtos' },
  },
  {
    path: 'categorias',
    loadComponent: () =>
      import('./features/categorias/pages/main/categorias.component').then(
        (m) => m.CategoriasComponent,
      ),
    canActivate: [authGuard, adminGuard],
    title: 'Categorias',
    data: { titulo: 'Categorias' },
  },
  {
    path: 'marcas',
    loadComponent: () =>
      import('./features/marcas/pages/main/marcas.component').then(
        (m) => m.MarcasComponent,
      ),
    canActivate: [authGuard, adminGuard],
    title: 'Marcas',
    data: { titulo: 'Marcas' },
  },
  {
    path: 'compras',
    loadComponent: () =>
      import('./pages/em-breve/em-breve.component').then((m) => m.EmBreveComponent),
    canActivate: [authGuard, adminGuard],
    title: 'Compras',
    data: { titulo: 'Compras' },
  },
  {
    path: 'promocoes',
    loadComponent: () =>
      import('./pages/em-breve/em-breve.component').then((m) => m.EmBreveComponent),
    canActivate: [authGuard, adminGuard],
    title: 'Promoções',
    data: { titulo: 'Promoções' },
  },
  {
    path: 'cashback',
    loadComponent: () =>
      import('./pages/em-breve/em-breve.component').then((m) => m.EmBreveComponent),
    canActivate: [authGuard, adminGuard],
    title: 'Cashback',
    data: { titulo: 'Cashback' },
  },
  {
    path: 'avaliacoes',
    loadComponent: () =>
      import('./pages/em-breve/em-breve.component').then((m) => m.EmBreveComponent),
    canActivate: [authGuard, adminGuard],
    title: 'Avaliações',
    data: { titulo: 'Avaliações' },
  },
  {
    path: 'relatorios/painel',
    loadComponent: () =>
      import('./pages/em-breve/em-breve.component').then((m) => m.EmBreveComponent),
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
    loadComponent: () =>
      import('./pages/em-breve/em-breve.component').then((m) => m.EmBreveComponent),
    canActivate: [authGuard, adminGuard],
    title: 'Consultoria',
    data: { titulo: 'Consultoria' },
  },
  {
    path: 'profissionais',
    loadComponent: () =>
      import('./features/profissionais/pages/main/profissionais.component').then(
        (m) => m.ProfissionaisComponent,
      ),
    canActivate: [authGuard, adminGuard],
    title: 'Profissionais',
    data: { titulo: 'Profissionais' },
  },
  {
    path: 'fornecedores',
    loadComponent: () =>
      import('./features/fornecedores/pages/main/fornecedores.component').then(
        (m) => m.FornecedoresComponent,
      ),
    canActivate: [authGuard, adminGuard],
    title: 'Fornecedores',
    data: { titulo: 'Fornecedores' },
  },
  {
    path: 'configuracoes',
    loadComponent: () =>
      import('./features/configuracoes/pages/shell/configuracoes-shell.component').then(
        (m) => m.ConfiguracoesShellComponent,
      ),
    canActivate: [authGuard, adminGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'whatsapp' },
      {
        path: 'whatsapp',
        loadComponent: () =>
          import(
            './features/configuracoes/pages/whatsapp/configuracoes-whatsapp.component'
          ).then((m) => m.ConfiguracoesWhatsappComponent),
        title: 'Configurações — WhatsApp',
      },
    ],
  },
  {
    path: 'financeiro',
    loadComponent: () =>
      import('./features/financeiro/pages/shell/financeiro-shell.component').then(
        (m) => m.FinanceiroShellComponent,
      ),
    canActivate: [authGuard, adminGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'painel' },
      {
        path: 'painel',
        loadComponent: () =>
          import('./features/financeiro/pages/painel/financeiro-painel.component').then(
            (m) => m.FinanceiroPainelComponent,
          ),
        title: 'Financeiro — Painel',
      },
      {
        path: 'transacoes',
        loadComponent: () =>
          import(
            './features/financeiro/pages/transacoes/financeiro-transacoes.component'
          ).then((m) => m.FinanceiroTransacoesComponent),
        title: 'Financeiro — Transações',
      },
      {
        path: 'comissoes',
        loadComponent: () =>
          import(
            './features/financeiro/pages/comissoes/financeiro-comissoes.component'
          ).then((m) => m.FinanceiroComissoesComponent),
        title: 'Financeiro — Comissões',
      },
      {
        path: 'cadastros',
        loadComponent: () =>
          import(
            './features/financeiro/pages/cadastros/financeiro-cadastros.component'
          ).then((m) => m.FinanceiroCadastrosComponent),
        title: 'Financeiro — Cadastros',
      },
    ],
  },
  { path: '**', redirectTo: 'painel' },
];
