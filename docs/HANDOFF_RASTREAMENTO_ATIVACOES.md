# Handoff — Rastreamento de "quem ativou" campanhas (cupons e promoções)

**Objetivo:** o relatório *Central de KPIs → Ativação de Campanhas* precisa mostrar
**quem** ativou/desativou cada campanha e **quando**. Hoje o dashboard já entrega
"quantas + quando (cupons) + onde (cidade)", mas **não o usuário** — porque esse
dado **não está persistido** no banco `bigou` que o dashboard consulta.

## Diagnóstico (evidências levantadas no banco `bigou`)

- **`cupom_desconto`**: tem `data` (criação, usada como data de ativação) e
  `usuario_id`, mas `usuario_id` **vem nulo** nos cupons de destaque recentes.
- **`campanha_promocao`**: só tem `data` (criação da campanha). Não há data nem
  usuário **por parceiro**. O `metadata` marca `{"sucessoDoCliente": true}` por
  parceiro, mas esse conjunto está **totalmente desalinhado** do `config` atual
  (interseção `config ∩ metadata = 0` em todas as campanhas ativas) — ou seja, é
  um resíduo histórico, **não serve** para atribuir a ativação atual.
- **`log`** (auditoria, tem `admin_id` = quem fez): cobre `CARDAPIO`,
  `ITEM_CATALOGO`, `TAXA_ENTREGA`, `CONTRATO`, etc. **Não existe** nenhum
  `registro` de ativação de campanha/cupom. Os únicos hits de "promo" são
  `preco_promocional` de item de catálogo.

**Conclusão:** o evento de ativação com o usuário existe em runtime (é o que
alimenta o **bot do Discord** de ativação/desativação de promoções), mas
**não é gravado** em nenhuma tabela deste banco. Provavelmente o backend Bigou
envia direto para um webhook do Discord.

## O que precisa ser feito (backend Bigou)

### Passo 0 — Confirmar a fonte do bot do Discord
Se o bot **lê de uma tabela/banco** (talvez produção, fora do replica que o
dashboard usa), basta **compartilhar o nome/acesso dessa tabela** — o relatório
passa a ler direto de lá, sem novo desenvolvimento.

Se o bot é **webhook efêmero** (não grava), seguir o Passo 1.

### Passo 1 — Persistir o evento de ativação/desativação
No mesmo ponto do código que hoje notifica o Discord, gravar uma linha de
auditoria. **Opção A (preferida, reaproveita a `log`):**

| Coluna              | Valor                                                        |
|---------------------|--------------------------------------------------------------|
| `registro`          | `'CUPOM_DESTAQUE'` ou `'PROMOCAO'`                           |
| `admin_id`          | id do admin/funcionário que fez a ação (ou null se lojista) |
| `estabelecimento_id`| parceiro afetado                                             |
| `alteracao`         | `'ativou'` / `'desativou'` (+ nome da campanha, se útil)    |
| `observacao`        | origem: `'painel'` / `'lojista'` / nome da campanha         |
| `data`              | timestamp do evento                                          |

Isso é suficiente porque `admin_id` resolve para `admin.nome` (nome do usuário),
e o dashboard já mapeia `estabelecimento_id → cidade → gestor`.

**Opção B (tabela dedicada)**, se preferirem não misturar na `log`:
`campanha_ativacao_log (id, tipo ENUM('cupom','promo'), estabelecimento_id,
acao ENUM('ativou','desativou'), ator_id, ator_tipo ENUM('admin','lojista'),
campanha_nome, data)`.

## O que o dashboard fará quando o dado existir

O relatório já está pronto para consumir isso: vai exibir, por período/cidade/
gestor, **quantas ativações**, **por quem** (nome do admin/funcionário ou
"lojista"), e a **linha do tempo diária** — inclusive separando ações feitas
pelo **painel Bigou** vs. pelo **próprio lojista** (via `admin_id`/`ator_tipo`).

## Arquivos relacionados neste repositório
- `netlify/functions/ativacoes-campanhas.ts` — função que gera o relatório atual.
- `src/hooks/useAtivacoesCampanhas.ts` — hook de consumo.
- `src/components/ReportsView.tsx` — aba "Ativação de Campanhas".
