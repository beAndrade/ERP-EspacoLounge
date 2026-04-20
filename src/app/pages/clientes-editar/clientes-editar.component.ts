import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { TelefoneBrMaskDirective } from '../../core/directives/telefone-br-mask.directive';
import { formatarTelefoneBrDeValor } from '../../core/utils/telefone-br';

@Component({
  selector: 'app-clientes-editar',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, TelefoneBrMaskDirective],
  templateUrl: './clientes-editar.component.html',
  styleUrl: '../clientes-novo/clientes-novo.component.scss',
})
export class ClientesEditarComponent implements OnInit {
  private readonly api = inject(SheetsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  clienteId = '';
  carregando = true;
  salvando = false;
  erro = '';

  readonly form = this.fb.nonNullable.group({
    nome: ['', Validators.required],
    telefone: [''],
    notas: [''],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')?.trim() ?? '';
    if (!id) {
      void this.router.navigate(['/clientes']);
      return;
    }
    this.clienteId = id;
    this.api.getCliente(id).subscribe({
      next: (c) => {
        this.form.patchValue({
          nome: c.nome,
          telefone: formatarTelefoneBrDeValor(c.telefone),
          notas: c.observacoes ?? '',
        });
        this.carregando = false;
      },
      error: (e: Error) => {
        this.erro =
          e.message ||
          'Não foi possível carregar o cliente. Verifique o ID ou a planilha.';
        this.carregando = false;
      },
    });
  }

  salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.salvando = true;
    this.erro = '';
    this.api
      .updateCliente({
        cliente_id: this.clienteId,
        nome: v.nome,
        telefone: v.telefone || undefined,
        notas: v.notas || undefined,
      })
      .subscribe({
        next: () => {
          this.salvando = false;
          void this.router.navigate(['/clientes']);
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
