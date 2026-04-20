/**
 * Web App — contrato alinhado à planilha "ERP Espaço Lounge"
 * (abas: Clientes, Serviços, Atendimentos, … — ver docs/CONTRATO_PLANILHA.md).
 *
 * Nomes de abas com acentos devem coincidir com o Google Sheets (ex.: Serviços).
 */
var SHEETS = {
  CLIENTES: 'Clientes',
  SERVICOS: 'Serviços',
  ATENDIMENTOS: 'Atendimentos',
  REGRAS_MEGA: 'Regras Mega',
  PACOTES: 'Pacotes',
  PRODUTOS: 'Produtos',
  CABELOS: 'Cabelos',
  FOLHA: 'Folha'
};

function doGet(e) {
  e = e || { parameter: {} };
  var action = (e.parameter && e.parameter.action) || 'health';
  try {
    var result;
    switch (action) {
      case 'health':
        result = { status: 'up', time: new Date().toISOString() };
        break;
      case 'listClientes':
        result = { items: listClientes_() };
        break;
      case 'getCliente':
        result = { item: getClienteById_(e.parameter.cliente_id || e.parameter.id || '') };
        break;
      case 'listServicos':
        result = { items: listServicos_() };
        break;
      case 'listRegrasMega':
        result = { items: listRegrasMega_() };
        break;
      case 'listPacotes':
        result = { items: listPacotes_() };
        break;
      case 'listProdutos':
        result = { items: listProdutos_() };
        break;
      case 'listCabelos':
        result = { items: listCabelos_() };
        break;
      case 'listProfissionais':
        result = { items: listProfissionais_() };
        break;
      case 'listAgendamentos':
      case 'listAtendimentos':
        result = {
          items: listAtendimentos_(
            e.parameter.dataInicio || '',
            e.parameter.dataFim || ''
          )
        };
        break;
      default:
        return jsonResponse_(ok_(false, null, err_('UNKNOWN_ACTION', 'Ação GET desconhecida: ' + action)));
    }
    return jsonResponse_(ok_(true, result, null));
  } catch (ex) {
    return jsonResponse_(ok_(false, null, err_('SERVER', String(ex.message || ex))));
  }
}

function doPost(e) {
  try {
    var body = parsePostBody_(e);
    var action = body.action;
    var payload = body.payload || {};
    var result;

    switch (action) {
      case 'createCliente':
        result = createCliente_(payload);
        break;
      case 'updateCliente':
        result = updateCliente_(payload);
        break;
      case 'createAgendamento':
      case 'createAtendimento':
        result = createAtendimento_(payload);
        break;
      default:
        return jsonResponse_(ok_(false, null, err_('UNKNOWN_ACTION', 'Ação POST desconhecida: ' + action)));
    }
    return jsonResponse_(ok_(true, result, null));
  } catch (ex) {
    return jsonResponse_(ok_(false, null, err_('SERVER', String(ex.message || ex))));
  }
}

function parsePostBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Corpo da requisição vazio');
  }
  return JSON.parse(e.postData.contents);
}

function ok_(ok, data, error) {
  return { ok: ok, data: data, error: error };
}

function err_(code, message) {
  return { code: code, message: message };
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSs_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  var sh = getSs_().getSheetByName(name);
  if (!sh) {
    throw new Error('Aba não encontrada: ' + name);
  }
  return sh;
}

function sheetOptional_(name) {
  return getSs_().getSheetByName(name);
}

function headerMap_(sh) {
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim();
    if (h) map[h] = i;
  }
  return map;
}

function rowsToObjects_(sh, fromRow) {
  fromRow = fromRow || 2;
  var last = sh.getLastRow();
  if (last < fromRow) return [];
  var map = headerMap_(sh);
  var data = sh.getRange(fromRow, 1, last, sh.getLastColumn()).getValues();
  var out = [];
  for (var r = 0; r < data.length; r++) {
    var row = data[r];
    var obj = {};
    var empty = true;
    for (var key in map) {
      var v = row[map[key]];
      obj[key] = v === '' ? null : v;
      if (obj[key] !== null && obj[key] !== undefined) empty = false;
    }
    if (!empty) out.push(obj);
  }
  return out;
}

function appendRowByHeaders_(sh, obj) {
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row = [];
  for (var c = 0; c < headers.length; c++) {
    var key = String(headers[c] || '').trim();
    row.push(key && obj.hasOwnProperty(key) ? obj[key] : '');
  }
  sh.appendRow(row);
}

function pad2_(n) {
  var x = parseInt(String(n), 10);
  if (isNaN(x)) return '00';
  return x < 10 ? '0' + x : String(x);
}

/** aaaammdd a partir da data do payload (YYYY-MM-DD, DD/MM/YYYY ou Date). */
function ymdCompactFromDataStr_(dataStr) {
  var s = String(dataStr || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.substring(0, 4) + s.substring(5, 7) + s.substring(8, 10);
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
    var p = s.split('/');
    var d = parseInt(p[0], 10);
    var m = parseInt(p[1], 10);
    var y = parseInt(p[2], 10);
    return String(y) + pad2_(m) + pad2_(d);
  }
  try {
    return Utilities.formatDate(
      dataStrToDate_(s),
      Session.getScriptTimeZone(),
      'yyyyMMdd'
    );
  } catch (ex) {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  }
}

/** Formato da planilha: DATA (compacta) + '-' + ID Cliente (ex.: 20260401-CL0001). */
function makeIdAtendimento_(dataStr, clienteId) {
  return ymdCompactFromDataStr_(dataStr) + '-' + String(clienteId || '').trim();
}

function isIdAtendimentoCellEmpty_(v) {
  if (v === null || v === undefined) return true;
  return String(v).trim() === '';
}

/** Primeira linha com coluna ID Atendimento vazia (evita append na última linha da grelha). */
function firstEmptyRowAtendimentos_(sh) {
  var map = headerMap_(sh);
  var idIdx = map['ID Atendimento'];
  if (idIdx === undefined) {
    idIdx = 0;
  }
  var col = idIdx + 1;
  var last = sh.getLastRow();
  if (last < 2) return 2;
  for (var r = 2; r <= last; r++) {
    var v = sh.getRange(r, col).getValue();
    if (isIdAtendimentoCellEmpty_(v)) return r;
  }
  return last + 1;
}

function writeRowByHeadersAt_(sh, rowNum, obj) {
  var numCols = sh.getLastColumn();
  if (numCols < 1) {
    throw new Error('Aba Atendimentos sem colunas');
  }
  var headers = sh.getRange(1, 1, 1, numCols).getValues()[0];
  var row = [];
  for (var c = 0; c < numCols; c++) {
    var key = String(headers[c] || '').trim();
    row.push(key && obj.hasOwnProperty(key) ? obj[key] : '');
  }
  sh.getRange(rowNum, 1, rowNum, numCols).setValues([row]);
}

function ymdFromCell_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
    var p = s.split('/');
    var d = p[0].length === 1 ? '0' + p[0] : p[0];
    var m = p[1].length === 1 ? '0' + p[1] : p[1];
    return p[2] + '-' + m + '-' + d;
  }
  return '';
}

function dataStrToDate_(s) {
  var parts = String(s).split('-');
  if (parts.length === 3) {
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) - 1;
    var d = parseInt(parts[2], 10);
    return new Date(y, m, d);
  }
  return new Date(s);
}

function comissaoCell_(r) {
  if (r['Comissão'] != null && r['Comissão'] !== '') return r['Comissão'];
  if (r['Comissao'] != null && r['Comissao'] !== '') return r['Comissao'];
  return '';
}

function listRegrasMega_() {
  var sh = sheetOptional_(SHEETS.REGRAS_MEGA);
  if (!sh) return [];
  var rows = rowsToObjects_(sh);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var pac = r['Pacote'] != null ? String(r['Pacote']).trim() : '';
    var et = r['Etapa'] != null ? String(r['Etapa']).trim() : '';
    if (!pac || !et) continue;
    out.push({
      pacote: pac,
      etapa: et,
      valor: r['Valor'],
      comissao: comissaoCell_(r)
    });
  }
  return out;
}

function findRegraMega_(pacote, etapa) {
  var sp = String(pacote || '').trim();
  var se = String(etapa || '').trim();
  var list = listRegrasMega_();
  for (var i = 0; i < list.length; i++) {
    if (list[i].pacote === sp && list[i].etapa === se) {
      return { valor: list[i].valor, comissao: list[i].comissao };
    }
  }
  throw new Error('Combinação Pacote/Etapa não encontrada em Regras Mega: "' + sp + '" / "' + se + '"');
}

function listPacotes_() {
  var sh = sheetOptional_(SHEETS.PACOTES);
  if (!sh) return [];
  var rows = rowsToObjects_(sh);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var nome = r['Pacote'] != null ? String(r['Pacote']).trim() : '';
    if (!nome) continue;
    var preco = r['Preço pacote'];
    if (preco === null || preco === '') preco = r['Preço Pacote'];
    if (preco === null || preco === '') preco = r['Preço'];
    out.push({ pacote: nome, preco: preco });
  }
  return out;
}

function findPrecoPacote_(pacoteNome) {
  var nome = String(pacoteNome || '').trim();
  var list = listPacotes_();
  for (var i = 0; i < list.length; i++) {
    if (list[i].pacote === nome) {
      return list[i].preco;
    }
  }
  return null;
}

function listProdutos_() {
  var sh = sheetOptional_(SHEETS.PRODUTOS);
  if (!sh) return [];
  var rows = rowsToObjects_(sh);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var nome = r['Produto'] != null ? String(r['Produto']).trim() : '';
    if (!nome) continue;
    var preco = r['Preço'];
    if (preco === null || preco === '') preco = r['Preco'];
    var unidade = r['Unidade'] != null ? String(r['Unidade']) : '';
    out.push({ produto: nome, preco: preco, unidade: unidade });
  }
  return out;
}

function findProdutoPreco_(produtoNome) {
  var nome = String(produtoNome || '').trim();
  var list = listProdutos_();
  for (var i = 0; i < list.length; i++) {
    if (list[i].produto === nome) {
      return list[i].preco;
    }
  }
  return null;
}

function listCabelos_() {
  var sh = sheetOptional_(SHEETS.CABELOS);
  if (!sh) return [];
  var rows = rowsToObjects_(sh);
  return rows.map(function (r) {
    return {
      cor: r['Cor'] != null ? String(r['Cor']) : '',
      tamanho_cm: r['Tamanho (cm)'] != null ? r['Tamanho (cm)'] : r['Tamanho'],
      metodo: r['Método'] != null ? String(r['Método']) : r['Metodo'] != null ? String(r['Metodo']) : '',
      valor_base: r['Valor Base'] != null ? r['Valor Base'] : ''
    };
  });
}

/**
 * Localiza a linha e coluna do cabeçalho "Profissional" (abas com tabela / linha 1 vazia).
 * Comparação sem acentos e case-insensitive.
 */
function findProfissionalHeaderCell_(sh) {
  var maxRows = Math.min(sh.getLastRow(), 50);
  var maxCol = sh.getLastColumn();
  if (maxRows < 1 || maxCol < 1) return null;
  for (var r = 1; r <= maxRows; r++) {
    var row = sh.getRange(r, 1, r, maxCol).getValues()[0];
    for (var c = 0; c < row.length; c++) {
      var h = String(row[c] || '').trim().toLowerCase();
      if (h === 'profissional') {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

function isLikelyProfissionalName_(s) {
  var name = String(s || '').trim();
  if (!name || name.length > 80) return false;
  var low = name.toLowerCase();
  if (low === 'profissional') return false;
  if (/^#ref!$/i.test(name)) return false;
  // datas tipo 01/04/2026
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(name)) return false;
  if (/^r\$\s*[\d.,-]+$/i.test(name.replace(/\s/g, ''))) return false;
  return true;
}

/** Nomes únicos da coluna Profissional na aba Folha (para dropdown no app). */
function listProfissionais_() {
  var sh = sheetOptional_(SHEETS.FOLHA);
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];

  var found = findProfissionalHeaderCell_(sh);
  var colNum;
  var dataStartRow;

  if (found) {
    colNum = found.col + 1;
    dataStartRow = found.row + 1;
  } else {
    var map = headerMap_(sh);
    var colIdx = map['Profissional'];
    if (colIdx === undefined) {
      colNum = 1;
      dataStartRow = 2;
    } else {
      colNum = colIdx + 1;
      dataStartRow = 2;
    }
  }

  if (last < dataStartRow) return [];
  var values = sh.getRange(dataStartRow, colNum, last, colNum).getValues();
  var seen = {};
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var name = String(values[i][0] || '').trim();
    if (!isLikelyProfissionalName_(name)) continue;
    if (!seen[name]) {
      seen[name] = true;
      out.push(name);
    }
  }
  out.sort(function (a, b) {
    return a.localeCompare(b, 'pt-BR');
  });
  return out;
}

function listClientes_() {
  var raw = rowsToObjects_(sheet_(SHEETS.CLIENTES));
  return raw
    .map(function (r) {
      return {
        id: String(r['ID Cliente'] || ''),
        nome: String(r['Nome Exibido'] || ''),
        telefone: r['Telefone'] != null && r['Telefone'] !== '' ? String(r['Telefone']) : null,
        observacoes:
          r['Observações'] != null && r['Observações'] !== ''
            ? String(r['Observações'])
            : null
      };
    })
    .filter(function (x) {
      var nomeOk = String(x.nome || '').trim().length > 0;
      var idOk = String(x.id || '').trim().length > 0;
      return nomeOk && idOk;
    });
}

function listServicos_() {
  var sh = sheet_(SHEETS.SERVICOS);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var map = headerMap_(sh);
  var data = sh.getRange(2, 1, last, sh.getLastColumn()).getValues();
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var obj = { id: String(i + 2) };
    var empty = true;
    for (var key in map) {
      var v = row[map[key]];
      obj[key] = v === '' ? null : v;
      if (obj[key] !== null && obj[key] !== undefined) empty = false;
    }
    if (!empty) out.push(obj);
  }
  return out;
}

function listAtendimentos_(dataInicio, dataFim) {
  var items = rowsToObjects_(sheet_(SHEETS.ATENDIMENTOS));
  var filtered = items.filter(function (a) {
    var ymd = ymdFromCell_(a['Data']);
    if (!dataInicio && !dataFim) return true;
    if (!ymd) return false;
    if (dataInicio && ymd < String(dataInicio)) return false;
    if (dataFim && ymd > String(dataFim)) return false;
    return true;
  });
  return filtered.map(function (a) {
    var o = {};
    for (var k in a) o[k] = a[k];
    o.id = String(a['ID Atendimento'] || '');
    return o;
  });
}

function findClienteRowIndex_(sh, clienteId) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var map = headerMap_(sh);
  var colId = map['ID Cliente'];
  if (colId === undefined) return -1;
  var colNum = colId + 1;
  var values = sh.getRange(2, colNum, last, colNum).getValues();
  var sid = String(clienteId);
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '') === sid) {
      return i + 2;
    }
  }
  return -1;
}

function getClienteById_(clienteId) {
  var id = String(clienteId || '').trim();
  if (!id) {
    throw new Error('cliente_id é obrigatório');
  }
  var sh = sheet_(SHEETS.CLIENTES);
  var rowIdx = findClienteRowIndex_(sh, id);
  if (rowIdx < 0) {
    throw new Error('Cliente não encontrado');
  }
  var map = headerMap_(sh);
  var row = sh.getRange(rowIdx, 1, rowIdx, sh.getLastColumn()).getValues()[0];
  var r = {};
  for (var key in map) {
    r[key] = row[map[key]];
  }
  return {
    id: String(r['ID Cliente'] || ''),
    nome: String(r['Nome Exibido'] || ''),
    telefone: r['Telefone'] != null && r['Telefone'] !== '' ? String(r['Telefone']) : null,
    observacoes:
      r['Observações'] != null && r['Observações'] !== ''
        ? String(r['Observações'])
        : null
  };
}

function findClienteNome_(id) {
  var c = getClienteById_(id);
  var n = String(c.nome || '').trim();
  if (!n) {
    throw new Error('Cliente sem nome exibido: ' + id);
  }
  return n;
}

function updateCliente_(p) {
  var id = String(p.cliente_id || '').trim();
  var nome = String(p.nome || '').trim();
  if (!id) {
    throw new Error('cliente_id é obrigatório');
  }
  if (!nome) {
    throw new Error('Nome exibido é obrigatório');
  }
  var sh = sheet_(SHEETS.CLIENTES);
  var rowIdx = findClienteRowIndex_(sh, id);
  if (rowIdx < 0) {
    throw new Error('Cliente não encontrado');
  }
  var map = headerMap_(sh);
  function setCell(header, value) {
    var c = map[header];
    if (c !== undefined) {
      sh.getRange(rowIdx, c + 1).setValue(value == null ? '' : value);
    }
  }
  setCell('Nome Exibido', nome);
  setCell('Telefone', p.telefone != null ? p.telefone : '');
  setCell('Observações', p.notas != null ? p.notas : '');
  return {
    id: id,
    nome: nome,
    telefone: p.telefone != null ? String(p.telefone) : '',
    observacoes: p.notas != null ? String(p.notas) : ''
  };
}

function readServicoRow_(lineNum) {
  var sh = sheet_(SHEETS.SERVICOS);
  var n = parseInt(String(lineNum), 10);
  if (n < 2 || n > sh.getLastRow()) {
    throw new Error('Linha inválida na aba Serviços: ' + lineNum);
  }
  var map = headerMap_(sh);
  var row = sh.getRange(n, 1, n, sh.getLastColumn()).getValues()[0];
  var obj = {};
  for (var key in map) {
    obj[key] = row[map[key]];
  }
  return obj;
}

function pickValorServico_(row, tamanho) {
  var t = String(tamanho || 'Curto').trim();
  var colMap = {
    Curto: 'Preço Curto',
    'Médio': 'Preço Médio',
    'M/L': 'Preço Médio/Longo',
    Longo: 'Preço Longo'
  };
  var col = colMap[t] || 'Preço Curto';
  var v = row[col];
  if (v === '' || v === null || v === undefined) {
    v = row['Valor Base'];
  }
  return v === '' || v === null || v === undefined ? '' : v;
}

/** Fixo | Tamanho | LegacyServico (coluna Tipo antiga) | '' */
function tipoServicoCatalogo_(srv) {
  var t = String(srv['Tipo'] || '').trim().toLowerCase();
  if (t === 'fixo') return 'Fixo';
  if (t === 'tamanho') return 'Tamanho';
  if (t === 'serviço' || t === 'servico') return 'LegacyServico';
  return '';
}

function parsePercentCell_(cell) {
  if (cell === '' || cell === null || cell === undefined) return 0;
  if (typeof cell === 'number') {
    if (cell > 1 && cell <= 100) return cell / 100;
    return cell <= 1 ? cell : cell / 100;
  }
  var s = String(cell)
    .replace(/\s/g, '')
    .replace('%', '')
    .replace(',', '.');
  var n = parseFloat(s);
  if (isNaN(n)) return 0;
  if (n > 1 && n <= 100) return n / 100;
  return n;
}

function toNumberPt_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  var s = String(v)
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  var n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function comissaoFromPercentAndValor_(valorCell, pctCell) {
  var vNum = toNumberPt_(valorCell);
  if (vNum === null || isNaN(vNum)) return '';
  var pct = parsePercentCell_(pctCell);
  if (pct <= 0) return '';
  return vNum * pct;
}

/**
 * Fixo: Valor Base + Comissão Fixa; Tamanho: preço por coluna F–I + comissão = valor × Comissão %.
 */
function valorEComissaoServico_(srv, cat, tamanhoParam, legacy) {
  if (legacy && !cat) {
    var valorL = pickValorServico_(srv, tamanhoParam);
    return {
      valor: valorL,
      comissao: '',
      tamanhoParaPlanilha: tamanhoParam
    };
  }
  if (cat === 'Fixo') {
    var vb = srv['Valor Base'];
    var cf =
      srv['Comissão Fixa'] !== '' && srv['Comissão Fixa'] != null
        ? srv['Comissão Fixa']
        : srv['Comissao Fixa'];
    return {
      valor: vb === undefined || vb === '' ? '' : vb,
      comissao: cf === undefined || cf === '' ? '' : cf,
      tamanhoParaPlanilha: ''
    };
  }
  if (cat === 'Tamanho' || cat === 'LegacyServico') {
    var tam = String(tamanhoParam || 'Curto').trim();
    var valorT = pickValorServico_(srv, tam);
    var pctCol =
      srv['Comissão %'] !== '' && srv['Comissão %'] != null
        ? srv['Comissão %']
        : srv['Comissao %'];
    var comT = '';
    if (pctCol !== undefined && pctCol !== null && pctCol !== '') {
      comT = comissaoFromPercentAndValor_(valorT, pctCol);
    }
    return {
      valor: valorT,
      comissao: comT,
      tamanhoParaPlanilha: tam
    };
  }
  throw new Error(
    'Tipo da linha Serviços não reconhecido (use Fixo ou Tamanho): ' +
      String(srv['Tipo'] || '')
  );
}

function appendAtendimentoLinha_(sh, o) {
  var row = {};
  row['ID Atendimento'] = o.idAt;
  row['Data'] = dataStrToDate_(o.dataStr);
  row['ID Cliente'] = o.clienteId;
  row['Nome Cliente'] = o.nomeCliente;
  row['Tipo'] = o.tipo;
  row['Pacote'] = o.pacote != null ? o.pacote : '';
  row['Etapa'] = o.etapa != null ? o.etapa : '';
  row['Produto'] = o.produto != null ? o.produto : '';
  row['Serviços'] = o.servicos != null ? o.servicos : '';
  row['Tamanho'] = o.tamanho != null ? o.tamanho : '';
  row['Profissional'] = o.profissional != null ? o.profissional : '';
  row['Valor'] = o.valor !== undefined && o.valor !== null && o.valor !== '' ? o.valor : '';
  row['Valor Manual'] = o.valorManual != null && o.valorManual !== '' ? o.valorManual : '';
  row['Comissão'] = o.comissao !== undefined && o.comissao !== null && o.comissao !== '' ? o.comissao : '';
  row['Desconto'] = '';
  row['Descrição'] = o.descricao != null ? o.descricao : '';
  row['Descrição Manual'] = '';
  row['Custo'] = '';
  row['Lucro'] = '';
  var rowNum = firstEmptyRowAtendimentos_(sh);
  writeRowByHeadersAt_(sh, rowNum, row);
}

function requireProfissional_(p) {
  var prof = String(p.profissional || '').trim();
  if (!prof) {
    throw new Error('Profissional é obrigatório');
  }
  return prof;
}

/** Próximo ID no padrão legado `CL0001`… (ignora UUIDs na coluna). */
function nextClienteIdCl_() {
  var sh = sheet_(SHEETS.CLIENTES);
  var last = sh.getLastRow();
  if (last < 2) {
    return 'CL0001';
  }
  var map = headerMap_(sh);
  var colId = map['ID Cliente'];
  if (colId === undefined) {
    return 'CL0001';
  }
  var colNum = colId + 1;
  var values = sh.getRange(2, colNum, last, colNum).getValues();
  var max = 0;
  var re = /^CL(\d+)$/i;
  for (var i = 0; i < values.length; i++) {
    var cell = String(values[i][0] || '').trim();
    var m = cell.match(re);
    if (m) {
      var n = parseInt(m[1], 10);
      if (!isNaN(n) && n > max) {
        max = n;
      }
    }
  }
  var next = max + 1;
  var s = String(next);
  while (s.length < 4) {
    s = '0' + s;
  }
  return 'CL' + s;
}

function createCliente_(p) {
  var nome = (p.nome || '').toString().trim();
  if (!nome) {
    throw new Error('Nome do cliente é obrigatório');
  }
  var id = nextClienteIdCl_();
  var row = {};
  row['ID Cliente'] = id;
  row['Nome Exibido'] = nome;
  row['Telefone'] = p.telefone || '';
  row['Observações'] = p.notas || '';
  appendRowByHeaders_(sheet_(SHEETS.CLIENTES), row);
  return {
    id: id,
    nome: nome,
    telefone: p.telefone || '',
    observacoes: p.notas || ''
  };
}

function createAtendimento_(p) {
  var tipo = String(p.tipo || '').trim();
  if (!tipo && (p.servico_id || p.servico_linha)) {
    return createAtendimentoServico_(p, true);
  }
  if (!tipo) {
    throw new Error('tipo é obrigatório (ex.: Serviço, Mega, Pacote, Produto, Cabelo)');
  }
  switch (tipo) {
    case 'Serviço':
      return createAtendimentoServico_(p, false);
    case 'Mega':
      return createAtendimentoMega_(p);
    case 'Pacote':
      return createAtendimentoPacote_(p);
    case 'Produto':
      return createAtendimentoProduto_(p);
    case 'Cabelo':
      return createAtendimentoCabelo_(p);
    default:
      throw new Error('Tipo desconhecido: ' + tipo);
  }
}

function createAtendimentoServico_(p, legacy) {
  var clienteId = (p.cliente_id || '').toString().trim();
  var linhaServico = parseInt(String(p.servico_id || p.servico_linha || '0'), 10);
  var dataStr = (p.data || '').toString().trim();
  if (!clienteId || !linhaServico || !dataStr) {
    throw new Error('cliente_id, servico_id (linha na aba Serviços) e data são obrigatórios');
  }
  var profissional = String(p.profissional || '').trim();
  if (!profissional && !legacy) {
    throw new Error('Profissional é obrigatório');
  }
  var tamanhoParam = (p.tamanho || '').toString().trim();
  var nomeCliente = findClienteNome_(clienteId);
  var srv = readServicoRow_(linhaServico);
  var nomeServico = srv['Serviço'] != null ? String(srv['Serviço']) : '';
  var cat = tipoServicoCatalogo_(srv);
  if (!legacy && !cat) {
    throw new Error(
      'Tipo da linha Serviços não reconhecido (use Fixo ou Tamanho): ' +
        String(srv['Tipo'] || '')
    );
  }
  if (!legacy && cat === 'Tamanho' && !tamanhoParam) {
    tamanhoParam = 'Curto';
  }
  var vc = valorEComissaoServico_(srv, cat, tamanhoParam || 'Curto', legacy);
  var idAt = makeIdAtendimento_(dataStr, clienteId);
  var sh = sheet_(SHEETS.ATENDIMENTOS);
  appendAtendimentoLinha_(sh, {
    idAt: idAt,
    dataStr: dataStr,
    clienteId: clienteId,
    nomeCliente: nomeCliente,
    tipo: 'Serviço',
    pacote: '',
    etapa: '',
    produto: '',
    servicos: nomeServico,
    tamanho: vc.tamanhoParaPlanilha,
    profissional: profissional,
    valor: vc.valor,
    comissao: vc.comissao,
    descricao: String(p.observacao || '').trim()
  });
  return {
    id: idAt,
    linhas: 1,
    data: dataStr,
    cliente_id: clienteId,
    nomeCliente: nomeCliente
  };
}

function createAtendimentoMega_(p) {
  var clienteId = String(p.cliente_id || '').trim();
  var dataStr = String(p.data || '').trim();
  var pacote = String(p.pacote || '').trim();
  if (!clienteId || !dataStr || !pacote) {
    throw new Error('cliente_id, data e pacote são obrigatórios para Mega');
  }
  var etapas = p.etapas || [];
  if (!etapas.length) {
    throw new Error('Inclua ao menos uma etapa para Mega');
  }
  var nomeCliente = findClienteNome_(clienteId);
  var idAt = makeIdAtendimento_(dataStr, clienteId);
  var sh = sheet_(SHEETS.ATENDIMENTOS);
  var obs = String(p.observacao || '').trim();
  for (var i = 0; i < etapas.length; i++) {
    var st = etapas[i];
    var etapaNome = String(st.etapa || '').trim();
    var prof = String(st.profissional || '').trim();
    if (!etapaNome || !prof) {
      throw new Error('Cada etapa exige etapa e profissional');
    }
    var regra = findRegraMega_(pacote, etapaNome);
    appendAtendimentoLinha_(sh, {
      idAt: idAt,
      dataStr: dataStr,
      clienteId: clienteId,
      nomeCliente: nomeCliente,
      tipo: 'Mega',
      pacote: pacote,
      etapa: etapaNome,
      produto: '',
      servicos: '',
      tamanho: '',
      profissional: prof,
      valor: regra.valor,
      comissao: regra.comissao,
      descricao: obs
    });
  }
  return {
    id: idAt,
    linhas: etapas.length,
    data: dataStr,
    cliente_id: clienteId,
    nomeCliente: nomeCliente
  };
}

function createAtendimentoPacote_(p) {
  var clienteId = String(p.cliente_id || '').trim();
  var dataStr = String(p.data || '').trim();
  var pacote = String(p.pacote || '').trim();
  if (!clienteId || !dataStr || !pacote) {
    throw new Error('cliente_id, data e pacote são obrigatórios para Pacote');
  }
  var profCob = requireProfissional_(p);
  var etapas = p.etapas || [];
  if (!etapas.length) {
    throw new Error('Inclua ao menos uma etapa realizada para Pacote');
  }
  var preco = findPrecoPacote_(pacote);
  if (preco === null || preco === '') {
    throw new Error('Pacote não encontrado na aba Pacotes: "' + pacote + '"');
  }
  var nomeCliente = findClienteNome_(clienteId);
  var idAt = makeIdAtendimento_(dataStr, clienteId);
  var sh = sheet_(SHEETS.ATENDIMENTOS);
  var obs = String(p.observacao || '').trim();
  appendAtendimentoLinha_(sh, {
    idAt: idAt,
    dataStr: dataStr,
    clienteId: clienteId,
    nomeCliente: nomeCliente,
    tipo: 'Pacote',
    pacote: pacote,
    etapa: '',
    produto: '',
    servicos: '',
    tamanho: '',
    profissional: profCob,
    valor: preco,
    comissao: '',
    descricao: obs
  });
  for (var j = 0; j < etapas.length; j++) {
    var st = etapas[j];
    var etapaNome = String(st.etapa || '').trim();
    var prof = String(st.profissional || '').trim();
    if (!etapaNome || !prof) {
      throw new Error('Cada etapa exige etapa e profissional');
    }
    var regra = findRegraMega_(pacote, etapaNome);
    appendAtendimentoLinha_(sh, {
      idAt: idAt,
      dataStr: dataStr,
      clienteId: clienteId,
      nomeCliente: nomeCliente,
      tipo: 'Pacote',
      pacote: pacote,
      etapa: etapaNome,
      produto: '',
      servicos: '',
      tamanho: '',
      profissional: prof,
      valor: 0,
      comissao: regra.comissao,
      descricao: obs
    });
  }
  return {
    id: idAt,
    linhas: 1 + etapas.length,
    data: dataStr,
    cliente_id: clienteId,
    nomeCliente: nomeCliente
  };
}

function createAtendimentoProduto_(p) {
  var clienteId = String(p.cliente_id || '').trim();
  var dataStr = String(p.data || '').trim();
  var nomeProd = String(p.produto || '').trim();
  var profissional = requireProfissional_(p);
  if (!clienteId || !dataStr || !nomeProd) {
    throw new Error('cliente_id, data e produto são obrigatórios para Produto');
  }
  var q = parseFloat(String(p.quantidade));
  if (isNaN(q) || q <= 0) {
    throw new Error('quantidade deve ser um número maior que zero');
  }
  var precoUnit = findProdutoPreco_(nomeProd);
  if (precoUnit === null || precoUnit === '') {
    throw new Error('Produto não encontrado na aba Produtos: "' + nomeProd + '"');
  }
  var valorTotal = Number(precoUnit) * q;
  var nomeCliente = findClienteNome_(clienteId);
  var idAt = makeIdAtendimento_(dataStr, clienteId);
  var sh = sheet_(SHEETS.ATENDIMENTOS);
  var obsParts = [];
  var baseObs = String(p.observacao || '').trim();
  if (baseObs) obsParts.push(baseObs);
  obsParts.push('Qtd: ' + String(q).replace('.', ','));
  var obs = obsParts.join(' — ');
  appendAtendimentoLinha_(sh, {
    idAt: idAt,
    dataStr: dataStr,
    clienteId: clienteId,
    nomeCliente: nomeCliente,
    tipo: 'Produto',
    pacote: '',
    etapa: '',
    produto: nomeProd,
    servicos: '',
    tamanho: '',
    profissional: profissional,
    valor: valorTotal,
    comissao: '',
    descricao: obs
  });
  return {
    id: idAt,
    linhas: 1,
    data: dataStr,
    cliente_id: clienteId,
    nomeCliente: nomeCliente
  };
}

function createAtendimentoCabelo_(p) {
  var clienteId = String(p.cliente_id || '').trim();
  var dataStr = String(p.data || '').trim();
  var profissional = requireProfissional_(p);
  if (!clienteId || !dataStr) {
    throw new Error('cliente_id e data são obrigatórios para Cabelo');
  }
  var valorNum = parseFloat(String(p.valor).replace(',', '.'));
  if (isNaN(valorNum)) {
    throw new Error('valor é obrigatório e deve ser numérico para Cabelo');
  }
  var nomeCliente = findClienteNome_(clienteId);
  var idAt = makeIdAtendimento_(dataStr, clienteId);
  var sh = sheet_(SHEETS.ATENDIMENTOS);
  var det = String(p.detalhes_cabelo || p.cabelo_detalhes || '').trim();
  var baseObs = String(p.observacao || '').trim();
  var obsParts = [];
  if (det) obsParts.push(det);
  if (baseObs) obsParts.push(baseObs);
  var obs = obsParts.join(' — ');
  appendAtendimentoLinha_(sh, {
    idAt: idAt,
    dataStr: dataStr,
    clienteId: clienteId,
    nomeCliente: nomeCliente,
    tipo: 'Cabelo',
    pacote: '',
    etapa: '',
    produto: '',
    servicos: '',
    tamanho: '',
    profissional: profissional,
    valor: valorNum,
    comissao: '',
    descricao: obs
  });
  return {
    id: idAt,
    linhas: 1,
    data: dataStr,
    cliente_id: clienteId,
    nomeCliente: nomeCliente
  };
}
