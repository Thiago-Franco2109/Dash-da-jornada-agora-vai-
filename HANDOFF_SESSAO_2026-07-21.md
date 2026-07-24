# Handoff de sessão — 21/07/2026 (Central de Inteligência CS)

Documento para retomar o trabalho em outro computador. Abra o projeto no
Claude Code e diga: **"leia o HANDOFF_SESSAO_2026-07-21.md"**.

---

## 🔄 Atualização 24/07/2026 — Integração direta com o banco: APROVADA e VALIDADA

A decisão em aberto da seção 5 foi **resolvida e testada de ponta a ponta em
produção**. Resumo do que mudou:

- **Arquitetura escolhida:** camada read-only via **Netlify Functions** (o
  Railway/Gateway está fora — só serve pro login por e-mail; sem acesso ao
  código dele).
- **Conectividade confirmada:** a Netlify **alcança o banco de teste MySQL**
  sem IP allowlist nem VPN. Testado pela função `db-ping` em produção
  (respondeu `ok:true`, 111 tabelas, ~114ms). Cadeia validada:
  `React → Netlify Function → MySQL banco de teste`.
- **Banco de teste:** `143.198.0.91:3306`, schema `bigou`, **111 tabelas**
  (mais rico que os 67 documentados). Todas as tabelas do roadmap presentes.
- **Novos arquivos:** `netlify/functions/db-ping.ts` (teste de conectividade,
  read-only) e `scripts/db-ping-local.mjs` (mesmo teste local). Dependência
  `mysql2` adicionada.
- **Segurança:** o `.env` estava sendo versionado — foi removido do
  rastreamento do git (`git rm --cached .env`) e continua no `.gitignore`. As
  credenciais do banco **nunca** foram pro GitHub. Credenciais só via env
  vars (local no `.env`; produção em Netlify → Environment variables).

**Pendências desta atualização:**
- A `db-ping` está **pública/sem autenticação** (só expõe nomes de tabelas).
  Proteger ou remover depois. As functions de negócio precisam reaproveitar o
  login por cookie do Gateway.
- Respostas às 4 perguntas da seção 5 estão anotadas lá embaixo (✔).

**Próximo passo real:** escrever as functions de negócio read-only, começando
por `estabelecimento` → `pedido` → `fatura`/`parcela_fatura`.

---

## 0. Como retomar no PC da empresa

```bash
git clone https://github.com/Thiago-Franco2109/Dash-da-jornada-agora-vai-
cd Dash-da-jornada-agora-vai-
# já está tudo na branch main (a antiga handoff-2026-07-21 foi mesclada)
npm install
npm run dev                          # http://localhost:5173
```

Depois abra o Claude Code na pasta e peça para ler este arquivo.

> ⚠️ O `.env` **não** está no GitHub (fica de fora de propósito). Veja a
> seção 3 para recriá-lo.

---

## 1. Entregáveis desta sessão (na sua conta claude.ai)

Abrir com o e-mail **claude@bigou.app**, em qualquer computador:

- **Análise completa do sistema + proposta da Central de Inteligência CS**
  https://claude.ai/code/artifact/95e2940e-1899-4d28-aa92-d1c72d53a81e
- **PRD da Fase 1 (Fundação)**
  https://claude.ai/code/artifact/4014764c-74e1-4993-91e8-2cdf3e11fb88

(Também acessíveis em claude.ai/code/artifacts.)

---

## 2. Correções de código já feitas (nesta branch)

Diagnóstico do "às vezes salva, às vezes não" no status de campanha: **o
Supabase estava salvando certo** — o problema era exibição/feedback. Dois
ajustes:

1. **`src/hooks/useDataSync.ts`** — quando a leitura da planilha (Gateway)
   falha e o app cai no cache, agora ele busca os overrides/relevância do
   Supabase e mescla por cima do cache, em vez de mostrar status
   desatualizado.
2. **`src/App.tsx`** — falha real ao salvar status agora aparece num toast
   vermelho no canto da tela (antes só ia pro console, invisível).

Ambas passam no `tsc` e foram verificadas no navegador.

---

## 3. Configuração local necessária (`.env`)

O Supabase **já funciona em produção** (Netlify). Para testar em localhost,
recrie estas duas linhas no `.env` local — copie os valores de
**Netlify → Site settings → Environment variables**:

```
VITE_SUPABASE_URL=<copiar da Netlify>
VITE_SUPABASE_ANON_KEY=<copiar da Netlify>
```

(A `anon key` é pública por design, protegida por RLS.)

**Banco de teste MySQL** (para as functions de dados — desde 24/07/2026).
Mesmas 5 variáveis no `.env` local e em Netlify → Environment variables:

```
DB_HOST=143.198.0.91
DB_PORT=3306
DB_USER=<usuário>
DB_PASSWORD="<senha>"     # ⚠️ ENTRE ASPAS no .env se tiver # ou caractere especial
DB_NAME=bigou
```

> ⚠️ No arquivo `.env`, senha com `#` **precisa** de aspas duplas, senão a lib
> lê só até o `#` (foi o que travou o primeiro teste). No painel da Netlify,
> cola a senha sem aspas.

Teste rápido de conexão local: `node scripts/db-ping-local.mjs`.

---

## 4. Pendência de limpeza no Supabase

Durante um teste de conectividade foi criada uma linha de teste na tabela
`partner_status_overrides` com `partner_id = "__CONNECTIVITY_TEST__"`. A RLS
bloqueia DELETE pela chave pública, então **apague manualmente** no painel
do Supabase (Table Editor). Não afeta nada real.

---

## 5. Decisão em aberto — a mais importante para continuar

Estávamos definindo a arquitetura da **Fase 1** (fundação). Surgiu uma ideia
que muda o rumo e é provavelmente melhor:

> **Integrar direto com o banco de dados de TESTE** (réplica atualizada 1 dia
> após o banco real), em vez do pipeline manual planilha→Gateway.

Isso é mais limpo e mais rico (dado pedido-a-pedido, sem export manual).

### Restrição de arquitetura
O app React (navegador) **não pode conectar direto no MySQL** (credencial
vazaria). Precisa de uma **camada de servidor read-only** entre o banco e o
app. Dois candidatos no projeto:
- **Estender o Bigou Gateway** (Railway) — reaproveita o login por cookie.
- **Netlify Functions** — já existem em `netlify/functions/`.

### Perguntas que ficaram para você responder — RESPONDIDAS (24/07/2026)
1. **Camada de servidor:** ✔ **Netlify Functions.** Sem acesso ao Gateway
   (Railway); ele só faz o login por e-mail da empresa.
2. **Banco de teste é estável?** ✔ **Sim** — estável, atualizado diariamente
   com informações novas (réplica).
3. **Rede aceita conexão?** ✔ **Sim** — validado em produção pela `db-ping`.
   Sem IP allowlist/VPN. (O Apps Script já conectava de IPs do Google, o que
   antecipava o bom sinal.)
4. **Schema bate com a doc?** ✔ Parcial: o banco tem **111 tabelas** (a doc
   citava 67). Todas as tabelas do roadmap existem. A doc está desatualizada
   pra menos, mas não falta nada do que precisamos — o banco é um superconjunto.

### Dados a puxar do banco (mapa resumido)
As 3 primeiras já destravam Saúde + Risco de Churn + Receita Recuperável:
- **`pedido`** → demanda diária, GMV/comissão (fórmulas na doc), motivo de
  cancelamento, `primeiro_estabelecimento` (novos clientes).
- **`estabelecimento`** → `delivery` (1 ativo / 2 cancelado / 4 suspenso /
  5 desistência) = status do contrato **e os rótulos de churn históricos**
  (gabarito para calibrar o score).
- **`fatura` + `parcela_fatura`** → inadimplência (preditor forte de churn).
- Depois: `avaliacao`, `log` (uso do painel), `delivery` (aberto/fechado),
  `venda`/`venda_estabelecimento` (mensalidade), `foto`/`item_catalogo`
  (oportunidade), `cupom_desconto`.

> Se a integração com o banco for aprovada, a **Parte B do PRD** (exports
> para planilha) sai e entra "camada read-only + queries no banco de teste".

---

## 6. Próximo passo sugerido — ATUALIZADO (24/07/2026)
As 4 perguntas foram respondidas e a integração está validada (ver bloco de
atualização no topo). Agora:

1. Escrever a **function read-only `estabelecimento`** (com proteção de login
   por cookie, reaproveitando o Gateway) → status de contrato / gabarito de
   churn.
2. Depois `pedido` (demanda, GMV, cancelamentos, novos clientes).
3. Depois `fatura` + `parcela_fatura` (inadimplência).
4. Proteger ou remover a `db-ping` (hoje pública).

A "Parte B do PRD" (exports para planilha) sai — entra a camada read-only com
queries no banco de teste, conforme já sinalizado na seção 5.

---

## Contexto de negócio (resumo de 1 parágrafo)
Bigou Delivery, marketplace tipo iFood. Receita = comissão de 12% + taxa de
R$ 1/pedido + mensalidade. ~1.500 parceiros ativos, **só 2 analistas de CS**.
Objetivo: sair de uma operação reativa para uma Central de Inteligência que
diga "quem contatar hoje" priorizando por **impacto financeiro × risco de
churn**. Maior dor (do CEO): perder parceiros. Achado central da análise:
nenhum score atual considera R$, e o trabalho do CS (notas/contatos) vive no
`localStorage` de cada navegador — sem memória compartilhada entre os 2
analistas.
