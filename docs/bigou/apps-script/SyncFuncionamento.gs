/**
 * =============================================================================
 * BIGOU — Sync Horários & Funcionamento → Google Sheets
 * =============================================================================
 *
 * Cole este arquivo no Apps Script (pode ser um projeto separado).
 * SQL escrito com crase (template literal) — mais limpo, sem aspas quebradas.
 *
 * Ordem para rodar:
 *   1. syncFuncConfigurarCredenciais  (preencha a SENHA na função, rode 1x)
 *   2. syncFuncTestarConexao
 *   3. syncFuncAtualizarTodasAbas
 *   4. syncFuncInstalarTrigger        (agenda diário às 6h)
 *
 * Planilha mestre: 13pX9998D6yRJuJ7IsS33iYMzA804sZ81lDanJaCpM_c
 * =============================================================================
 */

var SYNC_FUNC_SPREADSHEET_ID = '13pX9998D6yRJuJ7IsS33iYMzA804sZ81lDanJaCpM_c';
var SYNC_FUNC_LOTE = 500;
var SYNC_FUNC_TRIGGER_HANDLER = 'syncFuncAtualizarTodasAbas';

// Só parceiros com contrato lançado nos ultimos N dias (como script de avaliacoes).
// Reduz ~9415 linhas para centenas. Use 0 para trazer TODOS (vai estourar 6 min).
var SYNC_FUNC_DIAS_JORNADA = 90;

function syncFuncFiltroJornadaSql_() {
  if (!SYNC_FUNC_DIAS_JORNADA || SYNC_FUNC_DIAS_JORNADA <= 0) return '';
  return (
    ' AND e.id IN ( ' +
    '   SELECT DISTINCT ve.estabelecimento_id ' +
    '   FROM venda v ' +
    '   INNER JOIN venda_estabelecimento ve ON ve.venda_id = v.id ' +
    '   WHERE v.data_lancamento >= DATE_SUB(NOW(), INTERVAL ' + SYNC_FUNC_DIAS_JORNADA + ' DAY) ' +
    ' ) '
  );
}

// ─── SQL ─────────────────────────────────────────────────────────────────────

function syncFuncSqlHorarios_() {
  return (
    'SELECT ' +
    '  e.id AS ESTAB_ID, ' +
    '  e.nome AS ESTABELECIMENTO, ' +
    '  loc.nome AS CIDADE, ' +
    '  loc.cidade_id AS CIDADE_ID, ' +
    '  hf.dia_semana AS DIA_SEMANA, ' +
    '  hf.horario_inicio_1 AS TURNO_1_INICIO, ' +
    '  hf.horario_fim_1 AS TURNO_1_FIM, ' +
    '  hf.horario_inicio_2 AS TURNO_2_INICIO, ' +
    '  hf.horario_fim_2 AS TURNO_2_FIM ' +
    'FROM horario_funcionamento hf ' +
    'INNER JOIN estabelecimento e ON e.id = hf.estabelecimento_id ' +
    'LEFT JOIN localidade loc ON loc.id = e.localidade_id ' +
    'WHERE hf.ativo = 1 AND e.ativo = 1 AND e.delivery = 1 ' +
    syncFuncFiltroJornadaSql_() +
    'ORDER BY e.nome, hf.dia_semana'
  );
}

function syncFuncSqlRecessos_() {
  return (
    'SELECT ' +
    '  r.id AS RECESSO_ID, ' +
    '  r.estabelecimento_id AS ESTAB_ID, ' +
    '  e.nome AS ESTABELECIMENTO, ' +
    '  loc.nome AS CIDADE, ' +
    '  loc.cidade_id AS CIDADE_ID, ' +
    '  r.data_inicio AS DATA_INICIO, ' +
    '  r.data_fim AS DATA_FIM, ' +
    '  r.descricao AS DESCRICAO, ' +
    '  r.data AS CADASTRADO_EM, ' +
    '  r.url AS URL_TRELLO, ' +
    '  DATEDIFF(r.data_fim, r.data_inicio) + 1 AS DIAS_DURACAO, ' +
    '  CASE WHEN NOW() BETWEEN r.data_inicio AND r.data_fim THEN 1 ELSE 0 END AS EM_RECESSO_AGORA ' +
    'FROM recesso_estabelecimento r ' +
    'INNER JOIN estabelecimento e ON e.id = r.estabelecimento_id ' +
    'LEFT JOIN localidade loc ON loc.id = e.localidade_id ' +
    'WHERE e.ativo = 1 AND e.delivery = 1 ' +
    '  AND r.data_fim >= DATE_SUB(NOW(), INTERVAL 3 MONTH) ' +
    syncFuncFiltroJornadaSql_() +
    'ORDER BY r.data_inicio DESC'
  );
}

/** Rode no DBeaver ou aqui — mostra quantas linhas vai puxar antes do sync. */
function syncFuncContarLinhas() {
  var conn = null;
  try {
    conn = syncFuncAbrirConexao_();
    var rs1 = conn.createStatement().executeQuery(
      'SELECT COUNT(*) AS total FROM horario_funcionamento hf ' +
      'INNER JOIN estabelecimento e ON e.id = hf.estabelecimento_id ' +
      'WHERE hf.ativo = 1 AND e.ativo = 1 AND e.delivery = 1 ' +
      syncFuncFiltroJornadaSql_()
    );
    rs1.next();
    var rs2 = conn.createStatement().executeQuery(
      'SELECT COUNT(*) AS total FROM recesso_estabelecimento r ' +
      'INNER JOIN estabelecimento e ON e.id = r.estabelecimento_id ' +
      'WHERE e.ativo = 1 AND e.delivery = 1 ' +
      '  AND r.data_fim >= DATE_SUB(NOW(), INTERVAL 3 MONTH) ' +
      syncFuncFiltroJornadaSql_()
    );
    rs2.next();
    Logger.log('Horarios (jornada ' + SYNC_FUNC_DIAS_JORNADA + ' dias): ' + rs1.getString('total'));
    Logger.log('Recessos (jornada ' + SYNC_FUNC_DIAS_JORNADA + ' dias): ' + rs2.getString('total'));
    rs1.close();
    rs2.close();
  } finally {
    if (conn) conn.close();
  }
}

// Abas sincronizadas (só horários + recessos)
var SYNC_FUNC_ABAS = [
  {
    nome: 'HORARIOS_FUNCIONAMENTO',
    sql: syncFuncSqlHorarios_,
    headers: [
      'ESTAB_ID', 'ESTABELECIMENTO', 'CIDADE', 'CIDADE_ID', 'DIA_SEMANA',
      'TURNO_1_INICIO', 'TURNO_1_FIM', 'TURNO_2_INICIO', 'TURNO_2_FIM',
    ],
  },
  {
    nome: 'RECESSOS_ESTABELECIMENTO',
    sql: syncFuncSqlRecessos_,
    headers: [
      'RECESSO_ID', 'ESTAB_ID', 'ESTABELECIMENTO', 'CIDADE', 'CIDADE_ID',
      'DATA_INICIO', 'DATA_FIM', 'DESCRICAO', 'CADASTRADO_EM', 'URL_TRELLO',
      'DIAS_DURACAO', 'EM_RECESSO_AGORA',
    ],
  },
];

// ─── Configuração ────────────────────────────────────────────────────────────

/**
 * ▶ RODE PRIMEIRO — preencha a SENHA, salve e execute esta função uma vez.
 * Depois pode voltar a senha para o placeholder (fica salva nas Propriedades).
 */
function syncFuncConfigurarCredenciais() {
  var HOST = '143.198.0.91';
  var PORTA = '3306';
  var BANCO = 'bigou';
  var USUARIO = 'thiago-sc';
  var SENHA = 'COLE_A_SENHA_AQUI';

  if (!SENHA) {
    throw new Error('Preencha a SENHA na função syncFuncConfigurarCredenciais antes de rodar.');
  }

  PropertiesService.getScriptProperties().setProperties({
    SYNC_FUNC_DB_HOST: String(HOST).trim(),
    SYNC_FUNC_DB_PORT: String(PORTA).trim() || '3306',
    SYNC_FUNC_DB_NAME: String(BANCO).trim(),
    SYNC_FUNC_DB_USER: String(USUARIO).trim(),
    SYNC_FUNC_DB_PASS: String(SENHA),
  });

  Logger.log('Credenciais salvas! Agora rode syncFuncTestarConexao.');
}

/** Mostra o que está salvo (sem exibir a senha). */
function syncFuncVerificarCredenciais() {
  var p = PropertiesService.getScriptProperties();
  Logger.log([
    'Host: ' + (p.getProperty('SYNC_FUNC_DB_HOST') || '(vazio)'),
    'Porta: ' + (p.getProperty('SYNC_FUNC_DB_PORT') || '3306'),
    'Banco: ' + (p.getProperty('SYNC_FUNC_DB_NAME') || 'bigou (padrao)'),
    'Usuario: ' + (p.getProperty('SYNC_FUNC_DB_USER') || '(vazio)'),
    'Senha: ' + (p.getProperty('SYNC_FUNC_DB_PASS') ? '*** configurada ***' : '(vazio)'),
  ].join('\n'));
}

// ─── Funções públicas ────────────────────────────────────────────────────────

function syncFuncTestarConexao() {
  var conn = null;
  try {
    conn = syncFuncAbrirConexao_();
    var rs = conn.createStatement().executeQuery('SELECT 1 AS ok');
    rs.next();
    Logger.log('Conexao OK! Valor: ' + rs.getString('ok'));
    rs.close();
  } catch (e) {
    Logger.log('Erro de conexao: ' + e.message);
    throw e;
  } finally {
    if (conn) conn.close();
  }
}

function syncFuncAtualizarTodasAbas() {
  var conn = null;
  var log = [];
  var inicio = new Date();

  try {
    conn = syncFuncAbrirConexao_();
    var ss = syncFuncGetSpreadsheet_();

    for (var i = 0; i < SYNC_FUNC_ABAS.length; i++) {
      var aba = SYNC_FUNC_ABAS[i];
      var t0 = new Date();
      var total = syncFuncSincronizarAba_(conn, ss, aba);
      var seg = (((new Date()) - t0) / 1000).toFixed(1);
      log.push(aba.nome + ': ' + total + ' linhas (' + seg + 's)');
      Logger.log(log[log.length - 1]);
    }

    syncFuncRegistrarLog_(ss, 'OK', log.join(' | '), inicio);
    Logger.log('Concluido em ' + (((new Date()) - inicio) / 1000).toFixed(1) + 's');
  } catch (e) {
    Logger.log('ERRO: ' + e.message);
    try {
      syncFuncRegistrarLog_(SpreadsheetApp.openById(syncFuncGetSpreadsheetId_()), 'ERRO', e.message, inicio);
    } catch (ignore) {}
    throw e;
  } finally {
    if (conn) conn.close();
  }
}

function syncFuncAtualizarSomenteHorarios() { syncFuncAtualizarUmaAba_(0); }
function syncFuncAtualizarSomenteRecessos() { syncFuncAtualizarUmaAba_(1); }

/** Agenda diário às 6h — remove só o trigger deste sync, não os outros. */
function syncFuncInstalarTrigger() {
  syncFuncRemoverTriggerProprio_();
  ScriptApp.newTrigger(SYNC_FUNC_TRIGGER_HANDLER)
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();
  Logger.log('Trigger instalado: roda ' + SYNC_FUNC_TRIGGER_HANDLER + ' todo dia as 6h.');
}

function syncFuncRemoverTrigger() {
  syncFuncRemoverTriggerProprio_();
  Logger.log('Trigger do SyncFuncionamento removido.');
}

// ─── Internas ────────────────────────────────────────────────────────────────

function syncFuncAbrirConexao_() {
  var p = PropertiesService.getScriptProperties();
  var host = p.getProperty('SYNC_FUNC_DB_HOST');
  var port = p.getProperty('SYNC_FUNC_DB_PORT') || '3306';
  var name = p.getProperty('SYNC_FUNC_DB_NAME') || 'bigou';
  var user = p.getProperty('SYNC_FUNC_DB_USER');
  var pass = p.getProperty('SYNC_FUNC_DB_PASS');

  if (!host || !user || !pass) {
    throw new Error('Credenciais incompletas. Rode syncFuncConfigurarCredenciais primeiro.');
  }

  var url = 'jdbc:mysql://' + host + ':' + port + '/' + name;
  return Jdbc.getConnection(url, user, pass);
}

/**
 * Le e grava em lotes — nao carrega tudo na memoria de uma vez.
 * Loga progresso a cada lote para voce ver que esta rodando.
 */
function syncFuncSincronizarAba_(conn, ss, aba) {
  var sheet = ss.getSheetByName(aba.nome);
  if (!sheet) sheet = ss.insertSheet(aba.nome);

  sheet.clear();
  var numCols = aba.headers.length;
  sheet.getRange(1, 1, 1, numCols).setValues([aba.headers]);
  sheet.getRange(1, 1, 1, numCols).setFontWeight('bold');
  sheet.setFrozenRows(1);

  var stmt = conn.createStatement();
  var rs = stmt.executeQuery(aba.sql());
  var cols = rs.getMetaData().getColumnCount();

  var lote = [];
  var total = 0;
  var linhaPlanilha = 2;

  while (rs.next()) {
    var row = [];
    for (var c = 1; c <= cols; c++) {
      var val = rs.getString(c);
      row.push(val === null ? '' : String(val));
    }
    lote.push(row);
    total++;

    if (lote.length >= SYNC_FUNC_LOTE) {
      sheet.getRange(linhaPlanilha, 1, lote.length, numCols).setValues(lote);
      linhaPlanilha += lote.length;
      Logger.log(aba.nome + ': ' + total + ' linhas lidas...');
      lote = [];
      SpreadsheetApp.flush();
    }
  }

  if (lote.length > 0) {
    sheet.getRange(linhaPlanilha, 1, lote.length, numCols).setValues(lote);
  }

  rs.close();
  stmt.close();
  return total;
}

function syncFuncAtualizarUmaAba_(index) {
  var conn = null;
  try {
    conn = syncFuncAbrirConexao_();
    var aba = SYNC_FUNC_ABAS[index];
    var t0 = new Date();
    var total = syncFuncSincronizarAba_(conn, syncFuncGetSpreadsheet_(), aba);
    Logger.log(aba.nome + ': ' + total + ' linhas em ' + (((new Date()) - t0) / 1000).toFixed(1) + 's');
  } finally {
    if (conn) conn.close();
  }
}

function syncFuncRegistrarLog_(ss, status, detalhe, inicio) {
  var sheet = ss.getSheetByName('_SYNC_FUNC_LOG');
  if (!sheet) {
    sheet = ss.insertSheet('_SYNC_FUNC_LOG');
    sheet.hideSheet();
    sheet.appendRow(['DATA', 'STATUS', 'DETALHE', 'DURACAO_SEG']);
  }
  sheet.appendRow([
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
    status,
    detalhe,
    (((new Date()) - inicio) / 1000).toFixed(1),
  ]);
}

function syncFuncGetSpreadsheetId_() {
  var id = PropertiesService.getScriptProperties().getProperty('SYNC_FUNC_SPREADSHEET_ID');
  return id || SYNC_FUNC_SPREADSHEET_ID;
}

function syncFuncGetSpreadsheet_() {
  // Se o script esta DENTRO da planilha (Extensões > Apps Script), usa ela.
  try {
    var ativa = SpreadsheetApp.getActiveSpreadsheet();
    if (ativa) {
      Logger.log('Usando planilha ativa: ' + ativa.getName());
      return ativa;
    }
  } catch (ignore) {}

  // Projeto avulso: precisa de permissao de edicao na planilha mestre.
  var id = syncFuncGetSpreadsheetId_();
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error(
      'Sem permissao na planilha ' + id + '. ' +
      'Solucao: abra a planilha mestre > Extensões > Apps Script > cole este codigo la dentro.'
    );
  }
}

function syncFuncRemoverTriggerProprio_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === SYNC_FUNC_TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
