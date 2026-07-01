import { Component, ViewEncapsulation, inject } from '@angular/core';
import { AppToastService } from './app-toast.service';

@Component({
  selector: 'app-app-toast',
  standalone: true,
  template: `
    @if (toast(); as t) {
      <div
        class="app-toast"
        [class.app-toast--visible]="t.visible"
        role="status"
        aria-live="polite"
      >
        <span
          class="app-toast__icon"
          [class.app-toast__icon--warning]="t.variant === 'warning'"
          aria-hidden="true"
        >
          @if (t.variant === 'warning') {
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          } @else {
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          }
        </span>
        <span class="app-toast__text">{{ t.message }}</span>
      </div>
    }
  `,
  styles: [
    `
      .app-toast {
        position: fixed;
        top: 0;
        left: 50%;
        z-index: 12000;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        max-width: min(92vw, 420px);
        margin: 0;
        padding: 10px 18px 10px 12px;
        border-radius: 999px;
        background: #fff;
        color: #3f3f46;
        font-size: 14px;
        font-weight: 500;
        line-height: 1.35;
        box-shadow:
          0 4px 16px rgba(15, 23, 42, 0.1),
          0 1px 3px rgba(15, 23, 42, 0.06);
        pointer-events: none;
        opacity: 0;
        transform: translate(-50%, calc(-100% - 12px));
        transition:
          transform 0.34s cubic-bezier(0.22, 1, 0.36, 1),
          opacity 0.28s ease;
      }

      .app-toast--visible {
        opacity: 1;
        transform: translate(-50%, 20px);
      }

      .app-toast__icon {
        display: inline-flex;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #22c55e;
        color: #fff;
      }

      .app-toast__icon--warning {
        background: #f59e0b;
        color: #fff;
      }

      .app-toast__text {
        white-space: normal;
        text-align: left;
      }
    `,
  ],
  encapsulation: ViewEncapsulation.None,
})
export class AppToastComponent {
  private readonly svc = inject(AppToastService);
  readonly toast = this.svc.toast;
}
