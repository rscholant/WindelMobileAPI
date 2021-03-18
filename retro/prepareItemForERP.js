function upperCaseAllKey(data) {
  const newData = {};
  for (const key in data) {
    if ({}.hasOwnProperty.call(data, key)) {
      newData[key.toUpperCase()] = data[key];
    }
  }

  return newData;
}
function convertClienteSexoToSexoERP(sexo) {
  switch (sexo.toLowerCase()) {
    case 'masculino':
      return 0;
    case 'm':
      return 1;
    case 'feminino':
      return 2;
    case 'f':
      return 3;
    default:
      return 0;
  }
}

function convertPedidoStatusToStatusERP(status) {
  switch (status) {
    case 'AGUARDANDOREPLICACAO':
      return 0;
    case 'AGUARDANDOAPROVACAO':
      return 1;
    case 'APROVADO':
      return 2;
    case 'APROVADORESTRICOES':
      return 3;
    case 'REPROVADO':
      return 4;
    case 'CRIACAO':
      return 5;
    case 'AGUARDANDOCONFIRMACAOWINDEL':
      return 6;
    default:
      return 99;
  }
}
async function prepareMobileCliente(newDados) {
  newDados = upperCaseAllKey(newDados);

  const colunas = [
    'IDPESSOA',
    'IDEMPRESA',
    'TIPOCADASTRO',
    'TIPOPESSOA',
    'CPFCNPJ',
    'NOME',
    'RAZAOSOCIAL',
    'SEXO',
    'RG',
    'DATANASCIMENTO',
    'EMAIL',
    'FONE',
    'DTCADASTRO',
    'MAC',
    'STATUS',
    'HASHREPLIC',
    'DATAPROC',
    'OBSERVACOES',
    'INFOREPROVADO',
    'SINC_UUID',
    'VENDEDOR',
  ];

  const filteredDados = {};
  for (const coluna of colunas) {
    filteredDados[coluna] = newDados[coluna];
  }

  if (typeof filteredDados.SEXO === 'string') {
    filteredDados.SEXO = convertClienteSexoToSexoERP(filteredDados.SEXO);
  }

  if (newDados.DTNASCIMENTO) {
    filteredDados.DATANASCIMENTO = newDados.DTNASCIMENTO;
  }

  filteredDados.CPFCNPJ = filteredDados.CPFCNPJ.split(/[^0-9]/).join('');

  filteredDados.TIPOCADASTRO = 1;

  filteredDados.TIPOPESSOA = newDados.TIPOPESSOA === 'FISICA' ? 0 : 1;

  if (typeof filteredDados.EMAIL !== 'string') {
    filteredDados.EMAIL = filteredDados.EMAIL.join(';'); // filteredDados.EMAIL[0];
  }

  if (typeof filteredDados.FONE !== 'string') {
    filteredDados.FONE = filteredDados.FONE.join(';');
  }

  if (newDados.INSCRICAOESTADUAL) {
    filteredDados.INSCR_EST = newDados.INSCRICAOESTADUAL;
  }

  if (newDados.STATUSREPLIC) {
    filteredDados.STATUS = newDados.STATUSREPLIC;
  }

  return filteredDados;
}

async function prepareMobilePedido(pedido) {
  const pedidoERP = {};

  pedidoERP.IDPEDIDO = pedido.idpedido;
  pedidoERP.IDEMPRESA = pedido.idempresa;
  pedidoERP.MAC = pedido.mac;
  pedidoERP.VLRTOTAL = pedido.valortotal;
  pedidoERP.VLRDESCONTO = pedido.valordesconto;
  pedidoERP.VLRACRESCIMO = pedido.valoracrescimo;
  pedidoERP.STATUSPEDIDO = convertPedidoStatusToStatusERP(pedido.status);
  pedidoERP.DATAPEDIDO = pedido.datapedido;
  pedidoERP.CLIENTEEMAIL = pedido.clienteemail;
  pedidoERP.CLIENTEFONE = pedido.clientefone;
  pedidoERP.IDCLIENTE = pedido.cliente.idpessoa;
  pedidoERP.IDEMPRESACLIENTE = pedido.cliente.idempresa;
  pedidoERP.IDCONDICAOPGTO = pedido.condicaopgto.idcondicaopagamento;
  pedidoERP.IDVENDEDOR = pedido.vendedor.idpessoa;
  pedidoERP.IDEMPRESAVENDEDOR = pedido.vendedor.idempresa;
  pedidoERP.IDUSUARIO = null;
  pedidoERP.IDEMPRESAUSUARIO = null;
  pedidoERP.DATAPROC = null;
  pedidoERP.IDFORMAPGTO = pedido.formapgto.idformapagamento;
  pedidoERP.VLRFORMAPGTO = null;
  pedidoERP.IDDOC = null;
  pedidoERP.HASHPESSOAREPLIC = pedido.cliente.hashreplic;
  pedidoERP.INFOREPROVADO = null;
  pedidoERP.OBS = pedido.obs;
  pedidoERP.OBS_NOTA = pedido.obs_nota;
  pedidoERP.VLRSUBTOTAL = pedido.valorsubtotal;
  pedidoERP.SINC_UUID = null;
  pedidoERP.DTENTREGA = pedido.dtEntrega;

  if (pedido.serie) {
    pedidoERP.SERIE = pedido.serie;
  } else {
    pedidoERP.SERIE = 'MOB';
  }

  return pedidoERP;
}

async function prepareMobilePedidoProdutos(pedido) {
  const produtos = [];

  for (let i = 0; i < pedido.produtos.length; i += 1) {
    const produto = {
      IDPRODUTO: pedido.produtos[i].idproduto,
      IDEMPRESAPRODUTO: pedido.produtos[i].idempresa,
      IDPEDIDO: pedido.idpedido,
      IDEMPRESAPEDIDO: pedido.idempresa,
      VALORUNITARIO: pedido.produtos[i].valorvenda,
      QUANTIDADE: pedido.produtos[i].quantidade,
      SEQUENCIA: pedido.produtos[i].sequencia,
      MACPEDIDO: pedido.mac,
      VALORDESCONTO: pedido.produtos[i].valordesconto,
    };
    produtos.push(produto);
  }

  return produtos;
}

module.exports = {
  mobile_cliente: prepareMobileCliente,
  mobile_pedido: prepareMobilePedido,
  mobile_pedido_produtos: prepareMobilePedidoProdutos,
};
