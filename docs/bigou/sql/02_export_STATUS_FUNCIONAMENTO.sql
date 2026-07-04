-- =============================================================================
-- ABA: STATUS_FUNCIONAMENTO
-- Planilha mestre: 13pX9998D6yRJuJ7IsS33iYMzA804sZ81lDanJaCpM_c
--
-- 1 linha = 1 estabelecimento (snapshot do status atual)
-- Atualizar diariamente (ou a cada hora, se possível)
-- =============================================================================

SELECT
    e.id                                            AS ESTAB_ID,
    e.nome                                          AS ESTABELECIMENTO,
    loc.nome                                        AS CIDADE,
    loc.cidade_id                                   AS CIDADE_ID,
    d.aberto                                        AS ABERTO_AGORA,
    CASE d.aberto
        WHEN 1 THEN 'Aberto'
        ELSE 'Fechado'
    END                                             AS STATUS_ATUAL,
    DATE_FORMAT(d.aberto_manual,  '%Y-%m-%d %H:%i:%s') AS ABERTO_MANUAL,
    DATE_FORMAT(d.fechado_manual, '%Y-%m-%d %H:%i:%s') AS FECHADO_MANUAL,
    IFNULL(d.dias_entrega, '')                      AS DIAS_ENTREGA,
    IFNULL(d.dias_retirada, '')                     AS DIAS_RETIRADA,
    d.tempo_entrega                                 AS TEMPO_ENTREGA_MIN,
    d.tempo_retirada                                AS TEMPO_RETIRADA_MIN,
    DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s')         AS ATUALIZADO_EM
FROM delivery d
INNER JOIN estabelecimento e   ON e.id = d.estabelecimento_id
LEFT JOIN  localidade loc      ON loc.id = e.localidade_id
WHERE d.ativo = 1
  AND e.ativo = 1
  AND e.delivery = 1
  -- AND e.id = 12345
ORDER BY
    CIDADE,
    ESTABELECIMENTO;

-- -----------------------------------------------------------------------------
-- CABEÇALHO DA ABA (linha 1):
-- ESTAB_ID | ESTABELECIMENTO | CIDADE | CIDADE_ID | ABERTO_AGORA | STATUS_ATUAL | ABERTO_MANUAL | FECHADO_MANUAL | DIAS_ENTREGA | DIAS_RETIRADA | TEMPO_ENTREGA_MIN | TEMPO_RETIRADA_MIN | ATUALIZADO_EM
-- -----------------------------------------------------------------------------
