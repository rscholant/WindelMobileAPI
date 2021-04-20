/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
const math = require('mathjs');
const Sequelize = require('sequelize');
const { Op } = require('sequelize');
const {
  empresa,
  dispositivo,
  replicacao,
  id_control,
} = require('../migrations/models');

function lowerCaseAllKey(data) {
  const newData = {};
  for (const key in data) {
    newData[key.toLowerCase()] = data[key];
  }

  return newData;
}
async function prepareCondicaopgto(newDados, _dispositivos) {
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

async function prepareFormapgto(newDados, _dispositivos) {
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

async function prepareDefault(objeto, _dispositivos) {
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
async function preparePessoa(newDados, dispositivos) {
  newDados = lowerCaseAllKey(newDados);
  const buscaEmpresa = await empresa.findOne({
    where: {
      id: dispositivos.empresa_id,
    },
  });

  const mask = /(\w{2})(\w{3})(\w{3})(\w{4})(\w{2})/;
  const cnpjEmpresa = String(buscaEmpresa.cnpj);

  let buscaDadosEmpresa = await replicacao.findOne({
    attributes: [
      [Sequelize.json('dados.VENDEDORES'), 'padraoVendedores'],
      [Sequelize.json('dados.CLIENTES'), 'padraoClientes'],
      [Sequelize.json('dados.PRODUTOS'), 'padraoProdutos'],
    ],
    where: {
      empresa_id: dispositivos.empresa_id,
      tabela: 'EMPRESAS',
      dados: {
        CNPJCPF: { [Op.like]: cnpjEmpresa.replace(mask, '$1%$2%$3%$4%$5') },
      },
    },
    order: [['data_operacao', 'DESC']],
  });

  if (buscaDadosEmpresa === null) {
    buscaDadosEmpresa = {
      padraoVendedores: newDados.idempresa,
      padraoClientes: newDados.idempresa,
      padraoProdutos: newDados.idempresa,
    };
  } else {
    buscaDadosEmpresa = buscaDadosEmpresa.dataValues;
  }
  let cidadeResult = await replicacao.findOne({
    where: {
      empresa_id: dispositivos.empresa_id,
      tabela: 'CIDADES',
      dados: {
        IDCIDADE: newDados.pri_cidade,
      },
    },
    order: [['data_operacao', 'DESC']],
  });

  if (cidadeResult != null && cidadeResult.dados) {
    cidadeResult = lowerCaseAllKey(cidadeResult.dados);
  }

  let paisResult = await replicacao.findOne({
    where: {
      empresa_id: dispositivos.empresa_id,
      tabela: 'PAISES',
      dados: {
        IDPAIS: newDados.idpais,
      },
    },
    order: [['data_operacao', 'DESC']],
  });

  if (paisResult != null && paisResult.dados) {
    paisResult = lowerCaseAllKey(paisResult.dados);
  }

  let obsPessoasResult = await replicacao.findAll({
    where: {
      empresa_id: dispositivos.empresa_id,
      tabela: 'OBSPESSOAS',
      dados: {
        IDPESSOA: newDados.idpessoa,
        IDEMPRESA: buscaDadosEmpresa.padraoClientes,
        IDTIPO_PS: newDados.idtipo_ps,
      },
    },
  });

  if (obsPessoasResult != null && obsPessoasResult.length > 0) {
    obsPessoasResult = lowerCaseAllKey(obsPessoasResult[0].dados);
  }

  const endereco = {
    logradouro: newDados.pri_endereco,
    complemento: newDados.pri_complemento,
    cep: newDados.pri_cep,
    bairro: newDados.pri_bairro,
    numero: newDados.numeroender !== '' ? newDados.numeroender : 'S/N',
    pais: paisResult && paisResult.length > 0 ? paisResult.descricao : 'Brasil',
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

async function preparePedido(newDados, dispositivos) {
  newDados = lowerCaseAllKey(newDados);

  const buscaEmpresa = await empresa.findAll({
    where: {
      id: dispositivos.empresa_id,
    },
  });

  const mask = /(\w{2})(\w{3})(\w{3})(\w{4})(\w{2})/;
  const cnpjEmpresa = String(buscaEmpresa[0].cnpj);

  let buscaDadosEmpresa = await replicacao.findAll({
    attributes: [
      [Sequelize.json('dados.VENDEDORES'), 'padraoVendedores'],
      [Sequelize.json('dados.CLIENTES'), 'padraoClientes'],
      [Sequelize.json('dados.PRODUTOS'), 'padraoProdutos'],
    ],
    where: {
      empresa_id: dispositivos.empresa_id,
      tabela: 'EMPRESAS',
      dados: {
        CNPJCPF: { [Op.like]: cnpjEmpresa.replace(mask, '$1%$2%$3%$4%$5') },
      },
    },
  });

  if (buscaDadosEmpresa === null || buscaDadosEmpresa.length === 0) {
    buscaDadosEmpresa = {
      padraoVendedores: newDados.idempresa,
      padraoClientes: newDados.idempresa,
      padraoProdutos: newDados.idempresa,
    };
  } else {
    buscaDadosEmpresa = buscaDadosEmpresa[0].dataValues;
  }

  if (newDados.iddoc) {
    newDados.numero = newDados.iddoc;
  }
  let pessoa = await replicacao.findAll({
    where: {
      empresa_id: dispositivos.empresa_id,
      tabela: 'PESSOAS',
      dados: {
        IDEMPRESA: parseInt(buscaDadosEmpresa.padraoClientes, 10),
        IDPESSOA: math.hasNumericValue(newDados.idcliente)
          ? parseInt(newDados.idcliente, 10)
          : newDados.idcliente,
      },
    },
  });
  if (pessoa !== null && pessoa.length > 0) {
    pessoa = pessoa[0].dados;
    pessoa = await preparePessoa(pessoa, dispositivos);
  }
  newDados.cliente = pessoa;
  let condipgto = await replicacao.findAll({
    where: {
      empresa_id: dispositivos.empresa_id,
      tabela: 'CONDPAG',
      dados: {
        IDCONDPAG: newDados.idcondicaopgto,
      },
    },
  });
  if (condipgto !== null && condipgto.length > 0) {
    condipgto = condipgto[0].dados;
    condipgto = await prepareCondicaopgto(condipgto, dispositivos);
  }
  newDados.condicaopgto = condipgto;

  let formapgto = await replicacao.findAll({
    where: {
      empresa_id: dispositivos.empresa_id,
      tabela: 'FORMAPGTO',
      dados: {
        IDFORMAPGTO: newDados.idformapgto,
      },
    },
  });

  if (formapgto !== null && formapgto.length > 0) {
    formapgto = formapgto[0].dados;
    formapgto = await prepareFormapgto(formapgto, dispositivos);
  }
  newDados.formapgto = formapgto;
  let vendedor = await replicacao.findAll({
    where: {
      empresa_id: dispositivos.empresa_id,
      tabela: 'PESSOAS',
      dados: {
        IDEMPRESA: parseInt(buscaDadosEmpresa.padraoClientes, 10),
        IDPESSOA: math.hasNumericValue(newDados.idvendedor)
          ? parseInt(newDados.idvendedor, 10)
          : newDados.idvendedor,
      },
    },
  });

  if (vendedor !== null && vendedor.length > 0) {
    vendedor = vendedor[0].dados;
    vendedor = await preparePessoa(vendedor, dispositivos);
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
  const produtos = await replicacao.findAll({
    where: {
      empresa_id: dispositivos.empresa_id,
      tabela: 'MOBILE_PEDIDO_PRODUTOS',
      dados: {
        IDEMPRESAPRODUTO: parseInt(buscaDadosEmpresa.padraoProdutos, 10),
        IDPEDIDO: newDados.idpedido,
      },
    },
  });

  const produtosPedido = [];
  for (let i = 0; i < produtos.length; i += 1) {
    const produto = lowerCaseAllKey(produtos[i].dados);
    produto.valorvenda = produto.valorunitario;
    produto.idempresa = produto.idempresapedido;
    produtosPedido.push(produto);
  }

  newDados.produtos = produtosPedido;

  return newDados;
}

async function prepareProduto(newDados, _dispositivos) {
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
