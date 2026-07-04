# Montar a planilha — passo a passo

Planilha mestre (já usada pelo dashboard):
**https://docs.google.com/spreadsheets/d/13pX9998D6yRJuJ7IsS33iYMzA804sZ81lDanJaCpM_c**

---

## 1. Criar 4 abas novas

Na planilha mestre, crie estas abas (nome exato, em maiúsculas):

| Aba | Finalidade | Frequência de atualização |
|-----|------------|---------------------------|
| `HORARIOS_FUNCIONAMENTO` | Grade semanal (turnos por dia) | Semanal ou quando mudar |
| `STATUS_FUNCIONAMENTO` | Aberto/fechado agora + último manual | Diária |
| `RECESSOS_ESTABELECIMENTO` | Pausas programadas (férias, feriados) | Diária |
| `HISTORICO_FUNCIONAMENTO` | Eventos do painel (log) | Diária |

---

## 2. Colar os cabeçalhos (linha 1)

### Aba `HORARIOS_FUNCIONAMENTO`

Cole na linha 1, uma coluna por célula:

```
ESTAB_ID	ESTABELECIMENTO	CIDADE	CIDADE_ID	DIA_SEMANA	DIA	TURNO_1_INICIO	TURNO_1_FIM	TURNO_2_INICIO	TURNO_2_FIM	TURNOS_RESUMO
```

### Aba `STATUS_FUNCIONAMENTO`

```
ESTAB_ID	ESTABELECIMENTO	CIDADE	CIDADE_ID	ABERTO_AGORA	STATUS_ATUAL	ABERTO_MANUAL	FECHADO_MANUAL	DIAS_ENTREGA	DIAS_RETIRADA	TEMPO_ENTREGA_MIN	TEMPO_RETIRADA_MIN	ATUALIZADO_EM
```

### Aba `RECESSOS_ESTABELECIMENTO`

```
RECESSO_ID	ESTAB_ID	ESTABELECIMENTO	CIDADE	CIDADE_ID	DATA_INICIO	DATA_FIM	DESCRICAO	CADASTRADO_EM	URL_TRELLO	DIAS_DURACAO	STATUS_RECESSO	EM_RECESSO_AGORA
```

### Aba `HISTORICO_FUNCIONAMENTO`

```
LOG_ID	ESTAB_ID	ESTABELECIMENTO	CIDADE	CIDADE_ID	DATA	REGISTRO	ALTERACAO	OBSERVACAO	TIPO_EVENTO
```

> Dica: copie do bloco acima e cole com **Colar especial → Colar apenas valores** se vier tudo numa célula só.

---

## 3. Rodar as SQL no MySQL

Ordem recomendada:

| Arquivo | O que faz |
|---------|-----------|
| `sql/00_explorar_dados.sql` | Valida tabelas e descobre valores do `log` |
| `sql/01_export_HORARIOS_FUNCIONAMENTO.sql` | Dados da aba de horários |
| `sql/02_export_STATUS_FUNCIONAMENTO.sql` | Dados do status atual |
| `sql/03_export_HISTORICO_FUNCIONAMENTO.sql` | Dados do histórico |
| `sql/04_export_RECESSOS.sql` | Dados de recessos programados |

### Como exportar do MySQL Workbench / DBeaver

1. Abra o arquivo `.sql` e execute a query principal (SELECT).
2. **Exportar resultado** → CSV ou copiar grid.
3. Na planilha: selecione célula **A2** da aba correspondente.
4. Cole os dados (sem repetir o cabeçalho — ele já está na linha 1).
5. Congele a linha 1: **Ver → Congelar → 1 linha**.

---

## 4. Validar

Confira na planilha:

- [ ] `HORARIOS_FUNCIONAMENTO`: lojas com delivery ativo têm até 7 linhas (uma por dia)
- [ ] `STATUS_FUNCIONAMENTO`: 1 linha por loja, `ABERTO_AGORA` = 0 ou 1
- [ ] `RECESSOS_ESTABELECIMENTO`: recessos com `STATUS_RECESSO` = em_recesso / futuro / encerrado
- [ ] `HISTORICO_FUNCIONAMENTO`: eventos recentes com `TIPO_EVENTO` preenchido
- [ ] `ESTAB_ID` bate com a aba `LOJAS_DELIVERY` / `INDICADOR_FORMATADO`

Teste no gateway (logado no painel Bigou):

```
GET /api/sheets/13pX9998D6yRJuJ7IsS33iYMzA804sZ81lDanJaCpM_c/HORARIOS_FUNCIONAMENTO
GET /api/sheets/13pX9998D6yRJuJ7IsS33iYMzA804sZ81lDanJaCpM_c/STATUS_FUNCIONAMENTO
GET /api/sheets/13pX9998D6yRJuJ7IsS33iYMzA804sZ81lDanJaCpM_c/RECESSOS_ESTABELECIMENTO
GET /api/sheets/13pX9998D6yRJuJ7IsS33iYMzA804sZ81lDanJaCpM_c/HISTORICO_FUNCIONAMENTO
```

---

## 5. Automatizar (opcional)

Se já existe job que atualiza `LOJAS_DELIVERY` ou `PEDIDO_MENSAL`, adicione as 4 queries no mesmo pipeline.

Se for manual por enquanto:
- **STATUS**, **RECESSOS** e **HISTORICO** → atualizar 1x por dia
- **HORARIOS** → atualizar quando souber que parceiro mudou horário

---

## Mapeamento `DIA_SEMANA`

| Valor | Dia |
|-------|-----|
| 0 | Domingo |
| 1 | Segunda |
| 2 | Terça |
| 3 | Quarta |
| 4 | Quinta |
| 5 | Sexta |
| 6 | Sábado |

## Mapeamento `ABERTO_AGORA`

| Valor | Significado |
|-------|-------------|
| 0 | Delivery fechado |
| 1 | Delivery aberto |

## Mapeamento `STATUS_RECESSO`

| Valor | Significado |
|-------|-------------|
| `em_recesso` | Loja em recesso agora (entre data_inicio e data_fim) |
| `futuro` | Recesso ainda não começou |
| `encerrado` | Recesso já terminou |
