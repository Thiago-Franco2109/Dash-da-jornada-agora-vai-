-- =============================================================================
-- ABA: HISTORICO_FUNCIONAMENTO
-- Planilha mestre: 13pX9998D6yRJuJ7IsS33iYMzA804sZ81lDanJaCpM_c
--
-- 1 linha = 1 evento do painel (tabela log)
-- Sugestão: exportar últimos 90 dias e rodar job diário
--
-- IMPORTANTE: rode 00_explorar_dados.sql (query 0.4) e ajuste os filtros abaixo
--             conforme os valores reais de log.registro no seu ambiente.
-- =============================================================================

SELECT
    lg.id                                           AS LOG_ID,
    lg.estabelecimento_id                           AS ESTAB_ID,
    e.nome                                          AS ESTABELECIMENTO,
    loc.nome                                        AS CIDADE,
    loc.cidade_id                                   AS CIDADE_ID,
    DATE_FORMAT(lg.data, '%Y-%m-%d %H:%i:%s')       AS DATA,
    lg.registro                                     AS REGISTRO,
    lg.alteracao                                    AS ALTERACAO,
    IFNULL(lg.observacao, '')                       AS OBSERVACAO,
    CASE
        WHEN lg.registro  LIKE '%abert%' OR lg.alteracao LIKE '%abert%' THEN 'abertura'
        WHEN lg.registro  LIKE '%fech%'  OR lg.alteracao LIKE '%fech%'  THEN 'fechamento'
        WHEN lg.registro  LIKE '%horar%' OR lg.alteracao LIKE '%horar%' THEN 'horario'
        WHEN lg.registro  LIKE '%delivery%'                              THEN 'delivery'
        ELSE 'outro'
    END                                             AS TIPO_EVENTO
FROM log lg
INNER JOIN estabelecimento e   ON e.id = lg.estabelecimento_id
LEFT JOIN  localidade loc      ON loc.id = e.localidade_id
WHERE lg.estabelecimento_id IS NOT NULL
  AND e.ativo = 1
  AND e.delivery = 1
  AND lg.data >= DATE_SUB(NOW(), INTERVAL 90 DAY)
  AND (
        lg.registro  LIKE '%abert%'
     OR lg.registro  LIKE '%fech%'
     OR lg.registro  LIKE '%horar%'
     OR lg.registro  LIKE '%delivery%'
     OR lg.alteracao LIKE '%abert%'
     OR lg.alteracao LIKE '%fech%'
     OR lg.alteracao LIKE '%horar%'
  )
  -- AND lg.estabelecimento_id = 12345
ORDER BY
    lg.data DESC;

-- -----------------------------------------------------------------------------
-- CABEÇALHO DA ABA (linha 1):
-- LOG_ID | ESTAB_ID | ESTABELECIMENTO | CIDADE | CIDADE_ID | DATA | REGISTRO | ALTERACAO | OBSERVACAO | TIPO_EVENTO
-- -----------------------------------------------------------------------------

-- =============================================================================
-- VERSÃO ALTERNATIVA — se o log tiver poucos registros de abertura/fechamento,
-- use esta query que inclui os últimos eventos manuais da tabela delivery
-- (gera no máximo 2 linhas por loja: última abertura e último fechamento)
-- =============================================================================

/*
SELECT
    CONCAT('ab-', d.estabelecimento_id)             AS LOG_ID,
    d.estabelecimento_id                            AS ESTAB_ID,
    e.nome                                          AS ESTABELECIMENTO,
    loc.nome                                        AS CIDADE,
    loc.cidade_id                                   AS CIDADE_ID,
    DATE_FORMAT(d.aberto_manual, '%Y-%m-%d %H:%i:%s') AS DATA,
    'aberto_manual'                                 AS REGISTRO,
    'Loja aberta manualmente no painel'             AS ALTERACAO,
    ''                                              AS OBSERVACAO,
    'abertura'                                      AS TIPO_EVENTO
FROM delivery d
JOIN estabelecimento e ON e.id = d.estabelecimento_id
LEFT JOIN localidade loc ON loc.id = e.localidade_id
WHERE d.aberto_manual IS NOT NULL AND d.ativo = 1 AND e.delivery = 1

UNION ALL

SELECT
    CONCAT('fc-', d.estabelecimento_id),
    d.estabelecimento_id,
    e.nome,
    loc.nome,
    loc.cidade_id,
    DATE_FORMAT(d.fechado_manual, '%Y-%m-%d %H:%i:%s'),
    'fechado_manual',
    'Loja fechada manualmente no painel',
    '',
    'fechamento'
FROM delivery d
JOIN estabelecimento e ON e.id = d.estabelecimento_id
LEFT JOIN localidade loc ON loc.id = e.localidade_id
WHERE d.fechado_manual IS NOT NULL AND d.ativo = 1 AND e.delivery = 1

ORDER BY DATA DESC;
*/
