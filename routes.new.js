/* eslint-disable consistent-return */
/* eslint-disable no-useless-return */

const { Op } = require('sequelize');
const {
  empresa,
  dispositivo,
  replicacao,
  version_control,
} = require('./migrations/models');

module.exports = (expressApp, jsonParser) => {
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
          mensagem: 'Device not found!',
        },
      });
      return;
    }

    const buscaEmpresas = await empresa.find({
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

      const dadosEmpresa = buscaEmpresas.map(async (dadoEmpresa) => {
        const mask = /(\w{2})(\w{3})(\w{3})(\w{4})(\w{2})/;
        const cnpjEmpresa = String(dadoEmpresa.cnpj);
        const dados = await replicacao.findOne({
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
            idEmpresa: dados.replicacao.IDEMPRESA,
            nome: dados.replicacao.NOME,
            endereco: dados.replicacao.ENDERECO,
            bairro: dados.replicacao.BAIRRO,
            cidade: dados.replicacao.CIDADE,
            CNPJCPF: dados.replicacao.CNPJCPF,
            fone: dados.replicacao.FONE,
            nroEndereco: dados.replicacao.NROENDER,
            padraoClientes: dados.replicacao.CLIENTES,
            padraoVendedores: dados.replicacao.VENDEDORES,
            padraoProdutos: dados.replicacao.PRODUTOS,
            percMaxDesconto: dados.replicacao.DESCMAX,
            padraoDescCondPgto: true,
          };
        }
        return result || null;
      });
      return {
        ID: devices.id,
        descricao: devices.nome,
        habilitado: true,
        empresas: dadosEmpresa,
      };
    }
  });
};
