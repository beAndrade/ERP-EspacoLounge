import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { AgendaComponent } from './pages/agenda/agenda.component';
import { AgendaHubComponent } from './pages/agenda-hub/agenda-hub.component';
import { AgendaListaComponent } from './pages/agenda-lista/agenda-lista.component';
import { AgendaNovoComponent } from './pages/agenda-novo/agenda-novo.component';
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

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'atendimentos', redirectTo: 'agenda', pathMatch: 'full' },
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
    data: { titulo: 'Estoque' },
  },
  {
    path: 'promocoes',
    component: EmBreveComponent,
    data: { titulo: 'Promoções' },
  },
  {
    path: 'relatorios',
    component: EmBreveComponent,
    data: { titulo: 'Relatórios' },
  },
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
    path: 'configuracoes',
    component: EmBreveComponent,
    data: { titulo: 'Configurações' },
  },
  {
    path: 'financeiro',
    component: FinanceiroShellComponent,
    children: [
      { path: 'comissoes', component: FinanceiroComissoesComponent },
      { path: '', component: FinanceiroComponent },
    ],
  },
  { path: '**', redirectTo: '' },
];
