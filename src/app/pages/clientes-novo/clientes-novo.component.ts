import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { TelefoneBrMaskDirective } from '../../core/directives/telefone-br-mask.directive';

@Component({
  selector: 'app-clientes-novo',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, TelefoneBrMaskDirective],
  templateUrl: './clientes-novo.component.html',
  styleUrl: './clientes-novo.component.scss',
})
export class ClientesNovoComponent {
  private readonly api = inject(SheetsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  salvando = false;
  erro = '';

  readonly form = this.fb.nonNullable.group({
    nome: ['', Validators.required],
    telefone: [''],
    notas: [''],
  });

  salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.salvando = true;
    this.erro = '';
    this.api
      .createCliente({
        nome: v.nome,
        telefone: v.telefone || undefined,
        notas: v.notas || undefined,
      })
      .subscribe({
        next: () => {
          this.salvando = false;
          this.router.navigate(['/clientes']);
        },
        error: (e: Error) => {
          this.erro =
            e.message ||
            'Não foi possível salvar. Verifique a internet e tente de novo.';
          this.salvando = false;
        },
      });
  }
}
