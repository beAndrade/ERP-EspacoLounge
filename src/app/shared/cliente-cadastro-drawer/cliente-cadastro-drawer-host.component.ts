import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { portalHostElementToBody } from '../drawer-body-portal';
import { FormsModule } from '@angular/forms';
import type { ComandaResumoPagamentos, Cliente } from '../../core/models/api.models';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { FaturarDrawerComponent } from '../../features/agenda/pages/hub/faturar-drawer.component';
import { NovaComandaDrawerComponent } from '../../features/agenda/pages/hub/nova-comanda-drawer.component';
import { AgendaNovoComponent } from '../../features/agenda/pages/novo/agenda-novo.component';
import {
  ClienteCadastroDrawerService,
  DRAWER_ANIM_MS,
  type AbrirCadastroClientePayload,
} from './cliente-cadastro-drawer.service';
import { ClienteAtualizarCreditoDrawerComponent } from './cliente-atualizar-credito-drawer.component';
import { ClienteDrawerShellComponent } from './cliente-drawer-shell.component';

type FaturarEmpilhadoCtx = {
  idAtendimento: string;
  resumo: ComandaResumoPagamentos;
  creditoAUsar?: number;
  nomeCliente: string;
  modoVerPagamentos?: boolean;
};

@Component({
  selector: 'app-cliente-cadastro-drawer-host',
  standalone: true,
  imports: [
    FormsModule,
    ClienteDrawerShellComponent,
    ClienteAtualizarCreditoDrawerComponent,
    NovaComandaDrawerComponent,
    FaturarDrawerComponent,
    AgendaNovoComponent,
  ],
  templateUrl: './cliente-cadastro-drawer-host.component.html',
  styleUrl: './cliente-cadastro-drawer-host.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ClienteCadastroDrawerHostComponent implements OnInit, OnDestroy {
  readonly d = inject(ClienteCadastroDrawerService);

  private readonly hostEl = inject(ElementRef<HTMLElement>).nativeElement;
  private restoreBodyPortal: (() => void) | null = null;

  private readonly api = inject(SheetsApiService);

  ngOnInit(): void {
    this.restoreBodyPortal = portalHostElementToBody(this.hostEl);
    this.d.editarAgendamentoHistoricoHandler = (idAt, ymd) =>
      this.abrirEditAgendamentoEmpilhado(idAt, ymd);
  }

  ngOnDestroy(): void {
    this.d.editarAgendamentoHistoricoHandler = null;
    this.restoreBodyPortal?.();
    this.restoreBodyPortal = null;
  }

  @ViewChild(NovaComandaDrawerComponent)
  private comandaEmpilhadaRef?: NovaComandaDrawerComponent;

  @ViewChild(AgendaNovoComponent)
  private editAgendamentoEmpilhadoRef?: AgendaNovoComponent;

  comandaEmpilhadaDataYmd: string | null = null;

  atualizarCreditoAberto = false;
  atualizarCreditoPanelOpen = false;
  private atualizarCreditoCloseTimer: ReturnType<typeof setTimeout> | null =
    null;

  faturarEmpilhadoAberto = false;
  faturarEmpilhadoPanelOpen = false;
  faturarEmpilhadoCtx: FaturarEmpilhadoCtx | null = null;
  private faturarEmpilhadoCloseTimer: ReturnType<typeof setTimeout> | null =
    null;

  editAgendamentoEmpilhadoAberto = false;
  editAgendamentoEmpilhadoPanelOpen = false;
  editAgendamentoEmpilhadoCtx: {
    data: string;
    profissional_id: number;
    id_atendimento: string;
  } | null = null;
  private editAgendamentoEmpilhadoCloseTimer: ReturnType<
    typeof setTimeout
  > | null = null;

  ariaLabelComandaEmpilhada(): string {
    const ctx = this.d.comandaEmpilhadaContexto;
    if (ctx && !ctx.acessar) return 'Nova comanda';
    const n = ctx?.numeroComandaTitulo;
    return typeof n === 'number' && n > 0
      ? `Visualizando comanda #${n}`
      : 'Visualizando comanda';
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (this.atualizarCreditoAberto) {
      ev.preventDefault();
      this.fecharAtualizarCreditoEmpilhado();
      return;
    }
    if (this.faturarEmpilhadoAberto) {
      ev.preventDefault();
      this.fecharFaturarEmpilhado();
      return;
    }
    if (this.editAgendamentoEmpilhadoAberto) {
      ev.preventDefault();
      this.fecharEditAgendamentoEmpilhado();
      return;
    }
    if (this.d.tratarEscapeComandaEmpilhadaNaFicha()) {
      ev.preventDefault();
      return;
    }
    if (!this.d.aberto) return;
    ev.preventDefault();
    this.d.fechar();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement | null;
    if (this.d.descontoDropdownAberto && !t?.closest?.('.cliente-discount')) {
      this.d.descontoDropdownAberto = false;
    }
  }

  fecharComandaEmpilhada(): void {
    this.d.fecharFichaEmpilhadaSincrono();
    this.fecharAtualizarCreditoEmpilhadoSincrono();
    this.fecharFaturarEmpilhadoSincrono();
    this.fecharEditAgendamentoEmpilhadoSincrono();
    this.d.fecharComandaEmpilhada();
    this.recarregarAbaHistoricoClienteSeAberta();
  }

  fecharFichaEmpilhada(): void {
    this.d.fecharFichaEmpilhada();
  }

  onAbrirAtualizarCreditoEmpilhado(): void {
    const cid = String(this.d.clienteId ?? '').trim();
    if (!cid) return;
    this.abrirDrawerAnimado(
      () => {
        this.atualizarCreditoAberto = true;
      },
      (open) => {
        this.atualizarCreditoPanelOpen = open;
      },
    );
  }

  fecharAtualizarCreditoEmpilhado(): void {
    if (!this.atualizarCreditoAberto) return;
    this.atualizarCreditoPanelOpen = false;
    if (this.atualizarCreditoCloseTimer != null) {
      clearTimeout(this.atualizarCreditoCloseTimer);
    }
    this.atualizarCreditoCloseTimer = setTimeout(() => {
      this.atualizarCreditoCloseTimer = null;
      this.atualizarCreditoAberto = false;
    }, DRAWER_ANIM_MS);
  }

  private fecharAtualizarCreditoEmpilhadoSincrono(): void {
    if (this.atualizarCreditoCloseTimer != null) {
      clearTimeout(this.atualizarCreditoCloseTimer);
      this.atualizarCreditoCloseTimer = null;
    }
    this.atualizarCreditoPanelOpen = false;
    this.atualizarCreditoAberto = false;
  }

  onAtualizarCreditoSalvo(ev: { saldo: number }): void {
    this.d.aplicarCreditoSaldoAposAjuste(ev.saldo);
    this.fecharAtualizarCreditoEmpilhado();
    this.d.recarregarCreditoPainel();
  }

  onComandaEmpilhadaExcluida(): void {
    this.fecharComandaEmpilhada();
  }

  onComandaEmpilhadaDataYmd(ymd: string | null): void {
    this.comandaEmpilhadaDataYmd = ymd;
  }

  onSalvarComandaEmpilhada(): void {
    if (this.editAgendamentoEmpilhadoAberto && this.editAgendamentoEmpilhadoRef) {
      this.editAgendamentoEmpilhadoRef.salvar();
      return;
    }
    this.fecharComandaEmpilhada();
  }

  onEditarAgendamentoDesdeComandaEmpilhada(): void {
    const ctx = this.d.comandaEmpilhadaContexto;
    const idAt = ctx?.idAtendimento?.trim();
    const ymd = (ctx?.dataYmd ?? '').trim();
    if (!idAt || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
    this.abrirEditAgendamentoEmpilhado(idAt, ymd);
  }

  private abrirEditAgendamentoEmpilhado(idAt: string, ymd: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
    this.editAgendamentoEmpilhadoCtx = {
      data: ymd,
      profissional_id: 0,
      id_atendimento: idAt,
    };
    this.abrirDrawerAnimado(
      () => {
        this.editAgendamentoEmpilhadoAberto = true;
      },
      (open) => {
        this.editAgendamentoEmpilhadoPanelOpen = open;
      },
    );
  }

  fecharEditAgendamentoEmpilhado(): void {
    if (!this.editAgendamentoEmpilhadoAberto) return;
    this.editAgendamentoEmpilhadoPanelOpen = false;
    if (this.editAgendamentoEmpilhadoCloseTimer != null) {
      clearTimeout(this.editAgendamentoEmpilhadoCloseTimer);
    }
    this.editAgendamentoEmpilhadoCloseTimer = setTimeout(() => {
      this.editAgendamentoEmpilhadoCloseTimer = null;
      this.editAgendamentoEmpilhadoAberto = false;
      this.editAgendamentoEmpilhadoCtx = null;
    }, DRAWER_ANIM_MS);
  }

  onSalvoEditAgendamentoEmpilhado(): void {
    const comandaAberta = this.d.comandaEmpilhadaAberta;
    this.fecharEditAgendamentoEmpilhado();
    if (comandaAberta) {
      setTimeout(() => this.comandaEmpilhadaRef?.recarregarDadosComanda(), 0);
    }
    if (this.d.abaAtiva === 'Agendamentos') {
      this.d.aplicarFiltroAgendamentosHistorico();
    }
    if (this.d.abaAtiva === 'Vendas') {
      this.d.aplicarFiltroVendasHistorico();
    }
  }

  private recarregarAbaHistoricoClienteSeAberta(): void {
    if (this.d.abaAtiva === 'Agendamentos') {
      this.d.aplicarFiltroAgendamentosHistorico();
      return;
    }
    if (this.d.abaAtiva === 'Vendas') {
      this.d.aplicarFiltroVendasHistorico();
    }
  }

  onFaturarDebitoPainel(idAtendimento: string): void {
    const id = String(idAtendimento ?? '').trim();
    if (!id) return;
    this.api.listComandaPagamentos(id).subscribe({
      next: ({ resumo }) => {
        this.onAbrirFaturarComandaEmpilhada({
          idAtendimento: id,
          resumo,
          modoVerPagamentos: false,
        });
      },
    });
  }

  onAbrirFaturarComandaEmpilhada(ev: {
    idAtendimento: string;
    resumo: ComandaResumoPagamentos;
    creditoAUsar?: number;
    dataComandaYmd?: string | null;
    modoVerPagamentos?: boolean;
  }): void {
    const nomeCliente =
      this.d.comandaEmpilhadaContexto?.cliente?.nome?.trim() ?? '';
    this.comandaEmpilhadaDataYmd =
      ev.dataComandaYmd ?? this.comandaEmpilhadaDataYmd;
    this.faturarEmpilhadoCtx = {
      idAtendimento: ev.idAtendimento,
      resumo: ev.resumo,
      creditoAUsar: ev.creditoAUsar,
      nomeCliente,
      modoVerPagamentos: ev.modoVerPagamentos ?? false,
    };
    this.abrirDrawerAnimado(
      () => {
        this.faturarEmpilhadoAberto = true;
      },
      (open) => {
        this.faturarEmpilhadoPanelOpen = open;
      },
    );
  }

  fecharFaturarEmpilhado(): void {
    this.fecharFaturarEmpilhadoComCallback(() => {
      this.comandaEmpilhadaRef?.recarregarAposFaturar();
    });
  }

  onFaturaComandaEmpilhadaSucesso(): void {
    const modoVer = this.faturarEmpilhadoCtx?.modoVerPagamentos ?? false;
    this.fecharFaturarEmpilhadoComCallback(() => {
      if (modoVer) {
        this.comandaEmpilhadaRef?.recarregarAposFaturar();
      }
      this.d.recarregarDebitosPainel();
    });
    if (modoVer) return;
    this.fecharComandaEmpilhada();
  }

  onAbrirCadastroClienteDesdeComandaEmpilhada(
    payload: AbrirCadastroClientePayload,
  ): void {
    this.d.abrirFichaEmpilhadaPorSidebar(payload, {
      callbacks: this.callbacksSidebarComandaEmpilhada(),
    });
  }

  private callbacksSidebarComandaEmpilhada(): {
    onClienteCarregado: (c: Cliente) => void;
    onSalvo: (salvo: Cliente) => void;
  } {
    return {
      onClienteCarregado: (c) => {
        const ctx = this.d.comandaEmpilhadaContexto;
        const cid = c.id?.trim();
        if (!cid || ctx?.clienteId?.trim() !== cid) return;
        this.d.comandaEmpilhadaContexto = { ...ctx, cliente: c };
      },
      onSalvo: (salvo) => {
        const ctx = this.d.comandaEmpilhadaContexto;
        const cid = salvo.id?.trim();
        if (cid && ctx?.clienteId?.trim() === cid) {
          this.d.comandaEmpilhadaContexto = { ...ctx, cliente: salvo };
        }
        if (cid) {
          setTimeout(
            () => this.comandaEmpilhadaRef?.recarregarClienteAposSalvarFicha(cid),
            0,
          );
        }
      },
    };
  }

  private fecharFaturarEmpilhadoComCallback(apos?: () => void): void {
    if (!this.faturarEmpilhadoAberto) {
      apos?.();
      return;
    }
    this.faturarEmpilhadoPanelOpen = false;
    if (this.faturarEmpilhadoCloseTimer != null) {
      clearTimeout(this.faturarEmpilhadoCloseTimer);
    }
    this.faturarEmpilhadoCloseTimer = setTimeout(() => {
      this.faturarEmpilhadoCloseTimer = null;
      this.faturarEmpilhadoAberto = false;
      this.faturarEmpilhadoCtx = null;
      apos?.();
    }, DRAWER_ANIM_MS);
  }

  private fecharFaturarEmpilhadoSincrono(): void {
    if (this.faturarEmpilhadoCloseTimer != null) {
      clearTimeout(this.faturarEmpilhadoCloseTimer);
      this.faturarEmpilhadoCloseTimer = null;
    }
    this.faturarEmpilhadoPanelOpen = false;
    this.faturarEmpilhadoAberto = false;
    this.faturarEmpilhadoCtx = null;
  }

  private fecharEditAgendamentoEmpilhadoSincrono(): void {
    if (this.editAgendamentoEmpilhadoCloseTimer != null) {
      clearTimeout(this.editAgendamentoEmpilhadoCloseTimer);
      this.editAgendamentoEmpilhadoCloseTimer = null;
    }
    this.editAgendamentoEmpilhadoPanelOpen = false;
    this.editAgendamentoEmpilhadoAberto = false;
    this.editAgendamentoEmpilhadoCtx = null;
  }

  private abrirDrawerAnimado(
    marcarAberto: () => void,
    setPanelOpen: (open: boolean) => void,
  ): void {
    marcarAberto();
    setPanelOpen(false);
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPanelOpen(true));
      });
    });
  }
}
