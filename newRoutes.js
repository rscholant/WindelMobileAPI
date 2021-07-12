/* eslint-disable no-restricted-syntax */
/* eslint-disable consistent-return */
/* eslint-disable no-useless-return */
const crypto = require('crypto');
const Sequelize = require('sequelize');

const { Op } = require('sequelize');
const {
  empresa,
  dispositivo,
  replicacao,
  version_control,
} = require('./migrations/models');
const prepareItemForMobile = require('./retro/prepareItemForMobile');

module.exports = (expressApp, jsonParser) => {
  expressApp.post('/device/requestNew', jsonParser, async (req, res) => {
    const { uuid, cnpj, name } = req.body;
    if (!uuid || !cnpj || !name) {
      res.send({
        result: false,
        control: {
          erro: true,
          mensagem: 'Dados não informados.',
        },
      });
      return;
    }
    const mask = /(\w{2})(\w{3})(\w{3})(\w{4})(\w{2})/;
    const buscaEmpresa = await empresa.findOne({
      where: { cnpj: { [Op.like]: cnpj.replace(mask, '$1%$2%$3%$4%$5') } },
    });
    if (buscaEmpresa && buscaEmpresa.length > 0) {
      res.send({
        result: false,
        control: {
          erro: true,
          mensagem: 'Empresa não encontrada!',
        },
      });
      return;
    }
    const devices = await dispositivo.findOne({
      where: {
        mac_address: uuid.toLowerCase(),
      },
    });

    if (devices && devices.length > 0) {
      res.send({
        result: false,
        control: {
          erro: false,
          mensagem: 'Dispositivo já cadastrado, esperando por liberação!',
        },
      });
      return;
    }
    const auth = crypto.createHash('md5').update(uuid).digest('hex');

    await dispositivo.create({
      empresa_id: buscaEmpresa.id,
      auth,
      nome: name,
      mac_address: uuid,
    });

    res.send({
      result: true,
      control: {
        erro: false,
        mensagem: 'Solicitação enviada!',
      },
    });
    return;
  });
  expressApp.get('/device/info', jsonParser, async (req, res) => {
    const { uuid, version } = req.query;
    if (!uuid) {
      res.send({
        result: false,
        control: {
          erro: true,
          mensagem: 'MAC Address não informado',
        },
      });
      return;
    }
    const devices = await dispositivo.findOne({
      where: {
        mac_address: uuid.toLowerCase(),
      },
    });

    if (devices === null) {
      res.send({
        result: false,
        control: {
          erro: true,
          deviceFound: false,
          mensagem: 'Device not found!',
        },
      });
      return;
    }
    if (
      !devices.empresas_licenciadas ||
      devices.empresas_licenciadas.length === 0
    ) {
      res.send({
        result: false,
        control: {
          erro: true,
          deviceFound: true,
          mensagem: 'Dispositivo bloqueado!',
        },
      });
      return;
    }
    const buscaEmpresas = await empresa.findAll({
      where: { id: { [Op.in]: devices.empresas_licenciadas.id } },
    });

    if (version && parseInt(version, 10) !== devices.app_version) {
      await dispositivo.update(
        {
          app_version: version,
        },
        {
          where: {
            auth: devices.auth,
          },
        }
      );
    }

    if (version) {
      const versions = await version_control.findOne({
        where: {
          version: {
            [Op.gt]: parseInt(version, 10),
          },
        },
        order: [['version', 'DESC']],
      });

      if (versions && versions.validity <= new Date()) {
        res.send({
          result: false,
          control: { erro: true, mensagem: versions.message },
        });
        return;
      }
    }
    const promises = await buscaEmpresas.map(async (dadoEmpresa) => {
      const mask = /(\w{2})(\w{3})(\w{3})(\w{4})(\w{2})/;
      const cnpjEmpresa = String(dadoEmpresa.cnpj);
      const { dados } = await replicacao.findOne({
        where: {
          empresa_id: { [Op.in]: devices.empresas_licenciadas.id },
          tabela: 'EMPRESAS',
          dados: {
            CNPJCPF: {
              [Op.like]: cnpjEmpresa.replace(mask, '$1%$2%$3%$4%$5'),
            },
          },
        },
      });
      let result;
      if (dados) {
        result = {
          idEmpresa: dados.IDEMPRESA,
          nome: dados.NOME,
          endereco: dados.ENDERECO,
          bairro: dados.BAIRRO,
          cidade: dados.CIDADE,
          CNPJCPF: dados.CNPJCPF,
          fone: dados.FONE,
          nroEndereco: dados.NROENDER,
          padraoClientes: dados.CLIENTES,
          padraoVendedores: dados.VENDEDORES,
          padraoProdutos: dados.PRODUTOS,
          percMaxDesconto: dados.DESCMAX,
          padraoDescCondPgto: true,
        };
      }
      return result || null;
    });
    let dadosEmpresa;
    await Promise.all(promises).then((results) => {
      dadosEmpresa = results;
    });
    res.send({
      ID: devices.id,
      descricao: devices.nome,
      habilitado: true,
      empresas: dadosEmpresa,
    });
    return;
  });

  expressApp.get('/pacotesincronizacao', jsonParser, async (req, res) => {
    const { cnpj, uuid } = req.headers;
    if (!uuid) {
      res.send({
        result: false,
        control: {
          erro: true,
          mensagem: 'Dispositivo não encontrado!',
        },
      });
      return;
    }
    const mask = /\D/g;

    const dadosEmpresa = await empresa.findOne({
      where: { cnpj: cnpj.replace(mask, '') },
    });
    const dispositivos = await dispositivo.findOne({
      where: { mac_address: uuid },
    });

    if (dispositivos == null) {
      res.send({
        result: false,
        control: {
          erro: true,
          mensagem: 'Dispositivo bloqueado!',
        },
      });
      return;
    }

    const { tabela } = req.query;
    const { data } = req.query;

    let tabelaConsulta = '';
    let extraConditions = {};
    switch (tabela) {
      case 'vendedor':
        tabelaConsulta = 'PESSOAS';
        extraConditions = {
          dados: {
            IDTIPO_PS: 5,
          },
        };
        break;
      case 'cliente':
        tabelaConsulta = 'PESSOAS';
        extraConditions = {
          dados: {
            IDTIPO_PS: 1,
          },
        };
        break;
      case 'formapgto':
        tabelaConsulta = 'FORMAPGTO';
        break;
      case 'condicaopgto':
        tabelaConsulta = 'CONDPAG';
        break;
      case 'pedido':
        tabelaConsulta = 'MOBILE_PEDIDO';
        break;
      case 'produto':
        tabelaConsulta = 'PRODUTOS';
        break;
      case 'parametro':
        tabelaConsulta = 'PARAMETROS';
        break;
      default:
        tabelaConsulta = tabela.toUpperCase();
        break;
    }

    const linhasBanco = await replicacao.findAll({
      limit: 200,
      where: {
        empresa_id: dadosEmpresa.id,
        tabela: tabelaConsulta,
        data_operacao: {
          [Op.gt]: data,
        },
        [Op.or]: {
          situacao: 2,
          dados: {
            [Op.not]: null,
          },
        },
        ...extraConditions,
      },
      order: [['data_operacao', 'ASC']],
    });

    const promises = [];
    const objetos = [];

    Object.keys(linhasBanco).forEach((key) => {
      if ({}.hasOwnProperty.call(linhasBanco, key)) {
        const { dados } = linhasBanco[key];
        const newDados = {};
        if (dados) {
          Object.keys(dados).forEach((dadoKey) => {
            if ({}.hasOwnProperty.call(dados, dadoKey)) {
              newDados[dadoKey.toLowerCase()] = dados[dadoKey];
            }
          });
        }
        const objeto = {};
        objeto.operacao = `${linhasBanco[key].situacao}`;
        objeto.data = linhasBanco[key].data_operacao;

        if (tabela in prepareItemForMobile) {
          promises.push(
            prepareItemForMobile[tabela](newDados, dispositivos).then(
              (results) => {
                objeto.registro = results;
              }
            )
          );
        } else {
          promises.push(
            prepareItemForMobile
              .prepareDefault(newDados, dispositivos)
              .then((results) => {
                objeto.registro = results;
              })
          );
        }
        objetos.push(objeto);
      }
    });
    await Promise.all(promises);
    const count = await replicacao.count({
      where: {
        empresa_id: dadosEmpresa.id,
        tabela: tabelaConsulta,
        data_operacao: {
          [Op.gt]: data,
        },
        [Op.or]: {
          situacao: 2,
          dados: {
            [Op.not]: null,
          },
        },
        ...extraConditions,
      },
    });
    res.send({
      result: objetos,
      count,
      control: {
        erro: false,
        mensagem: '',
      },
    });
  });

  expressApp.post('/checkUpdates', jsonParser, async (req, res) => {
    const { cnpj, uuid } = req.headers;

    if (!uuid) {
      res.send({
        result: false,
        control: {
          erro: true,
          mensagem: 'Dispositivo não encontrado!',
        },
      });
      return;
    }
    const mask = /\D/g;

    const dadosEmpresa = await empresa.findOne({
      where: { cnpj: cnpj.replace(mask, '') },
    });
    const dispositivos = await dispositivo.findOne({
      where: { mac_address: uuid },
    });

    if (
      dispositivos === null ||
      !dispositivos.empresas_licenciadas ||
      dispositivos.empresas_licenciadas.length === 0
    ) {
      res.send({
        result: false,
        control: {
          erro: true,
          mensagem: 'Dispositivo bloqueado!',
        },
      });
      return;
    }

    let whereClause = ``;
    const dados = { ...req.body };
    for (const [table, since] of Object.entries(dados)) {
      if (table.includes('esp')) {
        // eslint-disable-next-line no-continue
        continue;
      }
      let whereTable = '';
      switch (table) {
        case 'pessoa':
          whereTable = 'PESSOAS';
          break;
        case 'formapgto':
          whereTable = 'FORMAPGTO';
          break;
        case 'condicaopgto':
          whereTable = 'CONDPAG';
          break;
        case 'pedido':
          whereTable = 'MOBILE_PEDIDO';
          break;
        case 'produto':
          whereTable = 'PRODUTOS';
          break;
        case 'parametro':
          whereTable = 'PARAMETROS';
          break;
        default:
          whereTable = table.toUpperCase();
          break;
      }

      if (whereClause === '') {
        whereClause += `(
          (tabela = '${whereTable}'
            and data_operacao > ${since} )`;
      } else {
        whereClause += `
        OR (tabela = '${whereTable}'
          and data_operacao > ${since} )`;
      }
    }
    whereClause = `empresa_id = ${dadosEmpresa.id}
      AND ultimo_autor != '${dispositivos.auth}'
      AND ${whereClause})
      AND (dados is not null or situacao != 1) `;

    const result = await replicacao.findAll({
      attributes: ['tabela'],
      where: Sequelize.literal(whereClause),
      group: 'tabela',
    });

    const resultado = result.map((item) => {
      switch (item.tabela) {
        case 'PESSOAS':
          return 'PESSOA';
        case 'FORMAPGTO':
          return 'FORMAPGTO';
        case 'CONDPAG':
          return 'CONDICAOPGTO';
        case 'MOBILE_PEDIDO':
          return 'PEDIDO';
        case 'PRODUTOS':
          return 'PRODUTO';
        default:
          return item.tabela.toUpperCase();
      }
    });
    res.send({ result: result.length > 0, tabelas: resultado });
  });
};
