-- =============================================================================
-- ABA: RECESSOS_ESTABELECIMENTO
-- Planilha mestre: 13pX9998D6yRJuJ7IsS33iYMzA804sZ81lDanJaCpM_c
--
-- Tabela no banco: recesso_estabelecimento (doc: "Recesso Estabelecimento")
-- 1 linha = 1 recesso cadastrado (férias, feriado, pausa programada)
--
-- Complementa horario_funcionamento (grade fixa) e delivery.aberto (tempo real):
-- recessos explicam por que a loja está fechada FORA do horário normal.
-- =============================================================================

SELECT
    r.id                                            AS RECESSO_ID,
    r.estabelecimento_id                            AS ESTAB_ID,
    e.nome                                          AS ESTABELECIMENTO,
    loc.nome                                        AS CIDADE,
    loc.cidade_id                                   AS CIDADE_ID,
    DATE_FORMAT(r.data_inicio, '%Y-%m-%d %H:%i:%s') AS DATA_INICIO,
    DATE_FORMAT(r.data_fim,    '%Y-%m-%d %H:%i:%s') AS DATA_FIM,
    IFNULL(r.descricao, '')                         AS DESCRICAO,
    DATE_FORMAT(r.data, '%Y-%m-%d %H:%i:%s')        AS CADASTRADO_EM,
    IFNULL(r.url, '')                               AS URL_TRELLO,
    DATEDIFF(r.data_fim, r.data_inicio) + 1         AS DIAS_DURACAO,
    CASE
        WHEN NOW() BETWEEN r.data_inicio AND r.data_fim THEN 'em_recesso'
        WHEN r.data_inicio > NOW()                      THEN 'futuro'
        ELSE 'encerrado'
    END                                             AS STATUS_RECESSO,
    CASE
        WHEN NOW() BETWEEN r.data_inicio AND r.data_fim THEN 1
        ELSE 0
    END                                             AS EM_RECESSO_AGORA
FROM recesso_estabelecimento r
INNER JOIN estabelecimento e   ON e.id = r.estabelecimento_id
LEFT JOIN  localidade loc      ON loc.id = e.localidade_id
WHERE e.ativo = 1
  AND e.delivery = 1
  -- Últimos 3 meses + recessos futuros (ajuste o intervalo se quiser histórico completo)
  AND r.data_fim >= DATE_SUB(NOW(), INTERVAL 3 MONTH)
  -- AND r.estabelecimento_id = 12345
ORDER BY
    CASE
        WHEN NOW() BETWEEN r.data_inicio AND r.data_fim THEN 0
        WHEN r.data_inicio > NOW() THEN 1
        ELSE 2
    END,
    r.data_inicio DESC;

-- -----------------------------------------------------------------------------
-- CABEÇALHO DA ABA (linha 1):
-- RECESSO_ID | ESTAB_ID | ESTABELECIMENTO | CIDADE | CIDADE_ID | DATA_INICIO | DATA_FIM | DESCRICAO | CADASTRADO_EM | URL_TRELLO | DIAS_DURACAO | STATUS_RECESSO | EM_RECESSO_AGORA
-- -----------------------------------------------------------------------------

-- =============================================================================
-- VERSÃO RESUMIDA — só recessos ativos e futuros (útil para alertas no dashboard)
-- =============================================================================

/*
SELECT
    r.estabelecimento_id                            AS ESTAB_ID,
    e.nome                                          AS ESTABELECIMENTO,
    loc.nome                                        AS CIDADE,
    DATE_FORMAT(r.data_inicio, '%Y-%m-%d')          AS DATA_INICIO,
    DATE_FORMAT(r.data_fim,    '%Y-%m-%d')          AS DATA_FIM,
    IFNULL(r.descricao, '')                         AS DESCRICAO,
    CASE
        WHEN NOW() BETWEEN r.data_inicio AND r.data_fim THEN 'em_recesso'
        ELSE 'futuro'
    END                                             AS STATUS_RECESSO
FROM recesso_estabelecimento r
JOIN estabelecimento e ON e.id = r.estabelecimento_id
LEFT JOIN localidade loc ON loc.id = e.localidade_id
WHERE e.delivery = 1
  AND r.data_fim >= NOW()
ORDER BY r.data_inicio;
*/
