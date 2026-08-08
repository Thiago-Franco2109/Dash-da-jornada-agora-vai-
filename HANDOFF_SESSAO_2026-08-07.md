# Handoff de sessão — 07/08/2026 (Entrada no painel: perfis + home)

Documento para retomar o trabalho. Abra o projeto no Claude Code e diga:
**"leia o HANDOFF_SESSAO_2026-08-07.md"**.

> Estado da Central de Inteligência CS (banco, KPIs, churn, auth) está no
> `HANDOFF_SESSAO_2026-07-24.md`, que continua válido. Este documento cobre só
> a camada de entrada do painel, mexida hoje.

---

## 0. Estado ao final da sessão

Três commits, todos na `main` e **em produção**:

| Commit | O quê |
|---|---|
| `be7ff3c` | Tela de escolha de perfil + acesso do CEO |
| `b41dec8` | Tela de Início com saudação e transição de entrada |
| `5cc9947` | Pauta do dia (analista) e leitura da operação (CEO) |

Produção (os dois sites recebem deploy da `main`):
- https://jornada-28d.netlify.app
- https://jornada-netlifyreserva.netlify.app

⚠️ **Nada disso foi testado dentro do app autenticado.** Tipos, lint e build
passam, e o código está comprovadamente no bundle em produção, mas o caminho
real *login → escolha de perfil → home → filtro aplicado* nunca foi exercitado.
É a primeira coisa a fazer ao retomar.

---

## 1. O que mudou

### 1.1 Tela de escolha de perfil

`src/components/ManagerPickerModal.tsx` — era um modal branco de 44 linhas,
virou tela cheia com a identidade do bigou: título com contorno, avatares em
círculo, fundo verde animado. O CSS vive dentro do próprio componente (classes
`mp-*`), sem tocar no `index.css`.

Ao escolher, o card cresce com anel dourado e a tela se abre revelando o painel
(620 ms). `prefers-reduced-motion` pula a animação inteira.

**Ordem importa:** o perfil é aplicado **no clique**, não no fim da animação.
Aplicando no fim, aos ~460 ms a home já estava visível por trás e a saudação
trocava de nome à vista de quem escolheu. Por isso o componente tem dois
callbacks: `onSelect` (aplica) e `onExited` (pode desmontar).

Avatares em `public/avatars/{thiago,lais,ulysses}.png`, recortados 512×512 com
`sips` a partir de PNGs transparentes. A transparência é o que faz o círculo
colorido aparecer atrás da pessoa — se trocar as imagens, mantenha o fundo
transparente.

### 1.2 Ulysses (CEO) como terceiro perfil

Exigiu separar dois conceitos que estavam no mesmo estado:

| | O que é | Onde vive |
|---|---|---|
| `profile` | Quem entrou: `THIAGO` \| `LAÍS` \| `ULYSSES` | `sessionStorage`, vale pela aba |
| `managerFilter` | Filtro de analista em vigor | Só em memória, ajustável no dropdown |

O CEO não tem carteira própria: o perfil dele corresponde a **filtro vazio**, ou
seja, vê tudo. Sem a separação, gravar `''` como identidade fazia a tela de
perfil reaparecer a cada recarga.

O tipo `Manager` em `config/managerMapping.ts` **ficou intacto de propósito** —
incluir o Ulysses ali o faria aparecer como possível dono de cidade na tela de
Gestores.

**Mudança de comportamento:** o dropdown de analista não grava mais na sessão.
Antes, escolher "Todos" nele apagava a chave e trazia a tela de perfil de volta
no recarregamento.

### 1.3 Tela de Início

Nova view `home`, que é onde o painel abre. Resolve o item **F** dos próximos
passos do handoff anterior ("Lista 'quem contatar' clicável → detalhe").

**Analista** (`src/components/home/AnalystHome.tsx`) — "Foco de hoje" lista até
três parceiros com o motivo de estarem na pauta, em ordem de urgência:

1. Contato previsto pela jornada (dias 7 / 14 / 21 / 28)
2. Reta final atrasada (dia 25+ com índice < 1)
3. Prioridade 4–5

Abaixo, os parceiros em jornada ordenados do mais atrasado para o menos. Clicar
em qualquer um abre o painel do parceiro.

**CEO** (`src/components/home/CeoHome.tsx`) — visão geral de 30 dias (comissão
com a variação real do endpoint, NRR, GRR, churn de receita), comparativo entre
as carteiras de Thiago e Laís, e alertas críticos vindos de `topRisco`.

**Mudança de comportamento:** o painel abre no Início em **todo** recarregamento,
não só na primeira entrada. Antes abria no Dashboard.

---

## 2. A decisão técnica que precisa de revisão

`src/utils/csKpisByManager.ts` monta o comparativo de carteiras **sem tocar no
backend**: a função `cs-kpis` já devolve os KPIs por cidade, e cada gestor é dono
de um conjunto de cidades, então basta agrupar por `getEffectiveManager`.

O problema é que NRR e GRR chegam **só como porcentagem**. Somar porcentagens de
cidades diferentes daria número errado, então os numeradores são recuperados
antes de somar:

```
nrrNum = (nrrPct / 100) × comissao.anterior
```

**Isso assume que `comissao.anterior === nrrDen`.** No backend
(`netlify/functions/cs-kpis.ts`, função `fold`), `totPrev` acumula `prev` de
todos os parceiros e `nrrDen` acumula `prev` só de quem tinha `prev > 0` — quem
não tinha soma zero nos dois, então batem. A suposição quebra se `prev` puder ser
**negativo** (estorno, ajuste de comissão).

> Se os números por carteira parecerem estranhos, **é aqui que se olha primeiro.**
> A correção definitiva é expor `nrrNum` / `grrNum` / `nrrDen` no payload por
> cidade e parar de reconstruir.

---

## 3. Como trabalhar no visual sem login

O dev server exige OAuth, então há uma entrada isolada:

```bash
npm run dev
# http://localhost:5173/preview-picker.html
# http://localhost:5173/preview-picker.html?vazio   → estados vazios
```

`src/preview-picker.tsx` monta a home com parceiros falsos e o seletor por cima,
reproduzindo a transição real. **Não entra no build de produção** — o
`vite.config.ts` não declara `rollupOptions.input`, então só o `index.html` é
empacotado (verificado).

A **home do CEO não aparece no preview**: ela depende da função `cs-kpis`, que
exige autenticação. Só dá para vê-la dentro do app.

---

## 4. Gotchas desta camada

- **`-webkit-text-stroke` é herdado.** O título da tela de perfil é montado em
  três camadas (contorno escuro → contorno branco → preenchimento). A camada de
  preenchimento precisa zerar o contorno explicitamente, senão o texto vira um
  borrão.
- **Modo escuro é por `prefers-color-scheme`**, não por classe. Tailwind v4 sem
  `@custom-variant` configurado — adicionar `class="dark"` no `<html>` não faz
  nada. Para testar, emule o esquema de cor no navegador.
- **Push falha com HTTP 400** neste repositório por conta de HTTP/2. Já está
  resolvido em `.git/config` local (`http.version=HTTP/1.1`,
  `http.postBuffer=524288000`). Num clone novo, o erro volta e a correção é essa.
- **Cor diz saúde, não motivo.** Nos cards de "Foco de hoje", a cor vem do índice
  de desempenho do parceiro, não da regra que o colocou na pauta. Um contato
  agendado com quem está a 1,2x da meta não é alarme — pintá-lo de vermelho
  ensinaria a ignorar a cor. Mantenha isso se for mexer.
- **`.DS_Store`, `.cursor/debug-ca6d7f.log` e `dist/index.html`** vivem
  modificados no working tree e ficam fora dos commits. Antes de
  `git pull --rebase`, guarde-os com `git stash push -- <esses arquivos>`.

---

## 5. Em aberto

**Do design que não foi implementado, por falta de dado:**

| Item do mockup | O que falta |
|---|---|
| "Contatar agora" / "Mensagem" / "Enviar e-mail" | Não há telefone nem e-mail de parceiro no modelo. Hoje o clique abre o painel do parceiro |
| Risco de churn nas linhas de jornada | `risco_churn` só é calculado em `enrichDesempenhoPartnerData` (abas de desempenho), não para a jornada |
| MRR | A métrica da casa é comissão líquida — o mockup usava vocabulário de SaaS |

**Decisões pendentes:**

- **E-mail do Ulysses** — `identifyManagerFromUser` não o reconhece, então ele
  sempre passa pela tela de escolha. Com o e-mail, dá para pular.
- **Abrir sempre no Início?** Hoje todo recarregamento cai lá. Se incomodar, dá
  para fazer só a primeira entrada da sessão cair no Início.
- **A home tem só a pauta.** Se quiser atalhos para as abas ou algum número em
  destaque, é somar seções — a estrutura já comporta.
- Os demais itens (A–E, G) do `HANDOFF_SESSAO_2026-07-24.md` seguem abertos.
