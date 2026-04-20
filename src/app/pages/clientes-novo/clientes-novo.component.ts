import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
} from '@angular/forms';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { TelefoneBrMaskDirective } from '../../core/directives/telefone-br-mask.directive';
import { isCelularBr11Digitos } from '../../core/utils/telefone-br';

/** Nome com pelo menos 2 caracteres úteis (após trim). */
function nomeClienteValidator(control: AbstractControl): ValidationErrors | null {
  const t = String(control.value ?? '').trim();
  if (!t) return { required: true };
  if (t.length < 2) return { minlength: { requiredLength: 2, actualLength: t.length } };
  return null;
}

/** Obrigatório; deve ter exatamente 11 dígitos (DDD + celular). */
function celularBrObrigatorioValidator(control: AbstractControl): ValidationErrors | null {
  const raw = String(control.value ?? '').trim();
  if (!raw) return { required: true };
  return isCelularBr11Digitos(raw) ? null : { celular11: true };
}

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
    nome: ['', nomeClienteValidator],
    telefone: ['', celularBrObrigatorioValidator],
    notas: [''],
  });

  salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const nome = v.nome.trim();
    const tel = v.telefone.trim();
    this.salvando = true;
    this.erro = '';
    this.api
      .createCliente({
        nome,
        telefone: tel || undefined,
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
