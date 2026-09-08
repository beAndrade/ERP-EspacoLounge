# Components inventory

Classification uses Design System categories. Paths are under `src/app/` unless noted.

## Primitive

| Item | Path / note |
|------|-------------|
| `saas-select` | `shared/components/saas-select/` |
| `table-empty` | `shared/table-empty/` |
| `cliente-avatar` | `shared/cliente-avatar/` |
| `profissional-avatar` | `shared/profissional-avatar/` |
| `ui-tip-trigger` | `shared/ui-tip-trigger/` |
| `flip-dropdown-panel` | directive under `shared/` |
| `form-req` / `system-checkbox` | CSS primitives in `app/styles/` |

## Composite

| Item | Path / note |
|------|-------------|
| `app-toast` | `shared/app-toast/` |
| `agenda-modal-calendar` | `shared/components/agenda-modal-calendar/` |
| `cliente-drawer-periodo-filtro` | `shared/cliente-drawer-periodo-filtro/` |
| `comanda-resumo-bar` | `shared/comanda-resumo-bar/` |

## Layout

| Item | Path / note |
|------|-------------|
| App shell (sidebar, nav, drawer hosts) | `app.component.*` |
| Sidebar novo / profile | `layout/sidebar-novo-menu/`, `layout/sidebar-profile/` |
| List page shell | `app/styles/list-page-shell.scss` |
| Table card shell | `app/styles/table-card-shell.scss` |
| Drawer stack / responsive | `app/styles/drawer-stack.scss`, `_drawer-responsive.scss` |
| `cliente-drawer-shell` | `shared/cliente-cadastro-drawer/` |

## Feature

| Item | Path / note |
|------|-------------|
| Cadastro drawers (cliente, produto, serviço, …) | `shared/*-cadastro-drawer/` |
| WhatsApp enviar modal | `shared/whatsapp/` |
| Financeiro bloquear btn | `shared/financeiro-bloquear-btn/` |
| Feature page shells | `features/financeiro/pages/shell/`, `features/configuracoes/pages/shell/` |
| Agenda / comanda domain UI | `features/agenda/`, comanda hosts |

## Future components (not built in Sprint 6)

Aspirational primitives (CSS/markup patterns exist; no dedicated Angular components yet):

- `NexaButton`
- `NexaBadge`
- `NexaCard`
- `NexaDialog`
- `NexaTable`
- `NexaInput`

Do not create these shells empty in Sprint 6 beyond the reserved `components/` folder.

## Legacy notes

- `shared/components/` only holds a subset of primitives; many shared pieces live as sibling folders under `shared/`.
- Feature drawers hosted globally create Shared → Feature coupling (known debt from Sprint 1C).
