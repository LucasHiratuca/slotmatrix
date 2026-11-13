# Pesquisa de Referências e Propostas Estruturais — Fase 3B (Lote 1)

> **Status de acesso à web:** Ambiente **com acesso à web ativo** (`search_web`). Todas as 18 referências deste lote foram verificadas na documentação oficial e páginas públicas de produto, marcadas individualmente na coluna **Verificação** (`Verificado na web`).
> **Identidade e Persona:** *Calor clínico* (papel sálvia `#F3F5F4` no claro, mineral escuro `#0E1514` no escuro, petróleo `#0F5E6B` como marca). Usuária central: **Dra. Renata Silveira** (radiologista e sócia-diretora da *VitaScan Diagnósticos*) e sua **recepção**, que operam sob pressão e precisam enxergar simultaneamente **Especialista + Sala + Equipamento + Limpeza** sem risco de colisão.

---

## Capítulo 1 — Agenda (Matriz de Alocação Multi-Recurso)

### a) Tabela de 6 Referências Analisadas

| Produto / Template | URL | Verificação | Estrutura | O que funciona para a SlotMatrix | O que NÃO serve e por quê |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **1. Bryntum Scheduler Pro (`EventBuffer`)** | `https://bryntum.com/products/schedulerpro/` | Verificado na web | Linha do tempo horizontal por recurso com `preamble` (preparo) e `postamble` (limpeza) acoplados ao bloco principal (`useBufferFromAssignments`). | Cauda hachurada de pós-atendimento (`cleanupMinutes`) presa ao bloco do atendimento com largura proporcional na mesma raia. | Visual de Gantt industrial/engenharia pesado, com dezenas de colunas de planilha à esquerda que poluem a leitura rápida da recepção. |
| **2. Doctolib Pro (Agendas Ressources)** | `https://info.doctolib.fr/` | Verificado na web | Agendas médicas vinculadas a *agendas recursos* (salas e ecógrafos) organizadas por serviço clínico, com bloqueio cruzado automático. | Linguagem clínica calma, foco no nome do paciente como primeira informação do bloco e status de chegada imediato (`Paciente chegou`). | Visão padrão em colunas verticais por dia funciona para 1 médico, mas quebra ao comparar 6 a 15 recursos heterogêneos simultaneamente. |
| **3. Resource Guru (Schedule & Clash Engine)** | `https://resourceguruapp.com/features/resource-scheduling` | Verificado na web | Grade horizontal agrupada em *People*, *Equipment* e *Meeting Rooms*, com mapa de calor de ocupação diária e alerta imediato de colisão. | Coluna esquerda sticky com avatar/ícone do recurso + indicador de ocupação do dia; separação limpa entre humanos, salas e máquinas. | Blocos pensados para projetos de dias/semanas (agências), sem precisão de minutos nem janela de esterilização obrigatória entre clientes. |
| **4. FullCalendar (Resource Timeline View)** | `https://fullcalendar.io/docs/timeline-view` | Verificado na web | Matriz com `resourceGroupField` (grupos colapsáveis por categoria), `slotDuration` linear e cabeçalho sticky em duas camadas. | Agrupamento colapsável por categoria (`Especialistas`, `Salas`, `Equipamentos`) com linha vertical vermelha/petróleo indicando o horário atual (`Agora`). | Sem conceito nativo de vínculo visual entre 3 raias que pertencem ao mesmo agendamento atômico. |
| **5. Float (Resource Timeline & Capacity)** | `https://www.float.com/features/resource-scheduling` | Verificado na web | Timeline full-viewport com controles compactos de zoom (`− / +`), densidade de linha e drawer lateral sob demanda ao clicar em uma alocação. | A matriz ocupa 100% da altura útil da viewport; a barra de ferramentas usa uma única linha de 48–52px sem legendas extensas empurrando a grade. | Foco em horas semanais por projeto; não diferencia visualmente o estado financeiro do sinal (`PENDING_DEPOSIT`) do status clínico. |
| **6. Notion Calendar / Cron** | `https://www.notion.so/product/calendar` | Verificado na web | Grade de precisão tipográfica (`tabular-nums`), destaque sutil da faixa de horário comercial e painel lateral de contexto rápido. | Eixo de horas limpo sem cortar o último rótulo (`20:00`), contraste entre madrugada/noite e horário comercial (`08:00–18:00`), atalhos `Alt + ←/→`. | Desenhado para agenda individual de reuniões; não exibe raias horizontais de múltiplos recursos físicos. |

### b) Padrões Extraídos (Hierarquia, Densidade, Ação e Estados)
- **Hierarquia:** Toolbar única de `52px` no topo (data + 3 indicadores leves do dia + zoom `−/+` + botão de legenda em popover + CTA único `Novo agendamento`) → Matriz ocupando toda a altura da viewport (`calc(100vh - 148px)`). Dentro do bloco: **1º Nome do paciente** (`font-semibold`), **2º Procedimento / Horário**, **3º Ícone + cor de status**, seguido pela cauda hachurada de `Limpeza X min`.
- **Interação de vínculo atômico:** Hover pré-visualiza a conexão entre as 3 raias; **clique seleciona** a reserva, trava o **conector vertical atômico** ligando Especialista + Sala + Equipamento e abre o **Drawer de Reserva** (`380px`) à direita. Clique em slot vazio sugere `+ Agendar às HH:00`.
- **Vazio / Erro / Carregamento / Mobile (`390px`):** Skeleton imitando as 3 raias agrupadas; dia sem reservas mantém a grade clicável com callout discreto no centro do horário comercial; em `390px`, substitui o scroll horizontal por **Cartões de Linha do Tempo do Dia** onde cada reserva já mostra suas 3 pílulas de recursos (`CR` + `S1` + `GE`) + limpeza.

### c) Três Propostas de Estrutura (com Protótipos Estáticos em `/__preview/agenda-a`, `-b`, `-c`)

#### Proposta A (Recomendada) — Matriz Clínica Full-Height + Inspector Drawer Sob Demanda (`/__preview/agenda-a`)
- **Proporções Desktop (`1440px`):** Toolbar única (`52px`) + Matriz `100%` da largura (`260px` coluna sticky de recursos com barra de uso diário + `1fr` grade horária `07:00–20:00` com horário comercial destacado). Ao clicar num bloco, abre Drawer de `380px` à direita sem espremer permanentemente a matriz.
- **Em `390px`:** Seletor de data compacto + lista cronológica de cartões atômicos (Paciente + Status + tríade `Especialista · Sala · Equipamento` + buffer de limpeza) + botão fixo `+ Novo agendamento`.
- **Ponto forte:** Máxima área horizontal para enxergar as 13 horas do dia sem rolagem excessiva e zero espaço morto abaixo da matriz.
- **Risco:** Exige que o estado selecionado do bloco (conector vertical entre as 3 raias) seja muito claro para sinalizar que o clique abre o drawer.

```text
+--------------------------------------------------------------------------------------------------+
| Agenda   Ocupação 36,1% · Faltas 0,0% · 1 vaga em oferta   [Hoje][< 11/11/2026 >] [- 100% +] [+ Novo agendamento] |
+---------------------------+----------------------------------------------------------------------+
| RECURSOS (260px sticky)   | 07:00   08:00   09:00          10:00          11:00   ...   19:00    |
+---------------------------+----------------------------------------------------------------------+
| v ESPECIALISTAS (2)       |         : (faixa comercial 08h-18h destacada)                        |
| (CR) Dra. Camila Rocha    |         :       [● Roberto Almeida · Biópsia ]                       |
|      1h20 · 17% [===    ] |         :       |  09:00–09:40               |                       |
| (HM) Dr. Henrique Mendes  |         :       |                             |                      |
+---------------------------+---------:-------|-----------------------------|----------------------+
| v SALAS (2)               |         :       | (Conector Atômico Vertical) |                      |
| [S1] Sala Estéril 01      |         :       [● Roberto Almeida · Biópsia ][/// Limpeza 20m ///]  |
|      1h40 · 21% [====   ] |         :       |  09:00–09:40                |09:40–10:00           |
+---------------------------+---------:-------|-----------------------------|----------------------+
| v EQUIPAMENTOS (2)        |         :       |                             |                      |
| <GE> USG GE Logiq E10     |         :       [● Roberto Almeida · Biópsia ][// +10m //]           |
|      1h30 · 19% [===    ] |         :          09:00–09:40                 09:40–09:50           |
+---------------------------+----------------------------------------------------------------------+
```

#### Proposta B — Split Mestre-Detalhe Permanente 72% / 28% (`/__preview/agenda-b`)
- **Proporções Desktop (`1440px`):** Coluna esquerda (`72%`) com a Matriz de Alocação; Coluna direita fixa (`28%`, `340px`) sempre aberta com "Reserva em foco" no topo e "Próximas chegadas do turno" abaixo.
- **Em `390px`:** Colapsa o painel direito em um bottom-sheet acionado por toque na reserva.
- **Ponto forte:** Detalhes da reserva e fila de chegadas visíveis sem precisar clicar primeiro.
- **Risco:** Rouba `340px` permanentes de largura horizontal da grade de horas em notebooks de `1280px–1440px`, truncando nomes em blocos de 30–40 min.

```text
+-----------------------------------------------------------------------+--------------------------+
| Agenda   [Hoje][< 11/11/2026 >] [- 100% +]                            | PAINEL DO TURNO (340px)  |
+------------------------+----------------------------------------------+--------------------------+
| RECURSOS (236px)       | 08:00    09:00          10:00         11:00  | RESERVA SELECIONADA      |
+------------------------+----------------------------------------------+ Roberto Almeida          |
| (CR) Dra. Camila Rocha |          [● Roberto A. ]                     | Biópsia Guiada · 09:00   |
| [S1] Sala Estéril 01   |          [● Roberto A. ][/// 20m ///]        | • Dra. Camila Rocha      |
| <GE> USG GE Logiq E10  |          [● Roberto A. ][//10m//]            | • Sala Estéril 01 (+20m) |
|                        |                                              | • USG GE Logiq (+10m)    |
|                        |                                              | [Confirmar chegada]      |
+------------------------+----------------------------------------------+--------------------------+
```

#### Proposta C — Filtro de Categorias + Faixa de Exames Acoplados no Topo (`/__preview/agenda-c`)
- **Proporções Desktop (`1440px`):** Barra de filtro de raias (`Todos · Especialistas · Salas · Equipamentos`) + faixa horizontal de "Exames do Dia (Tríades Atômicas)" (`88px` de altura) acima da matriz; clicar em um cartão de exame filtra a matriz para exibir apenas as 3 raias daquele exame.
- **Em `390px`:** A faixa de cartões de exames torna-se a própria lista principal do dia.
- **Ponto forte:** Permite isolar com 1 clique apenas os 3 recursos envolvidos em um procedimento complexo.
- **Risco:** A faixa superior de cartões duplica informação que já está na grade e reduz a altura vertical disponível para clínicas com 10+ recursos.

```text
+--------------------------------------------------------------------------------------------------+
| Agenda   Filtro: [Todos (6)] [Especialistas (2)] [Salas (2)] [Equipamentos (2)] [+ Novo agend.]  |
+--------------------------------------------------------------------------------------------------+
| EXAMES DO DIA (clique para isolar as 3 raias):                                                   |
| [ 09:00 Roberto Almeida · Biópsia (CR + S1 + GE) ]  [ 10:15 Mariana Costa · Doppler (CR+S1+GE) ] |
+---------------------------+----------------------------------------------------------------------+
| RECURSOS FILTRADOS        | 08:00      09:00            10:00            11:00           12:00   |
+---------------------------+----------------------------------------------------------------------+
| (CR) Dra. Camila Rocha    |            [● Roberto Almeida ]              [● Mariana Costa ]      |
| [S1] Sala Estéril 01      |            [● Roberto Almeida ][/// 20m ///] [● Mariana Costa ]      |
| <GE> USG GE Logiq E10     |            [● Roberto Almeida ][//10m//]     [● Mariana Costa ]      |
+---------------------------+----------------------------------------------------------------------+
```

### d) Recomendação para a Dra. Renata e Recepção
Recomendamos a **Proposta A (`/__preview/agenda-a`)**. Durante o pico da manhã na *VitaScan*, a recepcionista precisa ver o dia inteiro de todos os médicos, salas estéreis e aparelhos de ultrassom sem rolagem horizontal claustrofóbica, mantendo a legenda recolhida em popover e abrindo o **Drawer de Reserva** apenas quando clica para fazer check-in, auditar os 20 minutos de desinfecção ou cancelar com acionamento da lista de espera.

### e) Autocrítica: *"Esta tela poderia ser de qualquer SaaS?"*
Não. Três elementos visuais são exclusivos de agendamento clínico multi-recurso da SlotMatrix:
1. **Conector Atômico Vertical de 3 Raias:** linha vertical com nós que atravessa simultaneamente a raia médica, a sala cirúrgica e o equipamento quando uma reserva é selecionada ou pré-visualizada.
2. **Cauda Assimétrica de Esterilização (`TurnaroundBuffer`):** bloco hachurado diagonal acoplado à direita do atendimento (`20 min` na Sala Estéril vs. `10 min` no Ultrassom).
3. **Geometria por Categoria de Recurso + Uso Diário na Coluna Sticky:** círculo (`Especialista`), quadrado arredondado (`Sala` em ocre mineral) e chanfrado (`Equipamento` em ardósia), sem colidir com o verde exclusivo de `Confirmado`.

### f) Marcação de "Requer Backend"
- **Arrastar e soltar (drag-and-drop) para reagendar na matriz:** **Requer backend** (não há endpoint `PATCH /api/bookings/:id/reschedule`; reagendar hoje exige cancelar e criar nova reserva atômica). *Degradê visual:* clique em horário vazio abre diretamente o fluxo de Novo Agendamento pré-preenchido naquele horário (`onQuickSchedule({ hour })`).

---

## Capítulo 2 — Reservas (Lista Operacional + Drawer + Novo Agendamento)

### a) Tabela de 4 Referências Analisadas

| Produto / Template | URL | Verificação | Estrutura | O que funciona para a SlotMatrix | O que NÃO serve e por quê |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **1. Cal.com (Bookings Page)** | `https://cal.com/docs/core-features/bookings` | Verificado na web | Segmented control de status no topo (`Upcoming`, `Unconfirmed`, `Canceled`) + lista agrupada por data com 1 ação contextual primária e menu `⋯`. | Elimina os 3 botões coloridos repetidos em cada linha; agrupa claramente por data (`Hoje, 11 de novembro`) e isola pendências (`Aguardando sinal`). | Focado em reuniões de vídeo 1:1; não mostra recursos físicos vinculados nem valor/percentual de sinal retido. |
| **2. Cliniko (Appointments & Attendance)** | `https://www.cliniko.com/` | Verificado na web | Controle de presença clínica com transição direta `Confirmed` → `Arrived` (`Paciente chegou`) ou `Did not arrive` (`Não compareceu`). | Ação principal contextual muda conforme o ciclo de vida clínico: se `PENDING_DEPOSIT` → `Confirmar sinal`; se `CONFIRMED` → `Confirmar chegada`; se `CHECKED_IN` → `Concluir atendimento`. | Interface densa de prontuário anos 2010; modais pequenos em vez de drawer lateral limpo. |
| **3. Linear (Issue List & Detail Drawer)** | `https://linear.app/features` | Verificado na web | Linhas compactas (`56px`) de alta escaneabilidade com identificador, status semântico, metadados alinhados à direita e inspeção em drawer. | Substitui os "cards altos de 140px" atuais por linhas horizontais precisas onde o olho lê Horário → Paciente → Procedimento → Tríade de Recursos → Sinal → Status → Ação. | Densidade extrema de atalhos de engenharia; precisamos de alvos de toque de `44px` e leitura acolhedora para recepção clínica. |
| **4. Jane App (Schedule & Intake Wizard)** | `https://jane.app/features/scheduling` | Verificado na web | Fluxo de agendamento guiado passo a passo (Procedimento → Horário disponível já validado → Paciente e Sinal) com resumo claro da política. | Inspira nosso `Stepper` de 3 passos para **Novo agendamento**, mostrando exatamente quais 3 recursos (`CR + S1 + GE`) foram combinados atomicamente em cada horário. | Mistura prontuário clínico (SOAP notes) na mesma tela da recepção. |

### b) Padrões Extraídos (Hierarquia, Densidade, Ação e Estados)
- **Hierarquia:** Cabeçalho com título `"Reservas"` + busca por paciente/procedimento + Segmented Control de status (`Hoje`, `Todas`, `Aguardando sinal`, `Confirmadas`, `Em atendimento`, `Concluídas/Faltas`) + botão primário único `"Novo agendamento"`.
- **Densidade da linha:** Agrupamento por dia (`Hoje · Quarta, 11 de nov`). Cada reserva é uma linha compacta (`60px`) com: **Horário (`09:00–09:40`)** | **Avatar + Paciente** | **Procedimento** | **Tríade compacta de ícones (`CR`, `S1`, `GE`) com tooltip dos nomes completos e limpeza** | **Sinal (`R$ 220,00 · Pago`)** | **Badge de Status** | **1 Botão contextual discreto + Menu `⋯`**.
- **Regra anti-ruído cromático:** Nenhum botão vermelho fixo (`Cancelar` ou `Não compareceu`) repetido na lista; ações destrutivas ficam dentro do menu `⋯` ou no rodapé do Drawer de Reserva, com modal de confirmação que explica a consequência financeira e a oferta para a lista de espera.

### c) Duas Propostas de Estrutura

#### Proposta A (Recomendada) — Lista Agrupada por Dia + Drawer de Reserva & Novo Agendamento em Stepper Drawer
- **Proporções Desktop (`1440px`):** Barra de filtros (`52px`) + Lista full-width (`100%`) agrupada por data com linhas de `60px`. Clicar na linha abre o **Drawer de Detalhe da Reserva** (`420px`); clicar em `"Novo agendamento"` abre o **Drawer com Stepper de 3 Passos** (`480px`: `1. Procedimento e Data` → `2. Horário e Tríade de Recursos` → `3. Paciente e Sinal`).
- **Em `390px`:** Segmented control rolável horizontalmente; cada linha vira um card compacto de 2 linhas (Linha 1: Horário + Paciente + Status; Linha 2: Procedimento + 3 pílulas `CR·S1·GE` + botão contextual de `44px`).
- **Ponto forte:** Acaba com a parede de botões coloridos (azul/âmbar/vermelho) e mantém o contexto da lista enquanto a recepcionista agenda ou edita no drawer.
- **Risco:** O menu `⋯` precisa fechar automaticamente ao clicar fora e ser acessível por teclado (`Escape`).

```text
+--------------------------------------------------------------------------------------------------+
| Reservas     [Buscar paciente...]  [Hoje (4) | Aguardando sinal (1) | Confirmadas | Todas] [+ Novo agendamento] |
+--------------------------------------------------------------------------------------------------+
| HOJE · QUARTA-FEIRA, 11 DE NOVEMBRO DE 2026                                          4 reservas  |
+--------------------------------------------------------------------------------------------------+
| 09:00–09:40  (RA) Roberto Almeida   Biópsia Guiada por USG    (CR)[S1]<GE>  Sinal R$ 300   [● Confirmada]      [Confirmar chegada] [⋯] |
| 10:15–10:55  (MC) Mariana Costa     Ultrassom Doppler Vasc.   (CR)[S1]<GE>  Sinal R$ 175   [● Aguard. sinal]   [Confirmar sinal]   [⋯] |
| 14:00–14:40  (FN) Fernanda Nogueira Biópsia Guiada por USG    (HM)[S2]<PH>  Sinal R$ 300   [● Paciente chegou] [Concluir exame]    [⋯] |
+--------------------------------------------------------------------------------------------------+
```

#### Proposta B — Tabela Split com Painel de Novo Agendamento Embutido no Topo (Acordeão)
- **Proporções Desktop (`1440px`):** O fluxo de `"Novo agendamento"` abre como um painel expansível empurrando a tabela de reservas para baixo, dividido em 3 colunas horizontais simultâneas.
- **Em `390px`:** Empilha as 3 colunas do formulário acima da lista, exigindo muita rolagem para ver as reservas existentes.
- **Ponto forte:** Mostra os 3 passos do agendamento abertos ao mesmo tempo em telas largas.
- **Risco:** Empurra a lista operacional para fora da dobra sempre que a recepção está cotando um horário ao telefone.

```text
+--------------------------------------------------------------------------------------------------+
| [v NOVO AGENDAMENTO ABERTO NO TOPO (Empurra a lista para baixo)]                                 |
| [1. Procedimento e Data     ] | [2. Horários multi-recurso  ] | [3. Dados do paciente e sinal  ] |
+-------------------------------+-------------------------------+----------------------------------+
| LISTA DE RESERVAS (abaixo da dobra)                                                              |
+--------------------------------------------------------------------------------------------------+
```

### d) Recomendação para a Dra. Renata e Recepção
Recomendamos a **Proposta A**. Na rotina da recepção, consultar quem é o próximo paciente, confirmar a chegada com 1 clique e abrir um novo agendamento pelo telefone acontecem ao mesmo tempo: linhas agrupadas por dia com **1 única ação contextual** + `"Novo agendamento"` em **Drawer Stepper** preservam a lista sempre visível ao fundo e eliminam a poluição visual dos botões vermelhos repetidos.

### e) Autocrítica: *"Esta tela poderia ser de qualquer SaaS?"*
Não. Cada linha exibe a **Tríade de Alocação Atômica** (`(CR) [S1] <GE>`) com os tempos de esterilização no tooltip, o valor e status do **Sinal Anti-Falta**, e o modal de cancelamento calcula e informa explicitamente a retenção contratual do sinal e o disparo da vaga para a lista de espera em cascata.

### f) Marcação de "Requer Backend"
- **Filtro por intervalo de datas arbitrário no servidor:** A API atual (`GET /api/bookings`) retorna as reservas do workspace e o filtro por `"Hoje"` / `"Próximas"` / `"Status"` é aplicado instantaneamente no cliente sem custo de latência. Nenhuma mudança de backend necessária.

---

## Capítulo 3 — Lista de Espera (Cascata Inteligente & Ofertas Temporizadas)

### a) Tabela de 4 Referências Analisadas

| Produto / Template | URL | Verificação | Estrutura | O que funciona para a SlotMatrix | O que NÃO serve e por quê |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **1. Jane App (Automated Waitlist Notifications)** | `https://jane.app/guide/waitlist-management` | Verificado na web | Fila filtrável por procedimento/profissional com janela de preferência do paciente e disparo automático de vaga retida quando ocorre cancelamento. | Separação clara entre pacientes *Aguardando vaga* e vagas *Em oferta ativa* com reserva temporária do horário (`SlotOffer Hold`). | Não mostra visualmente a ordem de cascata (para quem a vaga vai se o paciente atual não responder a tempo). |
| **2. Doctolib Pro (Liste d'attente)** | `https://info.doctolib.fr/` | Verificado na web | Cadastro de paciente na fila via drawer rápido e agrupamento por motivo de consulta/exame. | Retira o formulário fixo do topo da página (que ocupava 35% da tela) e o transforma no CTA `"Adicionar paciente"` abrindo em drawer. | Oferta disparada em lote sem trava individual decrescente (`mm:ss`) visível para a recepcionista. |
| **3. OpenTable / Resy (Priority Notify & Waitlist)** | `https://www.opentable.com/restaurant-solutions/` | Verificado na web | Destaque de prioridade VIP, status em tempo real da mesa ofertada e separação entre fila ativa e clientes já acomodados/expirados. | Badge discreto de **Prioridade clínica/VIP** (recurso do plano Enterprise) e separação da seção `"Histórico de ofertas"` (convertidas/expiradas) no rodapé. | No Resy/OpenTable não há *hold* exclusivo com timer decrescente para 1 pessoa por vez (é corrida aberta); na clínica médica precisamos mostrar a contagem regressiva exclusiva `mm:ss`. |
| **4. Zocdoc (Live Cancellation Fill)** | `https://www.zocdoc.com/about/forsystems/` | Verificado na web | Foco no impacto operacional da vaga recuperada (horário que ficaria ocioso preenchido sem telefonema manual). | Inspira o indicador de **Vagas recuperadas / Tempo economizado** no cabeçalho da fila e a ação rápida `"Confirmar pelo paciente"` caso ele ligue na recepção. | Marketplace B2C aberto; não gerencia fila interna ordenada por prioridade clínica. |

### b) Padrões Extraídos (Hierarquia, Densidade, Ação e Estados)
- **Hierarquia em 3 zonas claras:**
  1. **Painel "Vagas em oferta agora" (destaque superior quando há `OFFERED`):** mostra o relógio regressivo real (`mm:ss`, ex.: `Expira em 18:42`), o horário segurado, o botão `"Confirmar reserva agora"` e a **Linha de Cascata**: *"Se expirar às 09:45, a oferta passará automaticamente para **#2 Patrícia Campos**"*.
  2. **Fila ativa agrupada por Procedimento:** cabeçalho do grupo já traz o nome do procedimento e a janela desejada, evitando repetir o mesmo texto longo em cada linha.
  3. **Histórico de ofertas (recolhível/separado):** registros `FULFILLED` (`Reserva confirmada`) e `EXPIRED` (`Oferta expirada`) nunca ficam misturados como se ainda disputassem vaga.

### c) Duas Propostas de Estrutura

#### Proposta A (Recomendada) — Painel de Cascata Ao Vivo + Fila Agrupada por Exame + Drawer "Adicionar Paciente"
- **Proporções Desktop (`1440px`):** Header (`52px`) com contador ativo + botão primário `"Adicionar paciente"` (abre Drawer de `400px`). Zona 1: Card horizontal `"Vaga em oferta"` com timer `mm:ss` e prévia do próximo da cascata (`#1 → #2`). Zona 2: Grupos por procedimento (`Biópsia Guiada por Ultrassom · 2 aguardando`) em linhas limpas de `56px`. Zona 3: `"Histórico da fila"` abaixo.
- **Em `390px`:** Card de oferta ativo no topo com contador `mm:ss` em destaque e botão de `44px` `"Confirmar vaga"`; fila numerada abaixo.
- **Ponto forte:** Torna visível o maior diferencial autônomo do produto (o motor de cascata com contagem regressiva real) e elimina a repetição do nome do procedimento em todas as linhas.
- **Risco:** Quando não há nenhuma oferta ativa no momento, o painel superior deve se recolher em uma faixa tranquila de status (`"Nenhuma oferta em andamento · A fila assumirá automaticamente o próximo cancelamento"`), sem parecer erro.

```text
+--------------------------------------------------------------------------------------------------+
| Lista de espera   2 aguardando · 1 oferta ativa · 1 vaga recuperada hoje     [+ Adicionar paciente] |
+--------------------------------------------------------------------------------------------------+
| ⚡ VAGA EM OFERTA AGORA (Horário segurado atomicamente)                                          |
| (#1) Marcos Oliveira · Biópsia Guiada por USG          ⏱ Expira em 24:15     [Confirmar reserva] |
|      Cascata automática: se não responder até 10:30, a vaga vai para → (#2) Patrícia Campos      |
+--------------------------------------------------------------------------------------------------+
| BIÓPSIA GUIADA POR ULTRASSOM (Janela: Hoje · 08:30 às 12:30)                       2 aguardando  |
+--------------------------------------------------------------------------------------------------+
| #1  (MO) Marcos Oliveira     (14) 99811-2201   Oferta enviada · aguarda resposta  [Confirmar]    |
| #2  (PC) Patrícia Campos     (14) 99744-5190   ★ Prioridade · Próxima da cascata  [Aguardando]   |
+--------------------------------------------------------------------------------------------------+
| > HISTÓRICO DE OFERTAS HOJE (1 convertida)                                                       |
| ✓   (CS) Cláudia Siqueira    Biópsia Guiada por USG   [● Reserva confirmada pela fila]           |
+--------------------------------------------------------------------------------------------------+
```

#### Proposta B — Quadro Kanban em 3 Colunas (Aguardando | Em Oferta | Convertidas/Expiradas)
- **Proporções Desktop (`1440px`):** 3 colunas verticais (`33%` cada) lado a lado.
- **Em `390px`:** Abas horizontais alternando entre as 3 colunas.
- **Ponto forte:** Separação espacial imediata por estado do item.
- **Risco:** Como a maioria dos itens fica em `"Aguardando"` e apenas 1 ou 2 em `"Em oferta"`, a coluna do meio fica quase vazia enquanto os nomes na coluna esquerda ficam espremidos em `320px`.

```text
+-------------------------------+-------------------------------+----------------------------------+
| AGUARDANDO VAGA (2)           | EM OFERTA AGORA (1)           | HISTÓRICO (1)                    |
+-------------------------------+-------------------------------+----------------------------------+
| [#2 Patrícia Campos         ] | [#1 Marcos Oliveira ⏱ 24:15 ] | [✓ Cláudia Siqueira            ] |
+-------------------------------+-------------------------------+----------------------------------+
```

### d) Recomendação para a Dra. Renata e Recepção
Recomendamos a **Proposta A**. A recepção precisa bater o olho e responder à pergunta: *"Quem está segurando a vaga das 10h agora, quanto tempo falta para expirar e para quem ela vai depois?"*. O painel de cascata ao vivo no topo + fila agrupada por procedimento resolve isso sem desperdiçar largura em colunas Kanban vazias.

### e) Autocrítica: *"Esta tela poderia ser de qualquer SaaS?"*
Não. O **Painel de Cascata com Contagem Regressiva (`mm:ss`) e Prévia do Próximo Paciente (`#1 → #2`)**, somado ao agrupamento por exame diagnóstico, materializa a regra de domínio `OnWaitlistOfferExpiredCascadeHandler` que nenhum CRM ou todo-list genérico possui.

### f) Marcação de "Requer Backend"
- **Disparo manual de oferta avulsa sem cancelamento prévio:** O backend dispara ofertas automaticamente em `BookingCancelled` e faz cascata em `WaitlistOfferExpired`, e permite aceitar a oferta ativa via `POST /api/waitlist/:id/accept` (`offerToken`). Quando o item está apenas `WAITING` (sem oferta ativa), mostramos claramente `"Na fila · aguarda abertura de vaga"` sem botão falso.

---

## Capítulo 4 — Visão Geral (Pulso Operacional & Valor Gerado)

### a) Tabela de 4 Referências Analisadas

| Produto / Template | URL | Verificação | Estrutura | O que funciona para a SlotMatrix | O que NÃO serve e por quê |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **1. Stripe Dashboard Home (Today's Pulse & Alerts)** | `https://docs.stripe.com/dashboard/basics` | Verificado na web | Alerta acionável no topo (só quando há pendência) + pulso em tempo real do dia separado dos resultados acumulados do mês. | Hierarquia assimétrica: primeiro *"O que precisa de você agora"*, depois o pulso da operação de hoje, sem grade monótona de 8 cards iguais. | Gráficos financeiros densos de séries temporais que não ajudam a recepcionista a decidir o próximo check-in. |
| **2. Linear (Inbox / Pulse)** | `https://linear.app/features` | Verificado na web | Saudação contextual limpa + fila enxuta de itens acionáveis com transição imediata para a tela de execução. | Cada alerta tem um botão de resolução direta (`Ver sinais pendentes`, `Acompanhar oferta`) e tempo relativo (`há 4 min`). | Estética monocromática fria demais se não combinada à saudação humana e paleta sálvia/petróleo. |
| **3. Mercury Dashboard (Balance & Tasks)** | `https://mercury.com/demo` | Verificado na web | Bloco principal de valor protegido/disponível em tipografia grande (`tabular-nums`) acompanhado de tarefas pendentes e fluxo recente. | Inspira o bloco **"O que o SlotMatrix fez pela clínica"** (Receita protegida por sinais + Vagas recuperadas pela fila + Faltas evitadas) com números animados uma única vez via `CountUp`. | Terminologia bancária de tesouraria/investimentos. |
| **4. Jane App (Practitioner Day View / Reception)** | `https://jane.app/` | Verificado na web | Visão matinal do dia clínico: resumo natural das reservas de hoje, ocupação por tipo de recurso (médicos, salas, aparelhos) e próximas ações. | Frase natural de abertura (*"Bom dia, Dra. Renata. Hoje são 4 reservas confirmadas, 1 sinal pendente e 1 vaga em oferta na fila."*) + barras horizontais de ocupação por categoria. | Mistura faturamento de convênios com a visão rápida da manhã. |

### b) Padrões Extraídos (Hierarquia, Densidade, Ação e Estados)
- **Hierarquia em 3 níveis (fim da grade de cards idênticos):**
  1. **Cabeçalho Humano + Frase-Resumo Natural:** *"Boa noite, Dra. Renata Silveira"* (conforme horário de São Paulo) + frase viva sintetizando o dia + botão primário `"Ir para a agenda de hoje"`.
  2. **Faixa "O que precisa de você agora" (Colapsável se zero pendências):** se houver sinais pendentes ou ofertas expirando, mostra cartões de ação direta; se tudo estiver em dia, vira um banner compacto de `44px` (`"Tudo em dia no turno · Nenhuma pendência imediata"`), sem ocupar uma caixa vazia gigante.
  3. **Balanço "O que o SlotMatrix fez por você" + Ocupação por Categoria + Atividade Recente com Tempo Relativo:** destaque para **Receita protegida / recuperada**, barras de ocupação (`Especialistas`, `Salas`, `Equipamentos` com as cores semânticas da Etapa 0) e últimas 5 ações com tempo relativo (`há 12 min`, tooltip com data/hora absoluta).

### c) Duas Propostas de Estrutura

#### Proposta A (Recomendada) — Saudação Editorial + Ação Imediata Compacta + Painel de Valor Clínico (2 Colunas Assimétricas 60/40)
- **Proporções Desktop (`1440px`):**
  - Topo: Saudação humana + frase natural do dia + faixa de pendências (compacta se zero alertas).
  - Miolo em 2 colunas (`60%` / `40%`):
    - **Esquerda (`60%`):** Bloco **"O que o SlotMatrix fez pela clínica"** (Receita em exames confirmados, Vagas recuperadas pela lista de espera, Taxa de faltas controlada — usando `CountUp` 1x) + **Ocupação por Categoria de Recurso** (barras comparativas de Especialistas, Salas e Equipamentos).
    - **Direita (`40%`):** **Próximas reservas do dia** (atalho rápido para check-in) + ** Últimos movimentos na clínica** (com tempo relativo `"há 5 min"`).
- **Em `390px`:** Saudação + frase natural → Alertas acionáveis → Card de Valor Gerado → Próximas reservas.
- **Ponto forte:** Conta uma história clara em 3 segundos (como está o dia, o que exige clique agora e quanto dinheiro/tempo o sistema protegeu).
- **Risco:** Precisa garantir que os números do bloco de valor usem estritamente os campos reais de `/kpis` e `/bookings` sem inventar métricas.

```text
+--------------------------------------------------------------------------------------------------+
| Bom dia, Dra. Renata Silveira                                           [Abrir agenda de hoje →] |
| Hoje são 4 reservas na clínica, 1 aguardando pagamento de sinal e 1 vaga em oferta na fila.      |
+--------------------------------------------------------------------------------------------------+
| ⚡ PRECISA DE VOCÊ AGORA (2)                                                                     |
| [● 1 reserva aguardando sinal (Mariana Costa) -> Ver]  [⏱ 1 vaga em oferta na fila -> Acompanhar] |
+------------------------------------------------------------+-------------------------------------+
| O QUE O SLOTMATRIX FEZ PELA CLÍNICA (60%)                  | PRÓXIMOS ATENDIMENTOS HOJE (40%)    |
| +-----------------+-----------------+--------------------+ | 09:00  Roberto Almeida · Biópsia    |
| | R$ 2.500,00     | 1 vaga          | 0,0% faltas        | |        (CR) [S1] <GE> · Confirmada  |
| | Receita no ciclo| Recuperada fila | Sinal anti-no-show | | 10:15  Mariana Costa · Doppler      |
| +-----------------+-----------------+--------------------+ |        (CR) [S1] <GE> · Sinal pend. |
| OCUPAÇÃO POR CATEGORIA DE RECURSO                          +-------------------------------------+
| (●) Especialistas  [========          ] 41,7%              | ÚLTIMOS MOVIMENTOS (tempo relativo) |
| [■] Salas          [=======           ] 33,3%              | • Vaga ofertada na fila    há 8 min |
| <◆> Equipamentos   [=======           ] 33,3%              | • Reserva confirmada      há 14 min |
+------------------------------------------------------------+-------------------------------------+
```

#### Proposta B — Feed Operacional em Coluna Única com KPIs em Faixa Superior
- **Proporções Desktop (`1440px`):** Faixa horizontal de 4 KPIs no topo + feed cronológico único abaixo misturando reservas, ofertas da fila e auditoria.
- **Em `390px`:** Carrossel de KPIs + feed vertical.
- **Ponto forte:** Leitura linear simples de cima para baixo.
- **Risco:** Parece um painel genérico de analytics e esconde a comparação visual de ocupação entre Especialistas, Salas e Equipamentos.

```text
+--------------------------------------------------------------------------------------------------+
| Bom dia, Dra. Renata Silveira                                                                    |
+-----------------------+-----------------------+-----------------------+--------------------------+
| [ 4 Reservas ativas ] | [ R$ 2.500 Receita  ] | [ 36,1% Ocupação    ] | [ 1 Oferta na fila     ] |
+-----------------------+-----------------------+-----------------------+--------------------------+
| FEED CRONOLÓGICO UNIFICADO DO DIA (Reservas + Fila + Auditoria)                                  |
+--------------------------------------------------------------------------------------------------+
```

### d) Recomendação para a Dra. Renata e Recepção
Recomendamos a **Proposta A**. Quando a Dra. Renata abre o sistema entre dois laudos, ela quer primeiro uma frase direta dizendo se há algum incêndio (`1 sinal pendente · 1 oferta ativa`), em seguida a prova tangível de que suas salas e ultrassons estão ocupados e protegidos contra faltas, e à direita os próximos pacientes do turno.

### e) Autocrítica: *"Esta tela poderia ser de qualquer SaaS?"*
Não. A frase natural matinal que cruza **reservas + sinais anti-falta + ofertas da fila**, o comparativo de gargalo entre as **3 categorias físicas (`Especialistas`, `Salas`, `Equipamentos`)** e o demonstrativo de **receita protegida por sinais / vagas recuperadas pela cascata** são exclusivos do domínio clínico da SlotMatrix.

### f) Marcação de "Requer Backend"
- Todos os indicadores da Proposta A são alimentados 100% pelos endpoints reais existentes (`GET /api/kpis`, `GET /api/bookings`, `GET /api/waitlist`, `GET /api/audit-logs`). Para a contagem de `"Vagas recuperadas pela fila"`, somamos entradas `FULFILLED` da lista de espera + `fulfilledWaitlistCount` de `/api/kpis`. Nenhum contrato de backend precisa ser alterado.

---

## Quadro-Resumo do Lote 1

| Tela | Referência Principal Escolhida | Estrutura Recomendada (1 linha) | Risco Principal | O que exige Backend |
| :--- | :--- | :--- | :--- | :--- |
| **1. Agenda** | **Bryntum Scheduler Pro** + **Doctolib Pro** + **Resource Guru** | **Proposta A (`/__preview/agenda-a`):** Toolbar única (`52px`) + Matriz full-height com coluna de recursos sticky (com uso do dia), conector vertical atômico nas 3 raias ao selecionar e Drawer de Reserva sob demanda (`380px`). | Garantir que o clique no bloco deixe evidente a seleção das 3 raias e a abertura do drawer. | Reagendamento por *drag-and-drop* (requer endpoint `PATCH`; resolvido abrindo novo agendamento no horário clicado). |
| **2. Reservas** | **Cal.com (Bookings)** + **Cliniko** + **Linear** | **Proposta A:** Lista agrupada por dia com Segmented Control de status (`Hoje` padrão), tríade de ícones de recursos com tooltip, **1 único botão contextual** por linha + menu `⋯` e Novo Agendamento em Drawer Stepper. | Fechamento correto do menu `⋯` e foco por teclado no Drawer Stepper. | Nada (100% suportado pela API atual). |
| **3. Lista de espera** | **Jane App (Waitlist)** + **Doctolib Pro** + **OpenTable** | **Proposta A:** Painel superior `"Vaga em oferta"` com contagem regressiva real (`mm:ss`) e prévia da cascata (`#1 → #2`), fila ativa agrupada por procedimento, histórico separado e cadastro em Drawer. | Quando houver 0 ofertas ativas, recolher o painel superior em banner tranquilo de 1 linha. | Disparo avulso sem cancelamento (exibimos status claro da fila automática). |
| **4. Visão geral** | **Stripe Home** + **Mercury** + **Jane App** | **Proposta A:** Saudação humana + frase natural do dia, faixa de pendências (compacta se vazia) e layout 60/40 com *"O que o SlotMatrix fez pela clínica"* + ocupação por categoria à esquerda e próximas chegadas + atividade relativa à direita. | Não inventar dados: derivar receita protegida e vagas recuperadas estritamente de `/kpis`, `/bookings` e `/waitlist`. | Nada (100% suportado pela API atual). |

---

## Tabela de Padrões Compartilhados (Reutilização Obrigatória em Todas as Telas)

| Padrão / Componente | Especificação no Sistema "Calor Clínico" | Telas que Reutilizam | Referência Principal |
| :--- | :--- | :--- | :--- |
| **1. Drawer Lateral (`SlideOverDrawer`)** | Painel direito (`380px` a `480px`), backdrop suave `bg-black/25`, fechamento por `Escape` e clique fora, foco preso no título, cabeçalho sticky e rodapé de ações fixo. | Agenda (detalhe da reserva), Reservas (detalhe + Novo agendamento), Lista de espera (Adicionar paciente), Recursos (Novo/Editar recurso). | **Linear** + **Float** |
| **2. Linha de Lista / Tabela Agrupada** | Altura `56px–60px`, agrupada por cabeçalho sticky (`Hoje`, `Procedimento`, `Categoria`), `tabular-nums`, hover sutil `--bg-sunken`, máximo **1 botão contextual** + menu `⋯` (`MoreHorizontal`). | Reservas, Lista de espera, Recursos, Auditoria. | **Cal.com** + **Linear** |
| **3. Filtros em Segmented Control** | Pílula contínua em `--bg-canvas` com borda `1px`, item ativo em `--bg-surface` com sombra curta e contador numérico discreto. | Reservas (`Hoje / Aguardando sinal / Confirmadas / Todas`), Agenda (escala/categorias), Auditoria (categorias). | **Cal.com** + **Stripe** |
| **4. Badge Semântico de Status (`BookingStatusBadge`)** | Nunca depende só de cor: combina **ícone/ponto geométrico + rótulo pt-BR em sentence case** (`Confirmada`, `Aguardando sinal`, `Paciente chegou`, `Concluída`, `Não compareceu`). | Agenda, Reservas, Lista de espera, Visão geral. | **Cliniko** + **Doctolib Pro** |
| **5. Tríade de Recursos (`ResourceTriadPills`)** | Exibe os 3 recursos da alocação atômica usando formas geométricas distintas: Círculo `(CR)` Especialista, Quadrado `[S1]` Sala (ocre mineral) e Chanfrado `<GE>` Equipamento (ardósia) + tooltip com limpeza. | Agenda (drawer e mobile), Reservas, Visão geral. | **Resource Guru** + **Bryntum** |
| **6. Estado Vazio (`ClinicalEmptyState`)** | Ilustração SVG autoral com o motivo das 3 raias da matriz, frase humana sem jargão e **1 CTA de próximo passo** (ou banner compacto de `44px` em blocos secundários como Alertas). | Todas as telas. | **Stripe** + **Linear** |
| **7. Estado de Carregamento (`Skeleton`)** | Skeletons com a geometria real da tela (3 raias horizontais na Agenda, linhas de `56px` em Reservas), sem spinners genéricos soltos. | Todas as telas. | **Linear** + **Vercel** |
| **8. Modal de Confirmação com Consequência** | Descreve o efeito real no domínio antes de executar: *"Cancelar a reserva de Roberto Almeida? A vaga das 09:00 será oferecida ao #1 da lista de espera e o sinal será processado conforme a política."* | Agenda (drawer) e Reservas (menu `⋯`). | **Stripe Dashboard** + **Jane App** |

---

## Resolução de Conflitos entre Referências

| Conflito Identificado | Referência A vs. Referência B | Decisão Tomada para a SlotMatrix e Justificativa |
| :--- | :--- | :--- |
| **1. Eixo da Agenda: Colunas por Recurso vs. Raias Horizontais por Recurso** | **Doctolib / Cliniko** usam colunas verticais por profissional; **Bryntum / Resource Guru / FullCalendar** usam raias horizontais no eixo Y e tempo no eixo X. | **Raias horizontais no eixo Y + Tempo linear (`07:00–20:00`) no eixo X.** Como um único exame bloqueia 3 recursos de categorias diferentes com caudas de limpeza assimétricas (`+20m` vs `+10m`), o alinhamento vertical entre as 3 raias horizontais é a única forma de enxergar o vínculo atômico e a janela de esterilização. |
| **2. Inspeção de Reserva na Agenda: Popover Flutuante vs. Painel Fixo vs. Drawer** | **Cliniko** usa popover pequeno sobre o bloco; **Notion Calendar** usa coluna direita fixa; **Float / Linear** usam Drawer lateral ao selecionar. | **Hover pré-visualiza o conector nas 3 raias; Clique seleciona o bloco e abre o Drawer lateral (`Proposta A`).** Evita que um popover tampe as outras 2 raias vinculadas ao mesmo exame e não rouba largura permanente da matriz quando nenhuma reserva está selecionada. |
| **3. Oferta na Lista de Espera: Disparo Aberto ("Corrida") vs. Reserva Retida com Contagem Regressiva** | **Resy / OpenTable** disparam alerta aberto para todos sem segurar a mesa; **Jane App / Domínio SlotMatrix** seguram o horário (`SlotOffer Hold`) para o `#1` com expiração temporizada. | **Painel de Cascata Exclusiva com Timer Regressivo (`mm:ss`) e Prévia do `#2`.** Fidelidade total ao motor `OnWaitlistOfferExpiredCascadeHandler` do backend da SlotMatrix e segurança clínica para o paciente. |
| **4. Ações na Lista de Reservas: Botões Visíveis vs. Tudo em Menu `⋯`** | Interfaces hospitalares legadas expõem 3 botões coloridos; **Linear** esconde quase tudo em menus de contexto. | **Híbrido Cal.com + Cliniko:** exatamente **1 botão contextual neutro/primário** para o próximo passo natural do fluxo (`Confirmar sinal`, `Confirmar chegada` ou `Concluir`) + **menu `⋯`** para ações secundárias ou destrutivas (`Cancelar reserva`, `Marcar falta`). |
