import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { AgendaComponent } from './pages/agenda/agenda.component';
import { AgendaNovoComponent } from './pages/agenda-novo/agenda-novo.component';
import { ClientesComponent } from './pages/clientes/clientes.component';
import { ClientesNovoComponent } from './pages/clientes-novo/clientes-novo.component';
import { ClientesEditarComponent } from './pages/clientes-editar/clientes-editar.component';
import { ServicosComponent } from './pages/servicos/servicos.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'agenda', component: AgendaComponent },
  { path: 'agenda/novo', component: AgendaNovoComponent },
  { path: 'clientes', component: ClientesComponent },
  { path: 'clientes/novo', component: ClientesNovoComponent },
  { path: 'clientes/:id/editar', component: ClientesEditarComponent },
  { path: 'servicos', component: ServicosComponent },
  { path: '**', redirectTo: '' },
];
