# Apps Script — popular as abas de horários

## Arquivos

| Arquivo | Uso |
|---------|-----|
| **`SyncFuncionamento.gs`** | Cole como **novo arquivo** no Apps Script |
| `Code.gs` | Não use — só aviso para não apagar seu script existente |
| `INSTALAR.md` | Passo a passo completo |

## Preciso de Apps Script?

| Parte | Precisa? |
|-------|----------|
| **Dashboard (React)** | Não — só lê a planilha via Gateway Bigou |
| **Popular a planilha com dados do MySQL** | Depende de como vocês já fazem hoje |

### O Apps Script **não conecta direto** no MySQL do Bigou

O banco fica em rede privada. O Apps Script só consegue falar com MySQL via JDBC se o banco estiver exposto (Cloud SQL, IP público, etc.) — o que normalmente **não** é o caso.

## Caminhos possíveis

```
Opção A (mais simples agora)     MySQL → exportar CSV manual → colar na planilha
Opção B (se já existe pipeline)   MySQL → mesmo job de LOJAS_DELIVERY → planilha
Opção C (Apps Script)             API interna → Apps Script → planilha
Opção D (recomendado p/ MySQL)    Python/Node cron → Google Sheets API → planilha
```

**Pergunta chave:** quem atualiza hoje `LOJAS_DELIVERY` e `PEDIDO_MENSAL`?  
Se já existe um job, **adicione as 4 queries SQL nele** — não precisa criar Apps Script.

---

## Quando Apps Script faz sentido

Use se vocês tiverem (ou criarem) um **endpoint HTTP** que roda as SQL e devolve JSON, por exemplo:

```
GET https://api-interna.bigou.com.br/export/horarios
→ { "HORARIOS_FUNCIONAMENTO": [[...], [...]], "STATUS_FUNCIONAMENTO": [...], ... }
```

O script em `Code.gs` chama esse endpoint e grava nas abas.

---

## Como instalar o Apps Script (opção C)

1. Abra a [planilha mestre](https://docs.google.com/spreadsheets/d/13pX9998D6yRJuJ7IsS33iYMzA804sZ81lDanJaCpM_c)
2. **Extensões → Apps Script**
3. Cole o conteúdo de `Code.gs`
4. Ajuste `API_URL` (ou use modo manual abaixo)
5. Rode `atualizarTodasAbas` uma vez para testar
6. **Triggers → Add Trigger** → `atualizarTodasAbas` → Time-driven → Day timer → 6h–7h

### Modo manual (sem API)

Se ainda não tiver endpoint, rode as SQL no MySQL, exporte CSV e cole nas abas.  
O Apps Script só passa a valer quando houver automação.

---

## Abas que o script atualiza

| Aba | SQL correspondente |
|-----|-------------------|
| `HORARIOS_FUNCIONAMENTO` | `01_export_HORARIOS_FUNCIONAMENTO.sql` |
| `STATUS_FUNCIONAMENTO` | `02_export_STATUS_FUNCIONAMENTO.sql` |
| `HISTORICO_FUNCIONAMENTO` | `03_export_HISTORICO_FUNCIONAMENTO.sql` |
| `RECESSOS_ESTABELECIMENTO` | `04_export_RECESSOS.sql` |

---

## Alternativa sem Apps Script: script Python

Se tiver acesso ao MySQL + service account com permissão de **escrita** na planilha (`GOOGLE_CLIENT_EMAIL` no `.env`), um cron Python é mais direto:

1. Conecta no MySQL
2. Roda as 4 queries
3. Grava nas abas via Google Sheets API

O projeto já usa service account para **leitura** (`src/scripts/syncSheets.js`). Para escrita, a conta precisa ser **editor** da planilha mestre.

Se quiser, posso montar esse script Python na próxima etapa.
