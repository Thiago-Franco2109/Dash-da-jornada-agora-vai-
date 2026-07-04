# Integração Google Sheets — Horários e Histórico

Segue o fluxo usado pelo dashboard (planilha mestre → gateway → React).

## Visão geral

```
MySQL (BIGOU)  →  export/query agendada  →  Google Sheets  →  Gateway API  →  Dashboard
```

A planilha mestre já usada pelo projeto:
- **Sheet ID:** `13pX9998D6yRJuJ7IsS33iYMzA804sZ81lDanJaCpM_c`
- Ver `src/config/dataSource.ts` → `MASTER_DATA_SOURCE`

## Passo 1 — Validar SQL no banco

1. Rode as queries em `sql/horarios_funcionamento.sql` no MySQL do Bigou.
2. Confirme os valores de `log.registro` para abertura/fechamento (ajuste os filtros da query 3).
3. Teste com um `estabelecimento_id` conhecido.

## Passo 2 — Criar abas na planilha mestre

### Aba `HORARIOS_FUNCIONAMENTO`

Cabeçalho (linha 1):

```
estab_id | estabelecimento | cidade | dia_semana | dia | turno_1_inicio | turno_1_fim | turno_2_inicio | turno_2_fim | aberto_agora | aberto_manual | fechado_manual
```

- Uma linha por **estabelecimento + dia da semana** (até 7 linhas por loja).
- Dados estáticos ou atualizados diariamente (horários mudam pouco).

### Aba `HISTORICO_FUNCIONAMENTO`

Cabeçalho (linha 1):

```
estab_id | estabelecimento | cidade | data | registro | alteracao | observacao
```

- Uma linha por evento do `log` (abertura, fechamento, alteração de horário).
- Sugestão: exportar últimos 90 dias e rodar job diário.

## Passo 3 — Popular a planilha

Opções (escolha a que o time já usa):

| Método | Quando usar |
|--------|-------------|
| **BigQuery / script Python** | Já existe pipeline de export do banco |
| **Conector MySQL → Sheets** | Poucos registros, atualização manual |
| **CSV + Apps Script** | Job agendado no Google Apps Script |
| **Replicação de tabela** | Se não puder consultar produção em tempo real |

### Exemplo Apps Script (esboço)

```javascript
function atualizarHorarios() {
  // 1. Buscar CSV/JSON de endpoint interno ou colar resultado da query
  // 2. Limpar aba HORARIOS_FUNCIONAMENTO (manter cabeçalho)
  // 3. sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}
```

Agendar: **Triggers → Time-driven → Daily**.

## Passo 4 — Integrar no dashboard (próxima etapa)

Quando as abas estiverem prontas:

1. Adicionar em `src/config/dataSource.ts`:

```typescript
export const HORARIOS_FUNCIONAMENTO_SOURCE = {
    sheetId: MASTER_DATA_SOURCE.sheetId,
    range: 'HORARIOS_FUNCIONAMENTO',
} as const;

export const HISTORICO_FUNCIONAMENTO_SOURCE = {
    sheetId: MASTER_DATA_SOURCE.sheetId,
    range: 'HISTORICO_FUNCIONAMENTO',
} as const;
```

2. Criar hook `usePartnerHours` (padrão de `useDailyAccessSync`).
3. Nova aba `horarios` em `PartnerDetailsView.tsx` (`TabKey`).

## Checklist antes de ir para produção

- [ ] Query validada com IDs reais de parceiros
- [ ] Filtros do `log` conferidos no banco
- [ ] Abas criadas na planilha mestre com cabeçalhos corretos
- [ ] Job de atualização agendado
- [ ] Gateway retorna dados: `GET /api/sheets/{sheetId}/HORARIOS_FUNCIONAMENTO`
