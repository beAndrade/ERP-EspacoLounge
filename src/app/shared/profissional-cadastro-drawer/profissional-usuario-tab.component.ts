import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProfissionalCadastroDrawerService } from './profissional-cadastro-drawer.service';

@Component({
  selector: 'app-profissional-usuario-tab',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profissional-usuario-tab.component.html',
  styleUrl: './profissional-usuario-tab.component.scss',
})
export class ProfissionalUsuarioTabComponent implements OnInit {
  readonly d = inject(ProfissionalCadastroDrawerService);

  ngOnInit(): void {
    void this.d.carregarUsuarioProfissional();
  }
}
