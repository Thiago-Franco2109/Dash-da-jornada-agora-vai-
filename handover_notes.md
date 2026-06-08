# Relatório de Passagem (29/03/2026): Partner Journey Dashboard

Este documento detalha o estado atual do projeto, as funcionalidades recém-implementadas e os próximos passos para a continuidade do desenvolvimento.

Documentação complementar: `HANDOFF_MIGRACAO_AUTH_E_DATA.md` (OAuth, Gateway, cabeçalhos da planilha principal) e `Relatorio Handover` (contexto histórico de UI).

---

## 1. Contexto do projeto

O **Partner Journey Dashboard** é uma ferramenta de acompanhamento de onboarding para parceiros Bigou. Ele visualiza o desempenho dos parceiros nos primeiros **28 dias** após o lançamento.

| Área | Detalhe |
|------|---------|
| **Stack** | React (TypeScript), Vite, CSS vanilla (visual moderno/premium) |
| **Backend** | Google Sheets como fonte de dados via API Gateway (`bigou-sheets-api.netlify.app`) |
| **Autenticação** | Cookies + Google OAuth no navegador do usuário |

---

## 2. O que foi implementado recentemente

### Integração de acessos em tempo real

Sincronização com a planilha de **acessos únicos por dia**:

- **`useDailyAccessSync.ts`**: hook que consome a aba **`novo relatório final`** do Google Sheets (config em `ACCESS_DATA_SOURCE` em `src/config/dataSource.ts`).
- Normalização com **`toLowerCase()`** para alinhar nomes de lojas (acentuação/case).
- Soma dinâmica de colunas de datas (`YYYY-M-D`) para calcular: **total de acessos**, **média diária** e **acessos do último dia**.

### `MenuFunnel.tsx` — refatoração

- **Fim dos dados simulados**: removidas etiquetas “Estimado” e “Dados simulados”.
- **Visualização**: apenas dados reais (**Sua loja**). Comparação com concorrência oculta por depender de placeholders.
- **Gráfico**: barras com altura proporcional à taxa de conversão real (ex.: visualizações / acessos).

### Limpeza da tela da loja (`PartnerDetailsView`)

- Removida a estimativa de visitas baseada em pedidos confirmados (taxa fixa de 20%).
- Sem dados reais (planilha de acessos ou CSV do GA4): estado vazio informativo em vez de números inventados.

---

## 3. Estado atual e onde parou

O dashboard está **orientado a dados reais** na tela de detalhes do parceiro.

- **Status**: verificado — lojas como **“Hamburgueria do Maluko”** e **“Amorim Gás”** exibem métricas reais da planilha de acessos.
- **Configurações**: fonte **`ACCESS_DATA_SOURCE`** em `src/config/dataSource.ts`.

---

## 4. Instruções para o próximo agente

### Próximos passos sugeridos

1. **Métricas detalhadas** (`PartnerDetailsView`): a seção “Métricas detalhadas” ainda tem placeholders “Em breve” para:
   - taxa de conversão real (GMV / acessos);
   - item mais vendido;
   - fotos no cardápio.
2. **Benchmarks reais**: reativar **concorrência** no `MenuFunnel` quando houver planilha com médias regionais reais para comparação.
3. **Planilha**: o hook `useDailyAccessSync` depende do formato de data **`YYYY-M-D`** no cabeçalho — monitorar mudanças no formato da planilha.

### Arquivos-chave

| Arquivo | Papel |
|---------|--------|
| `src/hooks/useDailyAccessSync.ts` | Extração e agregação de acessos |
| `src/components/PartnerDetailsView.tsx` | Orquestração dos dados da loja |
| `src/components/MenuFunnel.tsx` | Funil de conversão (visual) |
| `src/config/dataSource.ts` | IDs das planilhas e nomes das abas |

---

*Relatório de passagem — 29/03/2026. Antigravity AI 🚀*
