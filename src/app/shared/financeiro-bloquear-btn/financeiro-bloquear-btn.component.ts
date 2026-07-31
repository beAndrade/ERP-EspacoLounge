import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AdminPinService } from '../../core/services/admin-pin.service';

@Component({
  selector: 'app-financeiro-bloquear-btn',
  standalone: true,
  templateUrl: './financeiro-bloquear-btn.component.html',
  styleUrl: './financeiro-bloquear-btn.component.scss',
})
export class FinanceiroBloquearBtnComponent {
  private readonly adminPin = inject(AdminPinService);
  private readonly router = inject(Router);

  bloquear(ev?: Event): void {
    ev?.preventDefault();
    ev?.stopPropagation();
    this.adminPin.clear();
    const path = this.router.url.split('?')[0] ?? '';
    if (!path.startsWith('/financeiro')) {
      void this.router.navigate(['/financeiro']);
    }
  }
}
