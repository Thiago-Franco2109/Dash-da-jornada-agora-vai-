# Horários e Histórico de Funcionamento

## Tabela `horario_funcionamento`

Grade de horários cadastrados no app (1 linha por dia da semana por estabelecimento).

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | int(11) PK | Identificador |
| `estabelecimento_id` | int(11) FK | Referência a `estabelecimento.id` |
| `dia_semana` | int(11) | 0=domingo … 6=sábado |
| `horario_inicio_1` | varchar(20) | Início do 1º turno |
| `horario_fim_1` | varchar(20) | Fim do 1º turno |
| `horario_inicio_2` | varchar(20) | Início do 2º turno (opcional) |
| `horario_fim_2` | varchar(20) | Fim do 2º turno (opcional) |
| `ativo` | int(11) | 0=inativo, 1=ativo |

> A tabela `horario` (sem sufixo) está marcada como **não usada** na documentação.

## Tabela `delivery` — status em tempo real

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `estabelecimento_id` | int(11) FK | Referência a `estabelecimento.id` |
| `aberto` | int(11) | 0=fechado, 1=aberto |
| `fechado_manual` | datetime | Última vez que o parceiro fechou manualmente |
| `aberto_manual` | datetime | Última vez que o parceiro abriu manualmente |
| `dias_entrega` | varchar(200) | Dias que aceitam entrega (ex: `0,1,2,3,4,5,6`) |
| `dias_retirada` | varchar(200) | Dias que aceitam retirada |
| `ativo` | int(11) | 0=inativo, 1=ativo |

## Tabela `log` — histórico de operações

Registra ações no painel (admin ou parceiro). Útil para histórico de abertura/fechamento.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | int(11) PK | Identificador |
| `estabelecimento_id` | int(11) FK | Estabelecimento afetado |
| `admin_estabelecimento_id` | int(11) FK | Usuário do painel do parceiro |
| `registro` | varchar(200) | Tipo da operação |
| `alteracao` | text | Descrição da operação |
| `observacao` | text | Observação opcional |
| `data` | datetime | Data/hora do evento |

> **Importante:** filtrar `log` por `registro` / `alteracao` contendo termos como "aberto", "fechado", "horário" após validar os valores reais no banco.

## Tabela `recesso_estabelecimento` — pausas programadas

Férias, feriados e fechamentos planejados. Diferente do horário semanal e do abrir/fechar manual.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | int(11) PK | Identificador |
| `estabelecimento_id` | int(11) FK | Referência a `estabelecimento.id` |
| `admin_id` | int(11) FK | Admin que cadastrou |
| `data_inicio` | datetime | Início do recesso |
| `data_fim` | datetime | Fim do recesso |
| `descricao` | varchar(255) | Motivo (ex: "Férias", "Reforma") |
| `data` | datetime | Data do cadastro |
| `url` | varchar(300) | Link do card no Trello (se houver) |

**Por que incluir:** explica quedas de pedido e loja fechada fora do horário normal — algo que `delivery.aberto` e `horario_funcionamento` não mostram sozinhos.

## Visão geral — o que cada fonte responde

| Fonte | Pergunta que responde |
|-------|----------------------|
| `horario_funcionamento` | Qual o horário **padrão** da loja? |
| `delivery` | A loja está **aberta agora**? Quando abriu/fechou manualmente pela última vez? |
| `recesso_estabelecimento` | A loja está em **pausa programada** (férias/feriado)? |
| `log` | **Quem fez o quê** e quando (histórico de ações) |

## Mapeamento `dia_semana`

| Valor | Dia |
|-------|-----|
| 0 | Domingo |
| 1 | Segunda |
| 2 | Terça |
| 3 | Quarta |
| 4 | Quinta |
| 5 | Sexta |
| 6 | Sábado |
