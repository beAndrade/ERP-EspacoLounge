import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
} from '@angular/forms';
import { switchMap } from 'rxjs';
import { SheetsApiService } from '../../../../core/services/sheets-api.service';
import { CelularBrMaskDirective } from '../../../../core/directives/celular-br-mask.directive';
import { isCelularBr11Digitos } from '../../../../core/utils/telefone-br';
import { findClienteCadastroDuplicado } from '../../../../core/utils/clientes-unicidade';
import {
  CLIENTE_SALVO_TOAST_MSG,
} from '../../../../shared/cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import { AppToastService } from '../../../../shared/app-toast/app-toast.service';

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
  imports: [RouterLink, ReactiveFormsModule, CelularBrMaskDirective],
  templateUrl: './clientes-novo.component.html',
  styleUrl: './clientes-novo.component.scss',
})
export class ClientesNovoComponent {
  private readonly toast = inject(AppToastService);
  private readonly api = inject(SheetsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  salvando = false;
  erro = '';

  readonly form = this.fb.nonNullable.group({
    nome: ['', nomeClienteValidator],
    telefone: ['', celularBrObrigatorioValidator],
  });

  salvar(): void {
    if (this.salvando) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const nome = v.nome.trim();
    const tel = v.telefone.trim();
    const payload = {
      nome,
      telefone: tel || undefined,
      celular: tel || undefined,
    };

    this.salvando = true;
    this.erro = '';

    this.api
      .listClientes()
      .pipe(
        switchMap((items) => {
          const dup = findClienteCadastroDuplicado(items ?? [], payload);
          if (dup) {
            throw new Error(dup.message);
          }
          return this.api.createCliente(payload);
        }),
      )
      .subscribe({
        next: () => {
          this.salvando = false;
          this.toast.show(CLIENTE_SALVO_TOAST_MSG);
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
