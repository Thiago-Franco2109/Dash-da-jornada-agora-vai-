-- =============================================================================
-- PASSO 0 — Rodar ANTES de montar a planilha
-- Objetivo: validar nomes de tabelas, filtros do log e amostra de dados
-- =============================================================================

-- 0.1) Confirmar que as tabelas existem
SHOW TABLES LIKE '%horario%';
SHOW TABLES LIKE '%delivery%';
SHOW TABLES LIKE '%log%';

-- 0.2) Amostra de horários (5 lojas)
SELECT
    e.id            AS ESTAB_ID,
    e.nome          AS ESTABELECIMENTO,
    loc.nome        AS CIDADE,
    hf.dia_semana,
    hf.horario_inicio_1,
    hf.horario_fim_1,
    hf.horario_inicio_2,
    hf.horario_fim_2
FROM horario_funcionamento hf
JOIN estabelecimento e  ON e.id = hf.estabelecimento_id
LEFT JOIN localidade loc ON loc.id = e.localidade_id
WHERE hf.ativo = 1 AND e.ativo = 1
LIMIT 35;

-- 0.3) Status atual (5 lojas)
SELECT
    e.id            AS ESTAB_ID,
    e.nome          AS ESTABELECIMENTO,
    d.aberto,
    d.aberto_manual,
    d.fechado_manual
FROM delivery d
JOIN estabelecimento e ON e.id = d.estabelecimento_id
WHERE d.ativo = 1 AND e.ativo = 1
LIMIT 5;

-- 0.4) Descobrir valores reais de log.registro (rode e ajuste query 03 se precisar)
SELECT
    lg.registro,
    COUNT(*) AS qtd
FROM log lg
WHERE lg.estabelecimento_id IS NOT NULL
GROUP BY lg.registro
ORDER BY qtd DESC
LIMIT 50;

-- 0.5) Amostra de logs que parecem ser abertura/fechamento/horário
SELECT
    lg.id,
    lg.estabelecimento_id,
    lg.registro,
    LEFT(lg.alteracao, 120) AS alteracao,
    lg.data
FROM log lg
WHERE lg.estabelecimento_id IS NOT NULL
  AND (
        lg.registro  LIKE '%abert%'
     OR lg.registro  LIKE '%fech%'
     OR lg.registro  LIKE '%horar%'
     OR lg.registro  LIKE '%delivery%'
     OR lg.alteracao LIKE '%abert%'
     OR lg.alteracao LIKE '%fech%'
     OR lg.alteracao LIKE '%horar%'
  )
ORDER BY lg.data DESC
LIMIT 30;

-- 0.6) Testar um parceiro específico (troque o ID)
-- SET @estab_id = 12345;
-- SELECT * FROM horario_funcionamento WHERE estabelecimento_id = @estab_id;
-- SELECT * FROM delivery WHERE estabelecimento_id = @estab_id;
-- SELECT * FROM log WHERE estabelecimento_id = @estab_id ORDER BY data DESC LIMIT 20;

-- 0.7) Confirmar tabela de recessos
SHOW TABLES LIKE '%recesso%';

-- 0.8) Amostra de recessos
SELECT
    r.id,
    r.estabelecimento_id,
    e.nome          AS estabelecimento,
    r.data_inicio,
    r.data_fim,
    r.descricao
FROM recesso_estabelecimento r
JOIN estabelecimento e ON e.id = r.estabelecimento_id
ORDER BY r.data_inicio DESC
LIMIT 10;
