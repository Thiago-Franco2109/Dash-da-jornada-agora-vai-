# Instalar o Apps Script — passo a passo

## Já tem outro script no Code.gs?

**Sim, use um arquivo separado.** No Apps Script, todos os `.gs` do projeto rodam juntos — mas cada um pode ficar em seu próprio arquivo.

1. **Não apague** seu `Code.gs` existente
2. Clique **+** ao lado de "Arquivos" → **Script**
3. Nomeie: `SyncFuncionamento`
4. Cole o conteúdo de **`SyncFuncionamento.gs`** desta pasta
5. Salve

Seu script antigo e o novo rodam **em paralelo**, cada um com seu próprio trigger.

---

## 1. Abrir o editor

1. Abra a [planilha mestre](https://docs.google.com/spreadsheets/d/13pX9998D6yRJuJ7IsS33iYMzA804sZ81lDanJaCpM_c)
2. **Extensões → Apps Script**
3. **+ → Script** → nome: `SyncFuncionamento`
4. Cole o conteúdo de `SyncFuncionamento.gs`
5. Salve (Ctrl+S)

## 2. Configurar credenciais do MySQL

| Passo | Função no dropdown |
|-------|-------------------|
| 1º | `syncFuncConfigurarCredenciais` |
| 2º | `syncFuncTestarConexao` |
| 3º | `syncFuncAtualizarTodasAbas` |
| 4º | `syncFuncInstalarTrigger` |

As credenciais ficam em **Propriedades do script** com prefixo `SYNC_FUNC_*` (não conflita com outras configs).

## 3. Liberar acesso do Google ao MySQL

O Apps Script conecta via **JDBC**. O servidor MySQL precisa aceitar conexões dos IPs do Google.

https://developers.google.com/apps-script/guides/jdbc#ip

## 4. Testar

| Função | O que faz |
|--------|-----------|
| `syncFuncTestarConexao` | Testa conexão MySQL |
| `syncFuncAtualizarSomenteStatus` | Atualiza 1 aba (teste rápido) |
| `syncFuncAtualizarTodasAbas` | Atualiza as 4 abas |

## 5. Automatizar (diário às 6h)

Rode **`syncFuncInstalarTrigger`** uma vez.

> Este trigger **só** agenda `syncFuncAtualizarTodasAbas`.  
> **Não remove** os triggers do seu `Code.gs` existente.

Para remover só este: `syncFuncRemoverTrigger`

## 6. Abas criadas automaticamente

| Aba | Conteúdo |
|-----|----------|
| `HORARIOS_FUNCIONAMENTO` | Grade semanal |
| `STATUS_FUNCIONAMENTO` | Aberto/fechado agora |
| `HISTORICO_FUNCIONAMENTO` | Log últimos 90 dias |
| `RECESSOS_ESTABELECIMENTO` | Pausas programadas |
| `_SYNC_FUNC_LOG` | Log deste sync (aba oculta) |

## Por que prefixo `syncFunc`?

No Apps Script, funções de **todos** os arquivos compartilham o mesmo espaço de nomes. O prefixo evita conflito com funções do seu script existente (ex: `atualizarTodasAbas`, `removerTriggers`).

## Troubleshooting

| Erro | Solução |
|------|---------|
| `Credenciais não configuradas` | Rode `syncFuncConfigurarCredenciais` |
| `Communications link failure` | Firewall / IP do Google não liberado |
| `Access denied for user` | Usuário ou senha incorretos |
| `Table doesn't exist` | Ajuste SQL em `SyncFuncionamento.gs` |
| Timeout | Rode abas separadas ou reduza `90 DAY` → `30 DAY` no histórico |

## Segurança

- Use usuário MySQL **somente leitura**
- Credenciais em Propriedades do script, não no código
