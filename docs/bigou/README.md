# Documentação do Banco BIGOU

Pasta de referência para consultas futuras sobre o banco de dados do Bigou.

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `documentacao-banco-dados-bigou.pdf` | PDF original (Google Docs) |
| `documentacao-extraida.txt` | Texto extraído do PDF (busca rápida) |
| `indice-tabelas.md` | Lista das 67 tabelas documentadas |
| `horarios-funcionamento.md` | Tabelas e campos relevantes para a aba de horários |
| `montar-planilha.md` | **Guia principal** — criar abas e colar dados |
| `sql/00_explorar_dados.sql` | Validar tabelas e descobrir valores do `log` |
| `sql/01_export_HORARIOS_FUNCIONAMENTO.sql` | Export → aba `HORARIOS_FUNCIONAMENTO` |
| `sql/02_export_STATUS_FUNCIONAMENTO.sql` | Export → aba `STATUS_FUNCIONAMENTO` |
| `sql/03_export_HISTORICO_FUNCIONAMENTO.sql` | Export → aba `HISTORICO_FUNCIONAMENTO` |
| `sql/04_export_RECESSOS.sql` | Export → aba `RECESSOS_ESTABELECIMENTO` |
| `integracao-google-sheets.md` | Integração com o dashboard (próxima etapa) |

## Tabelas principais — Horários e funcionamento

- **`horario_funcionamento`** — grade semanal (turno 1 e 2 por dia)
- **`recesso_estabelecimento`** — pausas programadas (férias, feriados)
- **`delivery`** — status atual (`aberto`), último abertura/fechamento manual
- **`log`** — histórico de alterações (inclui mudanças no painel do parceiro)

## Nota sobre o PDF no editor

O Cursor/VS Code abre PDFs como texto bruto (binário comprimido). Isso é normal.
Para ler visualmente, abra o PDF no visualizador do sistema ou use os arquivos `.txt` / `.md` desta pasta.
