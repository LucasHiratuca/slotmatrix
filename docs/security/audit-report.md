# SlotMatrix — Relatório Final de Auditoria e Endurecimento de Segurança (Fases A, B e C)

**Data:** 2026-11-12  
**Escopo avaliado:** Ambiente local do repositório `slotmatrix` (`api/`, `web/`, `docker-compose.yml`, `.env.example`, Nginx, MariaDB `:13308`, Redis `:16381`)  
**Modelo de Ameaças (Fase A):** [`docs/security/threat-model.md`](./threat-model.md)  
**Padrões de Referência *(todos verificados)*:**
- **OWASP Top 10:2025** (8ª edição, nov/2025)
- **OWASP API Security Top 10 (2023)**
- **OWASP ASVS 5.0.0** (mai/2025)
- **LGPD — Lei nº 13.709/2018** (Art. 5º II, Art. 11 e Art. 46 — dados pessoais sensíveis de saúde)

---

## 1. Sumário Executivo

A auditoria cobriu reconhecimento e modelagem de ameaças (**Fase A**), validação dinâmica não destrutiva e inventário de dependências (**Fase B**), além de remediação completa de falhas críticas e altas no back-end, front-end e infraestrutura acompanhada de suítes automatizadas de regressão (**Fase C**).

**Principais riscos identificados e corrigidos:**
1. **Webhook Stripe sem verificação obrigatória de assinatura (`SEC-01`, Crítica):** O ramo `else` em `POST /api/webhooks/stripe` aceitava JSON sem `stripe-signature`, permitindo que qualquer atacante fizesse upgrade gratuito de qualquer clínica via `checkout.session.completed`. Removido o fallback inseguro; a assinatura criptográfica `stripe-signature` via `Stripe.webhooks.constructEvent` agora é obrigatória (`401` se ausente ou inválida).
2. **Upload e download anônimos cross-tenant com Stored XSS same-origin (`SEC-02`, Crítica):** `POST /api/upload` e `GET /api/documents/:key(*)` estavam fora do `RouterKit`, sem autenticação nem isolamento de tenant, e aceitavam `.svg`/`.html`. Foram protegidos com autenticação + `resolveTenant`, papel mínimo `COORDINATOR` no upload, allowlist restrita (`PDF`, `PNG`, `JPEG`, `WebP`) com validação de *magic bytes*, prefixo obrigatório `workspaces/<tenantId>/docs/`, bloqueio de path traversal, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox` e `Content-Disposition: attachment`.
3. **Credenciais S3 fallback hardcoded em código (`SEC-03`, Crítica):** Removidas chaves literais fallback de `api/src/shared/infrastructure/s3-storage.ts`; em `NODE_ENV=production` o serviço falha fechado (`fail-closed`) se `S3_ACCESS_KEY`/`S3_SECRET_KEY` estiverem ausentes.
4. **Endpoint `/api/billing/simulate` e UI demo ativos por omissão (`SEC-04`, Crítica/Alta):** `POST /api/billing/simulate` agora é bloqueado (`403`) em `NODE_ENV=production` ou quando `ENABLE_BILLING_SIMULATOR !== 'true'`. No front-end (`LoginView.tsx`, `BillingView.tsx`, `App.tsx`), contas de demonstração e simulador financeiro são ocultados por padrão e **removidos por tree-shaking** do bundle de produção (`vite build`).
5. **Vazamento cross-tenant de MRR em `GET /api/admin/metrics` (`SEC-05`, Alta):** Corrigido para consultar exclusivamente a assinatura e os logs do próprio `tenant.tenantId`, eliminando a exposição global do MRR de outras clínicas.
6. **Sessão JWT em `localStorage` sem revogação no logout (`SEC-06`, Alta):** Login e registro agora emitem cookie `slotmatrix_session` com `HttpOnly; SameSite=Lax; Path=/api` (`Secure` sob HTTPS) e `jti` por token. Implementados `POST /api/auth/logout` (com blacklist de `jti` em Redis + memória) e `GET /api/auth/session`. O front-end não grava mais JWT em `localStorage`.
7. **Condições de corrida `TOCTOU` de cota e `ER_LOCK_DEADLOCK` sob concorrência (`SEC-07`, Alta):** Cota de recursos (`CreateBookableResourceUseCase`, `SetResourceMaintenanceBlockUseCase`) e agendamentos/ofertas (`ScheduleMultiResourceBookingUseCase`, `ClaimWaitlistOfferUseCase`) passaram a rodar dentro de `uow.run` sob locks transacionais (`FOR UPDATE`), com retry automático em `ER_LOCK_DEADLOCK` (`mysql.ts`) e mapeamento de conflitos residuais para `409 CONCURRENCY_CONFLICT` (`exception-filter.ts`).
8. **Endurecimento de RBAC, Rate Limit, CORS, Security Headers e Infraestrutura (`SEC-08` a `SEC-12`):** `GET /api/members` e `GET /api/webhook-channels` restritos a `ADMIN+`; rate limiting em login, registro, portal público e uploads (`429 RATE_LIMITED`); CORS restrito por allowlist com `credentials: true`; `X-Powered-By` desabilitado; Swagger/OpenAPI e `seedDemoData` bloqueados em produção; Nginx com `CSP` e security headers; `docker-compose.yml` sem senhas hardcoded, Redis com `--requirepass`, portas DB/Redis presas a `127.0.0.1` e container da API rodando com `USER node`.

---

## 2. Registro de Evidências Dinâmicas (Antes vs. Depois)

Os testes dinâmicos locais foram precedidos de backup do banco MariaDB e restauração limpa ao término.

| Vetor / Cenário Testado (Ambiente Local `:18081` / `:18174`) | Resultado **Antes** (Fase B PoC) | Resultado **Depois** (Fase C Hardened) |
| :--- | :--- | :--- |
| `POST /api/webhooks/stripe` sem cabeçalho `stripe-signature` | `200 {"received":true,"status":"processed"}` (upgrade gratuito para `PRO`) | **`401 Unauthorized`** (assinatura criptográfica obrigatória) |
| `POST /api/billing/simulate` (`OWNER`) | `200` (upgrade gratuito para `ENTERPRISE`) | **`403 Forbidden`** quando `ENABLE_BILLING_SIMULATOR !== 'true'` ou produção |
| `GET /api/admin/metrics` por nova clínica `STARTER` isolada | `200` com `mrrCents: 34900, activeSubscriptionsCount: 6` (dados globais) | **`200` com `mrrCents: 0, activeSubscriptionsCount: 1`** (escopo estrito ao tenant) |
| `POST /api/upload` sem autenticação | Aceitava arquivo anônimo | **`401 Unauthorized`** (+ `403` para `SPECIALIST`, `422` para SVG/magic bytes falsos) |
| Corrida de cota: `8x POST /api/resources` simultâneos em `STARTER` (limite 5) | `8x 201` (ultrapassou limite para 8 recursos!) | **`5x 201` e `3x 402 QuotaExceededError`** (limite respeitado sob carga real MariaDB) |
| Corrida de agendamento: `6x POST /api/public/book/vitascan-diagnosticos/schedule` idênticos | `1x 201` e `5x 500 INTERNAL_ERROR` (`ER_LOCK_DEADLOCK` errno 1213) | **`2x 201` (capacidade real paralela sem sobreposição) e `4x 409 CONFLICT`**, **`0x 500`** |
| `Origin: https://evil.example.com` + Security Headers | `access-control-allow-origin: *`, `X-Powered-By: Express`, sem `X-Frame-Options` / `nosniff` | **Sem ACAO para origem não autorizada**, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-Powered-By` ausente |
| Sessão no navegador (Playwright Chromium `:18174`) | `localStorage.getItem('slotmatrix_token')` continha JWT; reload dependia do `localStorage` | **`localStorageToken: null`**, cookie `slotmatrix_session` com `HttpOnly: true, SameSite: Lax`, F5 mantém sessão, logout revoga `jti` no servidor |
| Bundle de produção (`web/dist/assets/*.js`) | Contas demo e `Passw0rd!` visíveis por padrão | **`Passw0rd!` e painel de simulação ausentes (`false`)** por tree-shaking em `vite build` |

---

## 3. Matriz Consolidada de Achados e Remediações

| ID | Sev. | Título do Achado | Classificação (OWASP / ASVS / LGPD) | Arquivos Afetados | Status após Fase C |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **Crítica** | Bypass de verificação em `POST /api/webhooks/stripe` sem `stripe-signature` | API Top 10:2023 `API2`/`API10`; Top 10:2025 `A08`; ASVS 5.0 V13 | `api/src/presentation/http/routes.ts`, `api/src/billing/infrastructure/stripe-client.ts` | **Corrigido e coberto por teste** |
| **SEC-02** | **Crítica** | `POST /api/upload` e `GET /api/documents/:key(*)` públicos sem auth, sem tenant e com risco Stored XSS (`.svg`/`.html`) | API1:2023 BOLA; Top 10:2025 `A01`/`A05`; ASVS 5.0 V5/V8; LGPD Art. 46 | `api/src/presentation/http/app.ts`, `api/src/shared/infrastructure/upload-security.ts` | **Corrigido e coberto por teste** |
| **SEC-03** | **Crítica** | Credenciais S3 hardcoded como fallback e ausência de fail-closed em produção | Top 10:2025 `A02`/`A04`; ASVS 5.0 V13 | `api/src/shared/infrastructure/s3-storage.ts`, `api/src/infrastructure/mysql-infrastructure.ts` | **Corrigido e coberto por teste** |
| **SEC-04** | **Crítica** | `POST /api/billing/simulate` e UI demo expostos sem trava de ambiente (`Passw0rd!` + upgrade grátis) | API5:2023; Top 10:2025 `A01`/`A02`/`A06`; ASVS 5.0 V13 | `api/src/presentation/http/routes.ts`, `api/src/main-api.ts`, `web/src/LoginView.tsx`, `web/src/BillingView.tsx`, `web/src/App.tsx` | **Corrigido e coberto por teste** |
| **SEC-05** | **Alta** | `GET /api/admin/metrics` expunha MRR e assinaturas globais cross-tenant | API1:2023 BOLA / API3:2023; Top 10:2025 `A01`; ASVS 5.0 V8 | `api/src/presentation/http/routes.ts` | **Corrigido e coberto por teste** |
| **SEC-06** | **Alta** | JWT armazenado em `localStorage`, algoritmo não fixado no verify e ausência de revogação no logout | Top 10:2025 `A07`; ASVS 5.0 V7/V9; LGPD Art. 46 | `api/src/shared/infrastructure/security.ts`, `router-kit.ts`, `routes.ts`, `mysql-infrastructure.ts`, `web/src/App.tsx`, `web/src/api.ts`, `ErrorBoundary.tsx` | **Corrigido e coberto por teste** |
| **SEC-07** | **Alta** | Condição de corrida TOCTOU em cota de plano e deadlocks `500` em agendamentos concorrentes | Top 10:2025 `A06`/`A10`; API6:2023; ASVS 5.0 V11 | `api/src/catalog/application/use-cases.ts`, `scheduling/application/use-cases.ts`, `mysql.ts`, `mysql-repositories.ts`, `in-memory.ts`, `exception-filter.ts` | **Corrigido e coberto por teste (unitário + MariaDB real)** |
| **SEC-08** | **Alta** | `docker-compose.yml` com senhas padrão hardcoded, Redis sem `--requirepass` e portas DB/Redis abertas em `0.0.0.0` | Top 10:2025 `A02`; ASVS 5.0 V13 | `docker-compose.yml`, `.env.example` | **Corrigido** *(obs.: container local do Redis de dev continua sem senha até recriação com `.env`)* |
| **SEC-09** | **Média** | Ausência de rate limiting em `/auth/*`, `/public/book/:slug/*` e `/upload` | API4:2023; Top 10:2025 `A06`/`A07` | `api/src/presentation/http/rate-limit.ts`, `app.ts` | **Corrigido e coberto por teste** |
| **SEC-10** | **Média** | CORS irrestrito (`*`), Swagger público em produção e ausência de security headers / CSP | API8:2023; Top 10:2025 `A02`; ASVS 5.0 V3/V13 | `api/src/presentation/http/app.ts`, `web/nginx.conf` | **Corrigido e coberto por teste** |
| **SEC-11** | **Média** | `GET /api/members` e `GET /api/webhook-channels` acessíveis a `SPECIALIST` | API5:2023; Top 10:2025 `A01`; LGPD Art. 46 (princípio da necessidade) | `api/src/presentation/http/routes.ts` | **Corrigido e coberto por teste** |
| **SEC-12** | **Baixa** | Containers `api`/`worker` rodando como `root` em `api/Dockerfile` | Top 10:2025 `A02` | `api/Dockerfile` | **Corrigido** (`USER node`) |
| **SEC-13** | **Média / Manut.** | Dependências com CVEs conhecidas em `npm audit` (runtime `zod`, `minio` + devDeps `vitest`/`vite`) | Top 10:2025 `A03`; ASVS 5.0 V15 | `api/package.json`, `web/package.json` | **Identificado — Requer planejamento** *(mudanças semver major)* |

---

## 4. Análise de Dependências (`npm audit`)

Os relatórios completos gerados na auditoria foram preservados em `docs/security/npm-audit-api.json` e `docs/security/npm-audit-web.json`:

- **`api/` (11 vulnerabilidades totais: 2 críticas, 5 altas, 4 moderadas):**
  - *Runtime direto:* `zod` (`^3.23.8`, severidade **alta**, correção sugerida pela tree requer **semver major** `zod@4.6.7`, impactando também `zod-to-json-schema ^3.23.5`); `minio` (`^8.0.7`, severidade **alta** via dependências transitivas `query-string`, `decode-uri-component` e `stream-json`, para o qual o `npm audit` sugere downgrade major para `minio@7.1.3` — alternativa recomendada é avaliar `@aws-sdk/client-s3` ou atualização de `minio` quando upstream corrigir as transitivas).
  - *Somente dev/test (`vitest`/`tinypool`/`vite`/`esbuild`):* 2 críticas, 1 alta, 3 moderadas (correção em `vitest@5.1.0`, semver major; não executam em produção).
- **`web/` (6 vulnerabilidades totais: 2 críticas, 1 alta, 3 moderadas):**
  - *Todas em dependências de build/teste (`vitest`, `tinypool`, `vite`, `esbuild`, `vite-node`, `@vitest/mocker`):* zero CVEs reportadas nas dependências de runtime do navegador (`react`, `react-dom`, `lucide-react`, `@fontsource/instrument-sans`). Atualização requer salto major (`vite@8.3.8`, `vitest@5.1.0`).

---

## 5. Suítes Automatizadas Executadas Após a Última Edição

1. **Back-end (`cd api && npm test` + `npm run build`):**
   - **8 arquivos de teste, 50/50 testes passando**, `tsc --noEmit` com exit code `0`.
   - Nova suíte dedicada: [`api/tests/integration/security-hardening.test.ts`](../../api/tests/integration/security-hardening.test.ts) (10 testes cobrindo webhook Stripe assinado/não assinado, bloqueio de `/billing/simulate`, isolamento de `/admin/metrics`, sessão `HttpOnly` + revogação no logout, RBAC `/members` e `/webhook-channels`, segurança de `/upload` e `/documents`, proteção TOCTOU de cota e double-booking, CORS/CSP/rate-limit/Swagger, e fail-closed de `loadEnv()` em produção).
2. **Front-end (`cd web && npm test` + `npm run build`):**
   - **4 arquivos de teste, 20/20 testes passando** (incluindo os 4 cenários E2E de `App.live-verify.test.tsx` contra API real em `:18081` e [`web/src/__tests__/Security.regression.test.tsx`](../../web/src/__tests__/Security.regression.test.tsx)).
   - Build de produção Vite (`tsc -b && vite build`) limpo, com eliminação estática de `Passw0rd!` e UI do simulador confirmada em `dist/assets/*.js`.

---

## 6. Ferramentas Não Disponíveis Neste Ambiente (Comandos para Execução Local / CI)

As ferramentas CLI externas abaixo **não estavam instaladas** nesta máquina Windows (`Get-Command` retornou inexistente) e não foram executadas:

```powershell
# 1. Varredura de segredos no repositório e histórico completo do Git
gitleaks detect --source . --verbose
trufflehog git file://. --only-verified

# 2. Análise estática SAST com regras TypeScript/Express/React
semgrep scan --config p/typescript --config p/nodejs --config p/owasp-top-ten --config p/react .

# 3. Scanner de vulnerabilidades em imagens Docker, filesystem e Dockerfiles
trivy fs . --severity HIGH,CRITICAL
trivy config .

# 4. Encaminhamento local real de webhooks do Stripe CLI (modo teste)
stripe listen --forward-to http://localhost:18081/api/webhooks/stripe
stripe trigger checkout.session.completed
```

---

## 7. Riscos Residuais e Recomendações Operacionais (Produção / LGPD)

1. **TLS / Terminação HTTPS e HSTS:** Em homologação local, Nginx (`:18174`) e API (`:18081`) operam em HTTP. Em produção, publicar exclusivamente atrás de reverse proxy TLS 1.2+/1.3 terminando HTTPS, enviar `Strict-Transport-Security` e `X-Forwarded-Proto: https` (permitindo que o cookie `slotmatrix_session` ative a flag `Secure`).
2. **Recriação da Infraestrutura Docker com `.env`:** Copie `.env.example` para `.env`, gere segredos aleatórios (`openssl rand -hex 32`) para `JWT_SECRET`, `BILLING_WEBHOOK_SECRET`, `MARIADB_PASSWORD`, `REDIS_PASSWORD` e chaves S3, e recrie os containers com `docker compose up -d --build` para ativar `--requirepass` no Redis e `USER node` na API.
3. **Dados de Saúde no Portal Público & Fluxo LGPD:** O portal público `POST /api/public/book/:slug/schedule` agora possui rate limit (`20 req / 5 min / IP+slug`), mas não implementa desafio anti-bot (Cloudflare Turnstile / hCaptcha) nem confirmação por e-mail/OTP antes do bloqueio de agenda. Recomenda-se adicionar verificação de desafio anti-bot em implantações expostas à internet, além de rotina automatizada de retenção/anonimização de dados de pacientes (LGPD Art. 15 e 16).
4. **Rate Limiter Distribuído:** O limitador implementado em `api/src/presentation/http/rate-limit.ts` é *in-memory* por processo; em escala horizontal com múltiplas réplicas de `slotmatrix_api`, migrar o contador para Redis (`rate-limit-redis` ou script Lua atômico).
