/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
const math = require('mathjs');

function lowerCaseAllKey(data) {
  const newData = {};
  for (const key in data) {
    newData[key.toLowerCase()] = data[key];
  }

  return newData;
}
async function prepareCondicaopgto(newDados, mysql, dispositivo) {
  newDados = lowerCaseAllKey(newDados);
  newDados.idcondicaopagamento = newDados.idcondpag;
  newDados.percacrescimo = !newDados.acrescimos ? '0' : newDados.acrescimos;
  newDados.percdescontos = !newDados.descontos ? '0' : newDados.descontos;
  newDados.percmaxdescontos = !newDados.per_max_desconto
    ? '0'
    : newDados.per_max_desconto;
  newDados.geratitulo = newDados.geratit === 'S';
  return newDados;
}

async function prepareFormapgto(newDados, mysql, dispositivo) {
  newDados = lowerCaseAllKey(newDados);
  newDados.idformapagamento = newDados.idformapgto;
  switch (newDados.tipo) {
    case 0:
      newDados.tipoformapagamento = 'dinheiro';
      break;
    case 1:
      newDados.tipoformapagamento = 'cheque com consulta';
      break;
    case 2:
      newDados.tipoformapagamento = 'cartão de crédito';
      break;
    case 3:
      newDados.tipoformapagamento = 'contra vale';
      break;
    case 4:
      newDados.tipoformapagamento = 'cheque';
      break;
    case 5:
      newDados.tipoformapagamento = 'depósito bancário';
      break;
    case 6:
      newDados.tipoformapagamento = 'boleto bancário';
      break;
    case 7:
      newDados.tipoformapgamento = 'nota promissória';
      break;
    default:
      newDados.tipoformapagamento = 'dinheiro';
      break;
  }
  return newDados;
}

async function prepareCidade(objeto) {
  objeto = lowerCaseAllKey(objeto);
  objeto.cidade = objeto.descricao;
  return objeto;
}

async function prepareDefault(objeto, mysql, dispositivo) {
  objeto = lowerCaseAllKey(objeto);
  return objeto;
}

function clearNull(newDados) {
  for (const key in newDados) {
    if (newDados[key] == null) {
      newDados[key] = '0';
    }
  }
  return newDados;
}
async function preparePessoa(newDados, mysql, dispositivo) {
  newDados = lowerCaseAllKey(newDados);

  const buscaEmpresa = await mysql.queryOne(
    `SELECT * FROM empresa WHERE id = ? LIMIT 1`,
    [dispositivo.empresa_id]
  );

  let buscaDadosEmpresa = await mysql.queryOne(
    `SELECT dados->"$.VENDEDORES" AS padraoVendedores, dados->"$.CLIENTES" AS padraoClientes,
      dados->"$.PRODUTOS" AS padraoProdutos
    FROM replicacao WHERE empresa_id = ? AND tabela = ?
    AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(dados->"$.CNPJCPF", '.', ''), '-', ''), '/', ''), ' ', ''), '"', '') = ?
    ORDER BY DATA_OPERACAO DESC
    LIMIT 1`,
    [dispositivo.empresa_id, 'EMPRESAS', buscaEmpresa.cnpj]
  );

  if (buscaDadosEmpresa === null) {
    buscaDadosEmpresa = {
      padraoVendedores: newDados.idempresa,
      padraoClientes: newDados.idempresa,
      padraoProdutos: newDados.idempresa,
    };
  }

  let cidadeResult = await mysql.queryOne(
    `SELECT * FROM replicacao WHERE empresa_id = ? AND tabela = ? AND dados->"$.IDCIDADE" = ?`,
    [dispositivo.empresa_id, 'CIDADES', newDados.pri_cidade]
  );
  if (cidadeResult != null && cidadeResult.dados) {
    cidadeResult = lowerCaseAllKey(JSON.parse(cidadeResult.dados));
  }

  let paisResult = await mysql.queryOne(
    `SELECT * FROM replicacao WHERE empresa_id = ? AND tabela = ? AND dados->"$.IDPAIS" = ?`,
    [dispositivo.empresa_id, 'PAISES', newDados.idpais]
  );
  if (paisResult != null && paisResult.dados) {
    paisResult = lowerCaseAllKey(JSON.parse(paisResult.dados));
  }

  let obsPessoasResult = await mysql.queryOne(
    `SELECT * FROM replicacao WHERE empresa_id = ? AND tabela = ? AND dados->"$.IDPESSOA" = ? AND dados->"$.IDEMPRESA" = ? AND dados->"$.IDTIPO_PS" = ?`,
    [
      dispositivo.empresa_id,
      'OBSPESSOAS',
      newDados.idpessoa,
      buscaDadosEmpresa.padraoClientes,
      newDados.idtipo_ps,
    ]
  );
  if (obsPessoasResult != null) {
    obsPessoasResult = lowerCaseAllKey(JSON.parse(obsPessoasResult.dados));
  }

  const endereco = {
    logradouro: newDados.pri_endereco,
    complemento: newDados.pri_complemento,
    cep: newDados.pri_cep,
    bairro: newDados.pri_bairro,
    numero: newDados.numeroender !== '' ? newDados.numeroender : 'S/N',
    pais: paisResult ? paisResult.descricao : '',
    cidade: {
      idcidade: cidadeResult ? parseInt(cidadeResult.idcidade, 10) : 0,
      cidade: cidadeResult ? cidadeResult.descricao : '',
      uf: cidadeResult ? cidadeResult.uf : '',
    },
  };

  const padroes = {
    condpgto: newDados.condpag,
    formapgto: newDados.formapag,
    precopadraovenda: newDados.precovendapadrao,
    percdesconto: newDados.perdescvenda,
    percmaxdesconto: newDados.desc_maximo,
  };

  newDados.fone = [];

  for (let i = 1; i <= 4; i += 1) {
    if (newDados[`fone${i}`]) {
      newDados.fone.push(newDados[`fone${i}`]);
    }
  }

  newDados.email =
    typeof newDados.email === 'string' ? newDados.email.split(';') : [];

  if (newDados.tipo_fj) {
    newDados.tipopessoa =
      newDados.tipo_fj.substr(0, 1).toLowerCase() === 'f' ? 'f' : 'j';
  }
  newDados.endereco = endereco;
  newDados.padroes = padroes;
  if (obsPessoasResult) {
    if (typeof obsPessoasResult.OBS === 'string') {
      newDados.observacoes = obsPessoasResult.OBS;
    } else {
      newDados.observacoes = '';
    }
  } else {
    newDados.observacoes = '';
  }

  if (newDados.datacadastro) {
    newDados.dtcadastro = new Date(newDados.datacadastro).toISOString();
  }
  if (newDados.dtnascimento) {
    newDados.datanascimento = newDados.dtnascimento;
  }
  if (newDados.datanascimento) {
    newDados.datanascimento = new Date(newDados.datanascimento).toISOString();
  } else {
    newDados.datanascimento = null;
  }

  newDados.inscricaoestadual = newDados.inscr_est;

  if (newDados.situacao) {
    newDados.habilitado = newDados.situacao.toLowerCase() === 'a' ? 1 : 0;
  }
  newDados.senha = newDados.senhamobile;
  if (!('hashreplic' in newDados)) {
    newDados.hashreplic = '';
  }

  newDados.statusreplic = newDados.status;

  newDados = lowerCaseAllKey(newDados);

  return newDados;
}

async function preparePedido(newDados, mysql, dispositivo) {
  newDados = lowerCaseAllKey(newDados);

  const buscaEmpresa = await mysql.queryOne(
    `SELECT * FROM empresa WHERE id = ? LIMIT 1`,
    [dispositivo.empresa_id]
  );

  let buscaDadosEmpresa = await mysql.queryOne(
    `SELECT dados->"$.VENDEDORES" AS padraoVendedores, dados->"$.CLIENTES" AS padraoClientes,
      dados->"$.PRODUTOS" AS padraoProdutos
    FROM replicacao WHERE empresa_id = ? AND tabela = ?
    AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(dados->"$.CNPJCPF", '.', ''), '-', ''), '/', ''), ' ', ''), '"', '') = ?
    ORDER BY DATA_OPERACAO DESC
    LIMIT 1`,
    [dispositivo.empresa_id, 'EMPRESAS', buscaEmpresa.cnpj]
  );

  if (buscaDadosEmpresa === null) {
    buscaDadosEmpresa = {
      padraoVendedores: newDados.idempresa,
      padraoClientes: newDados.idempresa,
      padraoProdutos: newDados.idempresa,
    };
  }

  if (newDados.iddoc) {
    newDados.numero = newDados.iddoc;
  }

  let pessoa = await mysql.queryOne(
    `
        SELECT * FROM replicacao
        WHERE empresa_id = ? AND tabela = ? AND dados->"$.IDEMPRESA" = ? AND dados->"$.IDPESSOA" = ?`,
    [
      dispositivo.empresa_id,
      'PESSOAS',
      parseInt(buscaDadosEmpresa.padraoClientes, 10),
      math.hasNumericValue(newDados.idcliente)
        ? parseInt(newDados.idcliente, 10)
        : newDados.idcliente,
    ]
  );
  if (pessoa !== null) {
    pessoa = JSON.parse(pessoa.dados);
    pessoa = await preparePessoa(pessoa, mysql, dispositivo);
  }
  newDados.cliente = pessoa;

  let condipgto = await mysql.queryOne(
    `
        SELECT * FROM replicacao
        WHERE empresa_id = ? AND tabela = ? AND dados->"$.IDCONDPAG" = ?`,
    [dispositivo.empresa_id, 'CONDPAG', newDados.idcondicaopgto]
  );
  if (condipgto !== null) {
    condipgto = JSON.parse(condipgto.dados);
    condipgto = await prepareCondicaopgto(condipgto, mysql, dispositivo);
  }
  newDados.condicaopgto = condipgto;

  let formapgto = await mysql.queryOne(
    `
        SELECT * FROM replicacao
        WHERE empresa_id = ? AND tabela = ? AND dados->"$.IDFORMAPGTO" = ?`,
    [dispositivo.empresa_id, 'FORMAPGTO', newDados.idformapgto]
  );
  if (formapgto !== null) {
    formapgto = JSON.parse(formapgto.dados);
    formapgto = await prepareFormapgto(formapgto, mysql, dispositivo);
  }
  newDados.formapgto = formapgto;

  let vendedor = await mysql.queryOne(
    `
        SELECT * FROM replicacao
        WHERE empresa_id = ? AND tabela = ? AND dados->"$.IDEMPRESA" = ? AND dados->"$.IDPESSOA" = ?`,
    [
      dispositivo.empresa_id,
      'PESSOAS',
      parseInt(buscaDadosEmpresa.padraoVendedores, 10),
      math.hasNumericValue(newDados.idvendedor)
        ? parseInt(newDados.idvendedor, 10)
        : newDados.idvendedor,
    ]
  );
  if (vendedor !== null) {
    vendedor = JSON.parse(vendedor.dados);
    vendedor = await preparePessoa(vendedor, mysql, dispositivo);
  }
  newDados.vendedor = vendedor;

  newDados.valortotal = newDados.vlrtotal;
  if (newDados.vlrsubtotal) {
    newDados.valorsubtotal = newDados.vlrsubtotal;
  }
  if (newDados.vlracrescimo) {
    newDados.valoracrescimo = newDados.vlracrescimo;
  } else {
    newDados.valoracrescimo = 0;
  }
  if (newDados.vlrdesconto) {
    newDados.valordesconto = newDados.vlrdesconto;
  } else {
    newDados.valordesconto = 0;
  }
  if (newDados.dtemissao) {
    newDados.datapedido = newDados.dtemissao;
  }

  newDados.status = newDados.statuspedido;
  let newStatus = 'DESCONHECIDO';
  switch (newDados.statuspedido) {
    case 0:
      newStatus = 'AGUARDANDOREPLICACAO';
      break;
    case 1:
      newStatus = 'AGUARDANDOAPROVACAO';
      break;
    case 2:
      newStatus = 'APROVADO';
      break;
    case 3:
      newStatus = 'APROVADORESTRICOES';
      break;
    case 4:
      newStatus = 'REPROVADO';
      break;
    case 5:
      newStatus = 'AGUARDANDOCONFIRMACAOWINDEL';
      break;
    default:
      newStatus = 'AGUARDANDOREPLICACAO';
      break;
  }
  newDados.status = newStatus;

  const produtos = await mysql.query(
    `
        SELECT * FROM replicacao
        WHERE empresa_id = ? AND tabela = ? AND dados->"$.IDEMPRESAPRODUTO" = ? AND dados->"$.IDPEDIDO" = ?`,
    [
      dispositivo.empresa_id,
      'MOBILE_PEDIDO_PRODUTOS',
      parseInt(buscaDadosEmpresa.padraoProdutos, 10),
      newDados.idpedido,
    ]
  );

  const produtosPedido = [];
  for (let i = 0; i < produtos.length; i += 1) {
    const produto = lowerCaseAllKey(JSON.parse(produtos[i].dados));
    produto.valorvenda = produto.valorunitario;
    produto.idempresa = produto.idempresapedido;
    produtosPedido.push(produto);
  }

  newDados.produtos = produtosPedido;

  return newDados;
}

async function prepareProduto(newDados, mysql, dispositivo) {
  newDados = lowerCaseAllKey(newDados);

  newDados.unidademedida = newDados.un;
  newDados.codbarras = newDados.barras;
  if (newDados.foradelinha) {
    newDados.foradelinha = newDados.foradelinha.toLowerCase() === 's';
  } else {
    newDados.foradelinha = false;
  }
  const tmpValores = [];
  tmpValores.push(newDados.vlr_venda);
  for (let i = 1; i < 5; i += 1) {
    if (newDados[`vlr${i}`] !== '') {
      tmpValores.push(newDados[`vlr${i}`]);
    }
  }
  newDados.vlrvenda = tmpValores;
  newDados.estoque = newDados.est_atual;
  if (!newDados.estoque) {
    newDados.estoque = '0';
  }

  newDados = clearNull(newDados);

  return newDados;
}

module.exports = {
  pessoa: preparePessoa,
  vendedor: preparePessoa,
  cliente: preparePessoa,
  pedido: preparePedido,
  produto: prepareProduto,
  condicaopgto: prepareCondicaopgto,
  formapgto: prepareFormapgto,
  cidades: prepareCidade,
  prepareCidade,
  prepareDefault,
};
