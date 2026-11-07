# SlotMatrix — Alocação Multi-Recurso, Proteção Anti-No-Show & Smart Waitlist B2B SaaS

> **ISW055 · Atividade 9 · Fork e Plano de Negócio**  
> **ISW055 · Atividade 10 · Seu Negócio no Ar (Transição de Domínio)**  
> **ISW055 · Atividade 11 · Assinatura recorrente (SaaS completo — planos, limites e assinatura com Stripe)**  
> **Orientador:** Professor [@siriani](https://github.com/siriani)  
> **Autor:** Lucas Tetsuya Hiratuca  
> **Repositório do Produto:** [LucasHiratuca/slotmatrix](https://github.com/LucasHiratuca/slotmatrix)  
> *(Continuação direta da disciplina a partir do histórico de [LucasHiratuca/Entrega-da-Atividade](https://github.com/LucasHiratuca/Entrega-da-Atividade))*

---

## 1. Nome e Frase

**SlotMatrix** — Plataforma SaaS B2B de agendamento multi-recurso atômico com proteção financeira anti-no-show e lista de espera inteligente para clínicas diagnósticas, centros cirúrgicos e operações críticas.

---

## 2. A Dor

* **Quem sofre:** Diretores clínicos, coordenadores de enfermagem e gestores de centros médicos ambulatoriais, clínicas de imagem/diagnóstico e estúdios especializados.
* **Quando:** No momento em que um procedimento de alta complexidade necessita da **convergência obrigatória e pontual de múltiplos recursos escassos** (ex.: Médico Especialista + Sala Cirúrgica/Estéril com higienização + Equipamento de R$ 500.000 como Ultrassom Doppler ou Laser).
* **Quanto custa hoje:**
  * **Financeiro:** Ociosidade de salas e equipamentos custa entre **R$ 8.000 e R$ 25.000 por mês** por unidade. O índice médio de no-show (faltas sem aviso prévio) no setor é de 18% a 22%, destruindo a margem operacional.
  * **Tempo:** Equipes de recepção gastam em média **3 horas diárias** confirmando horários no WhatsApp e telefonando manualmente para pacientes na tentativa de preencher desistências de última hora.
  * **Risco Operacional e Sanitário:** Agendas convencionais geram *double-booking* de equipamentos e ignoram tempos de assepsia/esterilização entre exames, expondo o estabelecimento a contaminações cruzadas e penalidades da vigilância sanitária.
* **Como resolvem hoje:** Usam uma colcha de retalhos: prontuários eletrônicos com agendas individuais de médicos isoladas (Doctoralia/Feegow), combinados com planilhas Excel paralelas para controlar quem pegou qual máquina, e cadernos de papel ou grupos de WhatsApp para listas de espera.

---

## 3. Persona

* **Nome:** Dra. Renata Silveira, 42 anos.
* **Perfil e Rotina:** Médica radiologista e sócia-diretora da *VitaScan Diagnósticos* (clínica em Marília/SP com 4 salas de exames e 12 funcionários). Sua rotina se divide entre laudar exames complexos e apagar incêndios administrativos.
* **O que ela tenta fazer:** Maximizar a ocupação dos 3 aparelhos de ultrassom de alta resolução e garantir que as salas cirúrgicas ambulatoriais nunca fiquem ociosas, mantendo rigoroso controle sanitário de 20 minutos de desinfecção entre biópsias.
* **O que atrapalha:** Pacientes faltam de surpresa em procedimentos caros (prejuízo de R$ 600 cada); secretárias agendam dois médicos no mesmo horário para usar a mesma sala; quando alguém cancela às 08h da manhã, o horário das 09h fica vago porque a secretária não tem tempo de ligar para os 15 pacientes que queriam aquela vaga.

---

## 4. Concorrentes e Alternativas

1. **Doctoralia / Feegow / Clinab:**
   * *O que fazem mal:* São agendas focadas **estritamente no profissional de saúde** (médico). Não possuem o conceito de alocação atômica multi-recurso: agendam o médico mas não reservam o equipamento ou a sala cirúrgica simultaneamente, provocando colisões físicas graves. Não oferecem lista de espera inteligente com oferta temporizada.
2. **Planilhas Excel + Grupos de WhatsApp:**
   * *O que fazem mal:* 100% manuais, sem concorrência atômica (*race conditions* constantes), sem validação de regras de sanitização (`TurnaroundBuffer`), sem cobrança automatizada de sinal garantidor e vulneráveis a erros de digitação humana.
3. **Agendadores Genéricos (Calendly / Acuity Scheduling / Google Agenda):**
   * *O que fazem mal:* Desenhados para reuniões individuais de escritório ou consultoria remota de 1-para-1. Não suportam alocação de 3 categorias distintas com tempos assimétricos de limpeza (`prepMinutes` e `cleanupMinutes`), nem políticas B2B de cancelamento com retenção de percentual no Stripe.

---

## 5. Proposta de Valor

> *"Alocação atômica e simultânea de Especialista, Sala e Equipamento sem conflitos, com cobrança automática de sinal anti-no-show e recuperação autônoma de vagas ociosas via Smart Waitlist em minutos."*

---

## 6. Modelo de Assinatura Recorrente com Stripe (Atividade 11)

O faturamento é recorrente mensal (**SaaS B2B via Stripe Subscriptions**), baseado no volume de recursos físicos gerenciados e funcionalidades de automação:

| Plano | Preço Mensal | Limites e Direitos do Plano | Público-Alvo e Motivo do Upgrade |
| :--- | :---: | :--- | :--- |
| **STARTER (Free)** | **R$ 0,00 / mês** | • Até **5 recursos alocáveis** ativos (`SPECIALIST`, `ROOM`, `EQUIPMENT`)<br>• Até 100 agendamentos/mês<br>• Limite estrito no backend (HTTP 402 se tentar criar o 6º recurso)<br>• *Smart Waitlist e Sinal Anti-No-Show DESATIVADOS* | Clínicas e consultórios individuais em fase de teste. |
| **PRO** *(Principal)* | **R$ 349,00 / mês** | • Até **20 recursos alocáveis** ativos<br>• Agendamentos **ILIMITADOS**<br>• **Buffers assimétricos de esterilização** (`TurnaroundBuffer`)<br>• **Proteção Anti-No-Show** (cobrança de sinal e retenção de penalidade no Stripe)<br>• **Smart Waitlist Ativa** (oferta em cascata com expiração temporizada)<br>• **Portal Público de Autoagendamento** liberado | Clínicas de médio porte e centros diagnósticos. O plano se paga recuperando **uma única falta** evitada por mês. |
| **ENTERPRISE** | **R$ 890,00 / mês** | • Recursos e agendamentos **ILIMITADOS**<br>• Multi-unidades / Multi-workspace<br>• **Fila de Espera com Prioridade VIP**<br>• Exportação de **AuditLog Imutável** para auditorias ISO e vigilância sanitária<br>• Suporte prioritário com SLA | Redes de policlínicas e hospitais-dia com alta exigência de conformidade e auditoria. |

### Ciclo de Vida da Assinatura e Webhooks (4 Eventos Fundamentais)

O plano do usuário **nunca muda porque o navegador voltou do checkout dizendo que deu certo**. Ele muda única e exclusivamente quando o Webhook oficial do Stripe chega, tem sua assinatura criptográfica validada e é processado com garantia de idempotência.

```mermaid
flowchart LR
    User["Usuário (Owner/Admin)"] -->|1. POST /billing/checkout| API["API SlotMatrix"]
    API -->|2. Cria Sessão mode='subscription'| Stripe["Stripe Checkout"]
    Stripe -->|3. Pagamento de Teste (4242)| Stripe
    Stripe -->|4. Webhook Assinado| Webhook["POST /webhooks/stripe"]
    Webhook -->|5. Valida Assinatura & Idempotência| Domain["Subscription Aggregate"]
    Domain -->|6. Atualiza Plano & Customer ID| DB[(MariaDB)]
    User -->|7. POST /billing/portal| Portal["Stripe Customer Portal"]
    Portal -->|8. Cancelamento / Troca de Plano| Stripe
```

| Evento Stripe | Quando chega | Ação no Domínio SlotMatrix |
| :--- | :--- | :--- |
| `checkout.session.completed` | Cliente conclui o checkout da assinatura recorrente | Associa o `customer` e `subscription` do Stripe ao Workspace e ativa o plano (`PRO` ou `ENTERPRISE`) |
| `customer.subscription.updated` | Troca de plano, renovação ou alteração no portal | Atualiza o plano e o status da assinatura (`ACTIVE`, `PAST_DUE`, `CANCELED`) |
| `customer.subscription.deleted` | A assinatura foi encerrada | Reseta o Workspace de volta ao plano gratuito `STARTER` e cancela a subscrição |
| `invoice.payment_failed` | A cobrança mensal recorrente falhou | Marca a assinatura como `PAST_DUE` (inadimplente), bloqueando novos agendamentos operacionais |

---

## 7. Portal do Cliente (Billing Portal) e Painel Administrativo de MRR

1. **Customer Billing Portal (`POST /api/billing/portal`):**
   * Redireciona o cliente diretamente para a página segura hospedada pela Stripe (`stripe.billingPortal.sessions.create`).
   * Permite troca de cartão, alteração de plano e cancelamento imediato sem intervenção manual do suporte.
2. **Dashboard do SaaS & Cálculo de MRR (`GET /api/admin/metrics`):**
   * Disponível para perfis `ADMIN` e `OWNER`.
   * Calcula o **Monthly Recurring Revenue (MRR)** somando assinaturas ativas:
     $$\text{MRR} = (\text{Qtd}_{\text{PRO}} \times \text{R\$} 349,00) + (\text{Qtd}_{\text{ENTERPRISE}} \times \text{R\$} 890,00)$$
   * Exibe total de assinaturas ativas, distribuição por plano (`STARTER`, `PRO`, `ENTERPRISE`) e os últimos logs de auditoria imutáveis.

---

## 8. Lean Canvas (9 Blocos)

| Bloco | Conteúdo para o SlotMatrix |
| :--- | :--- |
| **1. Problema** | • Colisão de agendas e *double-booking* de salas cirúrgicas e equipamentos de alto custo.<br>• Prejuízo massivo com no-show (18% a 22% de ociosidade não remunerada).<br>• Vagas canceladas em cima da hora que ficam ociosas por lentidão na confirmação manual via WhatsApp.<br>• *Alternativas atuais:* Planilhas Excel, Doctoralia, prontuários sem trava de equipamento, telefone manual. |
| **2. Segmentos de Clientes** | • Clínicas de diagnóstico por imagem e ultrassonografia.<br>• Centros cirúrgicos ambulatoriais e clínicas de cirurgia plástica/dermatológica.<br>• Laboratórios de fisioterapia e estúdios especializados com salas de máquinas.<br>• *Early Adopters:* Clínicas com 2 a 5 salas e equipamentos compartilhados que sofrem com atritos diários de agenda. |
| **3. Proposta Única de Valor** | Alocação atômica multi-recurso com buffers assimétricos de esterilização, proteção financeira anti-no-show e fila de espera inteligente que preenche desistências em cascata sem intervenção humana. |
| **4. Solução** | 1. **Engine de Alocação Concorrente:** Bloqueio atômico com `SELECT ... FOR UPDATE` de Médico + Sala + Máquina respeitando tempos de limpeza.<br>2. **Anti-No-Show no Stripe:** Cobrança de sinal e regras de cancelamento com retenção escalonada.<br>3. **Smart Waitlist em Cascata:** Oferta temporizada com expiração automática (30 min) para o próximo paciente da fila. |
| **5. Canais** | • Parcerias com revendedores e locadores de equipamentos de imagem (GE, Philips, Canon).<br>• Demonstrações guiadas em eventos da Associação Brasileira de Clínicas Médicas.<br>• Tráfego pago focado em termos específicos: *"software agenda centro cirúrgico"*, *"controle de salas e equipamentos clínica"*. |
| **6. Fontes de Receita** | • Assinatura mensal recorrente via Stripe: Plano Starter (R$ 0/mês), Plano Pro (R$ 349/mês) e Plano Enterprise (R$ 890/mês).<br>• Taxa transacional opcional sobre processamento de sinal garantidor anti-no-show. |
| **7. Estrutura de Custos** | • Infraestrutura de nuvem: Servidor Docker/Portainer na Fatec / VPS de produção, instâncias MariaDB e Redis.<br>• Provedor de Object Storage S3 para documentação e laudos.<br>• Taxas financeiras de gateway (Stripe Checkout). |
| **8. Métricas-Chave** | • MRR e número de Workspaces ativos.<br>• Volume mensal de agendamentos processados.<br>• Valor total de receita salva via retenção de sinal e vagas recuperadas pela Waitlist.<br>• Net Promoter Score (NPS) dos gestores operacionais. |
| **9. Vantagem Injusta** | Algoritmo proprietário de resolução de conflitos simultâneos com buffers assimétricos (`TurnaroundBuffer`) somado à trilha de auditoria imutável por triggers MySQL, difícil de ser reproduzido por prontuários genéricos legados. |

---

## 9. Mapa de Reaproveitamento da Arquitetura

| Peça do Projeto Anterior (Filmes) | O que vira no SaaS SlotMatrix | Descrição Técnica no Domínio |
| :--- | :--- | :--- |
| **Catálogo de Filmes (TMDB)** | **Catálogo de Recursos e Procedimentos (`catalog`)** | O consumo de filmes dá lugar à modelagem completa de `BookableResources` (`SPECIALIST`, `ROOM`, `EQUIPMENT`) e `ServiceProcedures` com requisitos de competências e tempos de esterilização. |
| **Microsserviço de Login + RBAC** | **Módulo de Tenancy & RBAC (`tenancy`)** | Autenticação JWT com isolamento multi-tenant (`Workspace`) e 4 papéis de negócio rígidos: `OWNER`, `ADMIN`, `COORDINATOR` e `SPECIALIST` com enforcement HTTP 403. |
| **Logs e Auditoria com Redis** | **Barramento de Eventos e Trilha Imutável (`audit`)** | Eventos temporais de auditoria no Redis Streams (`audit:events`) e tabela `audit_logs` blindada por triggers MySQL contra `UPDATE` e `DELETE` para eventos de negócio. |
| **Upload e Perfil (Garage S3 / MinIO)** | **Storage de Laudos e Equipamentos (`storage`)** | O upload de avatares é reaproveitado para anexos do domínio (comprovantes de manutenção de equipamentos, laudos técnicos e guias de autorização médica) via streaming seguro pelo backend. |
| **Plano Premium (Stripe Checkout & Webhooks)** | **Assinaturas Recorrentes, Portal & MRR (`billing`)** | Cobrança mensal via Stripe Subscriptions (`mode='subscription'`), Customer Portal para troca/cancelamento, 4 webhooks sincronizados, enforcement de limites por requisição (HTTP 402) e dashboard com cálculo de MRR. |
| **Swagger, Workers e Testes Automatizados** | **OpenAPI 3.0, BullMQ & Vitest** | Documentação interativa Swagger em `/api/docs`, fila BullMQ com Redis para expiração de ofertas de waitlist e 7 suítes completas de testes automatizados com 40 asserções. |

---

## 10. Credenciais do Seed e Demonstração Operacional

Ao inicializar o sistema (ou rodar `npm run seed`), o banco é provisionado com dois Workspaces configurados para demonstração imediata:

| Workspace | Plano / Status | E-mail de Acesso | Senha | Papel RBAC | Cenário de Demonstração |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **VitaScan Diagnósticos** (`vitascan-diagnosticos`) | `PRO` (`ACTIVE`) | `owner@vitascan.test` | `Passw0rd!` | `OWNER` | **6 Recursos Ativos** (Médicos, Salas Cirúrgicas e Aparelhos de Ultrassom), exames com **buffer de 20 min de desinfecção**, agendamentos ativos e **3 pacientes na Smart Waitlist** prontos para receber oferta em cascata! |
| **VitaScan Diagnósticos** | `PRO` (`ACTIVE`) | `admin@vitascan.test` | `Passw0rd!` | `ADMIN` | Gestão de equipe, catálogo de procedimentos e auditoria. |
| **VitaScan Diagnósticos** | `PRO` (`ACTIVE`) | `coord@vitascan.test` | `Passw0rd!` | `COORDINATOR` | Operação diária: confirmação, check-in, no-show e cancelamentos. |
| **VitaScan Diagnósticos** | `PRO` (`ACTIVE`) | `spec@vitascan.test` | `Passw0rd!` | `SPECIALIST` | Visão da grade clínica (bloqueado com HTTP 403 ao tentar criar recursos ou alterar planos). |
| **Estúdio Aura** (`estudio-aura`) | `STARTER` (`TRIALING`) | `owner@aura.test` | `Passw0rd!` | `OWNER` | Cravado no **limite exato de 5/5 recursos ativos**. Tentar criar o 6º recurso dispara imediatamente `HTTP 402 QuotaExceededError`. Ao assinar o plano Pro no Stripe, o limite é ampliado para 20 recursos e a criação do 6º recurso passa a ser aceita! |

---

## 11. Como Executar

### Portas dos Serviços
* **MySQL / MariaDB (`slotmatrix_db`):** `localhost:13308`
* **Redis (`slotmatrix_redis`):** `localhost:16381`
* **API HTTP + Swagger (`slotmatrix_api`):** `http://localhost:18081` (Swagger em `http://localhost:18081/api/docs`)
* **Console Web React (`slotmatrix_web`):** `http://localhost:18174`

### Execução via Docker Compose
```bash
docker compose up --build -d
```

### Executar Testes Automatizados (40 Testes em 7 Suítes)
```bash
cd api
npm install
npm test
```
