import {
  ApplicationRef,
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
import { AgendaNovoComponent } from '../../features/agenda/pages/novo/agenda-novo.component';
import {
  AbrirCadastroClientePayload,
  ClienteCadastroDrawerService,
} from '../cliente-cadastro-drawer/cliente-cadastro-drawer.service';
import { AgendaNovoGlobalService } from './agenda-novo-global.service';
import {
  type OrcamentoPrintPayload,
} from '../../features/orcamentos/pages/main/orcamento-print.component';
import { OrcamentoPreviewOverlayComponent } from '../../features/orcamentos/pages/main/orcamento-preview-overlay.component';
import { WhatsappEnviarModalComponent } from '../whatsapp/whatsapp-enviar-modal.component';
import type { WhatsappEnviarContexto } from '../../core/models/whatsapp.model';
import { SheetsApiService } from '../../core/services/sheets-api.service';
import { AppToastService } from '../app-toast/app-toast.service';

function formataMoeda(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

@Component({
  selector: 'app-agenda-novo-global-host',
  standalone: true,
  imports: [
    AgendaNovoComponent,
    OrcamentoPreviewOverlayComponent,
    WhatsappEnviarModalComponent,
  ],
  templateUrl: './agenda-novo-global-host.component.html',
  styleUrl: './agenda-novo-global-host.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class AgendaNovoGlobalHostComponent implements OnInit, OnDestroy {
  readonly d = inject(AgendaNovoGlobalService);
  private readonly clienteDrawer = inject(ClienteCadastroDrawerService);
  private readonly api = inject(SheetsApiService);
  private readonly toast = inject(AppToastService);
  private readonly appRef = inject(ApplicationRef);

  @ViewChild(AgendaNovoComponent) private agendaRef?: AgendaNovoComponent;

  private readonly hostEl = inject(ElementRef<HTMLElement>).nativeElement;
  private restoreBodyPortal: (() => void) | null = null;

  previewDados: OrcamentoPrintPayload | null = null;
  whatsappAberto = false;
  whatsappCtx: WhatsappEnviarContexto | null = null;
  private whatsappIdAt: string | null = null;

  ngOnInit(): void {
    this.restoreBodyPortal = portalHostElementToBody(this.hostEl);
  }

  ngOnDestroy(): void {
    this.restoreBodyPortal?.();
    this.restoreBodyPortal = null;
  }

  abrirClienteNovo(): void {
    this.clienteDrawer.abrirNovo('', {
      onSalvo: (salvo) => {
        this.agendaRef?.aplicarClienteAposCriacao(salvo);
      },
    });
  }

  onAbrirCadastroCliente(payload: AbrirCadastroClientePayload = {}): void {
    const c = this.agendaRef?.clienteSelecionado();
    const cid = c?.id?.trim();
    if (!cid) return;
    this.clienteDrawer.abrirEdicaoPorLinkSidebar(cid, payload, {
      nomeLista: String(c?.nome ?? '').trim(),
      callbacks: {
        onSalvo: (salvo) => {
          this.agendaRef?.aplicarClienteAposCriacao(salvo);
        },
      },
    });
  }

  onImprimirOrcamento(payload: OrcamentoPrintPayload): void {
    this.previewDados = payload;
  }

  fecharPreviewOrcamento(): void {
    this.previewDados = null;
  }

  imprimirPreviewOrcamento(): void {
    if (!this.previewDados) return;
    this.appRef.tick();
    queueMicrotask(() => window.print());
  }

  whatsappPreviewOrcamento(): void {
    if (!this.previewDados) return;
    this.onWhatsappOrcamento(this.previewDados);
  }

  onWhatsappOrcamento(payload: OrcamentoPrintPayload): void {
    const tel = String(payload.telefone ?? '').trim();
    if (tel.length < 10) {
      this.toast.show('Cliente sem telefone para WhatsApp.');
      return;
    }
    const resumo = payload.itens
      .map((it) =>
        it.total > 0
          ? `• ${it.descricao}: ${formataMoeda(it.total)}`
          : `• ${it.descricao}`,
      )
      .join('\n');
    this.whatsappIdAt = payload.idAtendimento;
    this.whatsappCtx = {
      telefone: tel,
      clienteId: payload.clienteId,
      clienteNome: payload.clienteNome,
      idAtendimento: payload.idAtendimento,
      templateCodigo: 'orcamento',
      variaveis: {
        cliente: payload.clienteNome,
        numero_comanda: payload.numeroComanda || '',
        resumo,
        valor: formataMoeda(payload.total),
      },
    };
    this.whatsappAberto = true;
  }

  fecharWhatsapp(): void {
    this.whatsappAberto = false;
    this.whatsappCtx = null;
  }

  onWhatsappEnviado(): void {
    const id = this.whatsappIdAt;
    this.fecharWhatsapp();
    this.whatsappIdAt = null;
    if (!id) return;
    this.api.atualizarStatusOrcamento(id, 'enviado').subscribe({
      next: () => this.toast.show('Orçamento marcado como enviado.'),
      error: (e: Error) =>
        this.toast.showWarning(e.message || 'Falha ao atualizar status.'),
    });
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: KeyboardEvent): void {
    if (this.whatsappAberto) {
      if (ev.defaultPrevented) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.fecharWhatsapp();
      return;
    }
    if (this.previewDados) {
      if (ev.defaultPrevented) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.fecharPreviewOrcamento();
      return;
    }
    if (!this.d.aberto) return;
    if (this.clienteDrawer.isAberto) return;
    if (ev.defaultPrevented) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    this.d.fechar();
  }
}
