import { Component } from '@angular/core';
import { AtendimentosComponent } from '../atendimentos/atendimentos.component';

@Component({
  selector: 'app-comandas',
  standalone: true,
  imports: [AtendimentosComponent],
  template: '<app-atendimentos />',
})
export class ComandasComponent {}
