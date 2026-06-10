import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MinhaContaDrawerService } from './minha-conta-drawer.service';

@Component({
  selector: 'app-minha-conta-email-tab',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './minha-conta-email-tab.component.html',
})
export class MinhaContaEmailTabComponent {
  readonly d = inject(MinhaContaDrawerService);
}
