import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-em-breve',
  standalone: true,
  template: `
    <div class="em-breve">
      <h1 class="em-breve__titulo">{{ titulo }}</h1>
      <p class="em-breve__hint">
        Esta secção ainda está em desenvolvimento.
      </p>
    </div>
  `,
  styles: `
    .em-breve {
      max-width: 32rem;
      padding: 1rem 0;
    }
    .em-breve__titulo {
      margin: 0 0 0.5rem;
      font-size: 1.35rem;
      font-weight: 600;
    }
    .em-breve__hint {
      margin: 0;
      color: var(--color-muted);
      line-height: 1.5;
    }
  `,
})
export class EmBreveComponent {
  readonly titulo =
    (inject(ActivatedRoute).snapshot.data['titulo'] as string) || 'Página';
}
