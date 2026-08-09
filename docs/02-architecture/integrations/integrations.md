# Integrations

# Purpose

Centralize every external integration used by Nexa.

---

## Current

Google Calendar

Google Sheets (legacy)

WhatsApp

---

## Planned

Evolution API

Stripe

Mercado Pago

OpenPix

Google OAuth

Microsoft OAuth

Email Provider

SMS Provider

Cloud Storage

---

## Integration Principles

External providers should never contain business logic.

Every integration must be isolated behind a service layer.

Modules communicate with integrations through the Core.

No module should directly depend on third-party SDKs.