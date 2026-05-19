import fs from 'fs';
import path from 'path';

const src = path.resolve('src/app/pages/comandas/comandas.component.scss');
const dest = path.resolve(
  'src/app/shared/cliente-cadastro-drawer/cliente-cadastro-drawer-host.component.scss',
);
const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/);
const slice = (a, b) => lines.slice(a, b + 1).join('\n');

const header = `/* Drawer global de cadastro de cliente (host em app-root). */
.app-drawer {
  --drawer-inset-x: 15px;
  --drawer-pad-x: var(--drawer-inset-x);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background: #ffffff;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  transform: translateX(100%);
  transition: transform 0.43s cubic-bezier(0.22, 1, 0.36, 1);

  &--open {
    transform: translateX(0);
  }
}

@media (min-width: 1648px) {
  .app-drawer {
    right: 0;
    width: auto;
    left: max(320px, calc(100vw - 1400px));
  }

  .cliente-drawer.app-drawer {
    left: auto;
    right: 0;
    width: min(1200px, 100vw);
  }
}
`;

const body = [slice(1036, 1050), slice(1116, 1119), slice(1289, 2834)].join(
  '\n\n',
);

const footer = `
@keyframes clienteTogglePulse {
  0% {
    box-shadow: 0 0 0 0 var(--toggle-pulse-color, rgba(79, 70, 229, 0.35));
  }
  70% {
    box-shadow: 0 0 0 8px transparent;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

@keyframes clienteToggleLiquidOn {
  0% {
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    transform: translate3d(0, 0, 0) scaleX(1) scaleY(1);
  }
  30% {
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    transform: translate3d(0, 0, 0) scaleX(1.1) scaleY(0.985);
  }
  60% {
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
    transform: translate3d(calc(var(--knob-x-end) - 0.5px), 0, 0) scaleX(1.03)
      scaleY(0.995);
  }
  100% {
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    transform: translate3d(var(--knob-x-end), 0, 0) scaleX(1) scaleY(1);
  }
}

@keyframes clienteToggleLiquidOff {
  0% {
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    transform: translate3d(var(--knob-x-end), 0, 0) scaleX(1) scaleY(1);
  }
  30% {
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    transform: translate3d(var(--knob-x-end), 0, 0) scaleX(1.1) scaleY(0.985);
  }
  60% {
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
    transform: translate3d(1px, 0, 0) scaleX(1.03) scaleY(0.995);
  }
  100% {
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    transform: translate3d(0, 0, 0) scaleX(1) scaleY(1);
  }
}

.cliente-save-hint {
  flex: 1 1 auto;
  margin: 0;
  font-size: 13px;
  text-align: left;

  &--error {
    color: #ff4d4f;
  }
}

.cliente-footer-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
`;

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, `${header}\n\n${body}\n\n${footer}`);
console.log('Wrote', dest);
