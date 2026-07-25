# Handoff de sessão — 24/07/2026 (Central de Inteligência CS)

Documento para retomar o trabalho em casa. Abra o projeto no Claude Code e diga:
**"leia o HANDOFF_SESSAO_2026-07-24.md"**.

> Histórico técnico mais antigo (integração inicial, auth, churn) está no
> `HANDOFF_SESSAO_2026-07-21.md`. Este aqui é o estado atual.

---

## 0. Como retomar em casa

```bash
git clone https://github.com/Thiago-Franco2109/Dash-da-jornada-agora-vai-
cd Dash-da-jornada-agora-vai-        # ou: git pull, se já tiver o repo
npm install
npm run dev                           # http://localhost:5173
```

- **GitHub auth em casa:** provavelmente vai precisar logar de novo. Use o
  Cursor (Source Control → Sync) ou `gh auth login` (`brew install gh`).
- **`.env` (não está no GitHub):** recrie na raiz. Precisa de:
  - Google Sheets IDs + `VITE_API_ORIGIN` (copie do `.env` do trabalho ou da Netlify)
  - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (Netlify → Environment variables)
  - **Banco de teste MySQL:**
    ```
    DB_HOST=143.198.0.91
    DB_PORT=3306
    DB_USER=thiago-sc
    DB_PASSWORD="<senha>"     # ⚠️ ENTRE ASPAS — a senha tem # e sem aspas o .env corta nele
    DB_NAME=bigou
    ```
  - Teste a conexão: `node scripts/db-ping-local.mjs`
- ⚠️ **`npm run dev` (Vite puro) NÃO roda as Netlify Functions nem tem sua
  sessão.** As telas que dependem do banco (Churn/painel, KPIs CS) só mostram
  dados **em produção**. Em localhost elas aparecem em estado de erro — normal.

Produção: **https://jornada-netlifyreserva.netlify.app**

---

## 1. O que está NO AR (entregue hoje)

**Integração direta com o banco de teste** (via Netlify Functions read-only):
- `netlify/functions/estabelecimento.ts` — status de contrato (gabarito de
  churn), atividade (`?activity=N`) e lista de inativos (`?activity=N&list=inativos`)
- `netlify/functions/cs-kpis.ts` — KPIs de Sucesso do Cliente
- `netlify/functions/db-ping.ts` — teste de conectividade (público, remover depois)

**Tela Churn** — painel "Status de contrato (banco)" + "Atividade dos ativos"
(1.130 de 1.387 com pedido em 28d) + botão "Ver os 257 sem pedido"
(lista acionável com recuperável/frio). Scroll da página unificado.

**Tela Todos os Parceiros:**
- Ordenação por **comissão/GMV do mês** corrigida (era por qtd. de pedidos)
- **Deduplicação** de parceiros (planilha INDICADOR tinha linhas repetidas →
  quebrava keys do React e o filtro de cidade)
- **Seletor inline de relevância** (clica na estrela → 1-5 ou limpar, sem abrir a página)

**Tela KPIs CS (nova — menu "KPIs CS", ícone monitoring):**
- Comissão líquida (30d) + variação · **NRR** · **GRR/churn de receita** · taxa de atividade
- **Movimento da receita** (decompõe o NRR): expansão / contração / perdido / novos
- **Quem contatar** priorizado por R$ em risco
- **Segmentação por cidade** — seletor "Todas / cidade X" troca todos os KPIs
  (cada cidade = carteira separada)

---

## 2. Arquitetura / infra

- **React (Netlify) → Netlify Functions (read-only) → MySQL banco de teste.**
- **`Comissao_View`** (view no banco) entrega por pedido: `comissao_liquida`,
  `comissao_bruta`, `gmv_bruto`, `gmv_liquido`, `reembolso`, `cupom_*`, etc.
  É a base dos KPIs de receita.
- **Auth = STOPGAP (fraco):** as functions validam `Referer/Origin` contra
  allowlist (`_shared/auth.ts` → `checkOrigin`). **Não é segurança real**
  (Referer é falsificável). O login do app é por cookie cross-domain do Gateway
  e **não alcança** as functions; o `/auth/me` do Gateway não devolve token.
  → Auth definitiva pendente: (a) Gateway expor token, ou (b) Supabase Auth.
- `.env` foi **removido do rastreamento do git** (credenciais nunca vão pro GitHub).

---

## 3. Gotchas (ler antes de debugar!)

- **CACHE:** depois de todo deploy, faça **hard refresh** (DevTools → Network →
  "Disable cache" → recarregar). O navegador segura o `index.html` antigo.
  Vários "não funcionou" da sessão foram só cache.
- **Verificar deploy:** NÃO compare o hash do bundle local — a Netlify gera um
  hash diferente (injeta o `.env` de produção). Confirme grepando um marcador do
  código novo no bundle publicado. Deploys sobem ~30-60s após `git push`.
- **Performance do banco:** NÃO há índice composto `(estabelecimento_id, data)`
  em `pedido`. Por isso `MAX(data)`/`IN` por parceiro = 30s+ (inviável ao vivo).
  Padrão que funciona: **filtrar `pedido` por `data` primeiro** (usa índice) +
  fazer a diferença/agregação em JS. Evitar `NOT IN (subquery)`.
  **Recomendação:** pedir a quem administra o banco pra criar esse índice.

---

## 4. Números de referência (24/07, banco de teste)

- 1.387 ativos · 1.130 com pedido em 28d (81%) · 257 sem pedido
- Comissão líquida 30d: **R$ 161,7k** (**-5,3%** vs. 30d anteriores)
- **NRR 94,3%** · churn de receita 14,9%
- **Expansão +R$ 15,7k (397)** vs **Contração -R$ 22,7k (459)**
  → a carteira cai **por contração** (parceiros vendendo menos), não por churn total
- Top cidades por comissão: Santos Dumont R$44k/120 ativos · Rio Pomba R$29k/106
  · Muriaé R$23,5k/202 · Além Paraíba R$18k/90

---

## 5. Decisões / próximos passos EM ABERTO

**A. Registro de contato (camada de relacionamento) — EM PLANEJAMENTO ⭐**
Foco preventivo: registrar toques com o parceiro (CS/suporte/qualquer equipe)
pra agir *antes* dos sinais tardios. (Sinais tardios como "parceiro sem horário
de funcionamento" NÃO são o foco — quando aparecem, o parceiro já está saindo.)
Esboço:
- Evento de contato no **Supabase** (memória compartilhada — hoje as notas
  vivem no `localStorage`, sem compartilhamento entre os 2 analistas): parceiro,
  data, quem registrou, canal/equipe, motivo/sentimento, notas, follow-up.
- "Último contato: há X dias" na lista + fila "quem contatar" por score
  (**R$ × risco × tempo sem contato**) + análise dos motivos (causas de
  insatisfação pro CEO: taxas altas, promoção descontando muito…).
- Perguntas a decidir: escopo (só CS ou multi-equipe já?), capturar
  motivo/sentimento (recomendado: sim), priorização por score combinado.
- Hoje eles usam **Trello** pra cards (não integrar agora).

**B. Tabela comparativa de cidades** — KPIs de todas as cidades lado a lado.

**C. Mais KPIs** — GMV & ticket médio; qualidade (avaliação `estrelas` +
cancelamento). **Inadimplência NÃO é prioridade** (marketplace cobra por venda,
não trabalham muito com inadimplência).

**D. Auth definitiva** (tirar o stopgap) · **E. Índice `(estabelecimento_id, data)`**
· **F. Lista "quem contatar" clicável → detalhe** · **G. Proteger/remover db-ping**

---

## 6. Contexto de negócio (1 parágrafo)

Bigou = **marketplace de delivery** (tipo iFood), NÃO um SaaS tradicional.
Receita = **comissão por venda** (+ taxa/pedido + mensalidade). ~1.387 parceiros
ativos, **2 analistas de CS**. Churn aqui é **operacional** (o parceiro "some"
da plataforma: para de vender, encolhe, tira horário), não financeiro. Objetivo:
sair do reativo para uma **Central de Inteligência** que diga "quem contatar
hoje", priorizando por **impacto financeiro (comissão líquida) × risco**. Cada
**cidade é uma carteira** com dinâmica própria.
