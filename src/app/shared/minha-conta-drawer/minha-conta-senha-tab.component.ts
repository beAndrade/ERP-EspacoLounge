import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MinhaContaDrawerService } from './minha-conta-drawer.service';

@Component({
  selector: 'app-minha-conta-senha-tab',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './minha-conta-senha-tab.component.html',
})
export class MinhaContaSenhaTabComponent {
  readonly d = inject(MinhaContaDrawerService);
}
