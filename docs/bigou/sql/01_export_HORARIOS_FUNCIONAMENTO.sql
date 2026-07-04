-- =============================================================================
-- ABA: HORARIOS_FUNCIONAMENTO
-- Planilha mestre: 13pX9998D6yRJuJ7IsS33iYMzA804sZ81lDanJaCpM_c
--
-- 1 linha = 1 estabelecimento + 1 dia da semana (até 7 linhas por loja)
-- Exportar resultado → colar na aba a partir da linha 2 (linha 1 = cabeçalho)
-- =============================================================================

SELECT
    e.id                                            AS ESTAB_ID,
    e.nome                                          AS ESTABELECIMENTO,
    loc.nome                                        AS CIDADE,
    loc.cidade_id                                   AS CIDADE_ID,
    hf.dia_semana                                   AS DIA_SEMANA,
    CASE hf.dia_semana
        WHEN 0 THEN 'Domingo'
        WHEN 1 THEN 'Segunda'
        WHEN 2 THEN 'Terça'
        WHEN 3 THEN 'Quarta'
        WHEN 4 THEN 'Quinta'
        WHEN 5 THEN 'Sexta'
        WHEN 6 THEN 'Sábado'
    END                                             AS DIA,
    IFNULL(hf.horario_inicio_1, '')                 AS TURNO_1_INICIO,
    IFNULL(hf.horario_fim_1, '')                    AS TURNO_1_FIM,
    IFNULL(hf.horario_inicio_2, '')                 AS TURNO_2_INICIO,
    IFNULL(hf.horario_fim_2, '')                    AS TURNO_2_FIM,
    CASE
        WHEN hf.horario_inicio_1 IS NOT NULL AND hf.horario_fim_1 IS NOT NULL
             AND hf.horario_inicio_2 IS NOT NULL AND hf.horario_fim_2 IS NOT NULL
            THEN CONCAT(hf.horario_inicio_1, '-', hf.horario_fim_1, ' | ', hf.horario_inicio_2, '-', hf.horario_fim_2)
        WHEN hf.horario_inicio_1 IS NOT NULL AND hf.horario_fim_1 IS NOT NULL
            THEN CONCAT(hf.horario_inicio_1, '-', hf.horario_fim_1)
        ELSE ''
    END                                             AS TURNOS_RESUMO
FROM horario_funcionamento hf
INNER JOIN estabelecimento e   ON e.id = hf.estabelecimento_id
LEFT JOIN  localidade loc      ON loc.id = e.localidade_id
WHERE hf.ativo = 1
  AND e.ativo = 1
  AND e.delivery = 1          -- contrato delivery ativo
  -- AND e.id = 12345          -- descomente para testar 1 parceiro
ORDER BY
    CIDADE,
    ESTABELECIMENTO,
    hf.dia_semana;

-- -----------------------------------------------------------------------------
-- CABEÇALHO DA ABA (linha 1 no Google Sheets — copiar exatamente):
-- ESTAB_ID | ESTABELECIMENTO | CIDADE | CIDADE_ID | DIA_SEMANA | DIA | TURNO_1_INICIO | TURNO_1_FIM | TURNO_2_INICIO | TURNO_2_FIM | TURNOS_RESUMO
-- -----------------------------------------------------------------------------
