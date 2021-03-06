/* eslint-disable no-await-in-loop */
const axios = require('axios');
const fs = require('fs');
const UUID = require('uuid');
const Sequelize = require('sequelize');
const { Op } = require('sequelize');

const prepareItemForMobile = require('./prepareItemForMobile');
const prepareItemForERP = require('./prepareItemForERP');
const {
  empresa,
  dispositivo,
  replicacao,
  id_control,
  version_control,
} = require('../migrations/models');

function getUTCTime(now) {
  if (!now) {
    now = new Date();
  }
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds()
  );
}

module.exports = (expressApp, jsonParser) => {
  // /rest/replicacao/dispositivo/info?mac=%s
  expressApp.get(
    '/rest/replicacao/dispositivo/info',
    jsonParser,
    async (req, res) => {
      try {
        const { mac, version } = req.query;

        if (!mac) {
          res.send({
            result: false,
            control: {
              erro: true,
              mensagem: 'MAC Address não informado',
            },
          });
          return;
        }
        const dispositivos = await dispositivo.findOne({
          limit: 1,
          where: {
            mac_address: mac.toLowerCase(),
          },
        });

        if (dispositivos === null) {
          res.send({
            result: false,
            control: {
              erro: true,
              mensagem: 'Dispositivo não encontrado 😥',
            },
          });
          return;
        }
        const buscaEmpresa = await empresa.findOne({
          where: {
            id: dispositivos.empresa_id,
          },
        });

        if (version && parseInt(version, 10) !== dispositivos.app_version) {
          await dispositivo.update(
            {
              app_version: version,
            },
            {
              where: {
                auth: dispositivos.auth,
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
        const mask = /(\w{2})(\w{3})(\w{3})(\w{4})(\w{2})/;
        const cnpjEmpresa = String(buscaEmpresa.cnpj);

        const empresas = await replicacao.findOne({
          where: {
            empresa_id: dispositivos.empresa_id,
            tabela: 'EMPRESAS',
            dados: {
              CNPJCPF: {
                [Op.like]: cnpjEmpresa.replace(mask, '$1%$2%$3%$4%$5'),
              },
            },
          },
        });

        if (empresas == null) {
          res.send({
            result: false,
            control: { erro: true, mensagem: 'Empresa não enontrada 😥' },
          });
          return;
        }

        let ultimoidpedido = await replicacao.findAll({
          attributes: [[Sequelize.json('dados.IDPEDIDO'), 'id']],
          where: {
            empresa_id: dispositivos.empresa_id,
            tabela: 'MOBILE_PEDIDO',
          },
          order: [[Sequelize.json('dados.IDPEDIDO'), 'DESC']],
        });

        if (ultimoidpedido === null || ultimoidpedido.length === 0) {
          ultimoidpedido = { id: 1 };
        } else {
          ultimoidpedido = ultimoidpedido[0].dataValues.id;
        }

        let buscaDadosEmpresa = await replicacao.findAll({
          attributes: [
            [Sequelize.json('dados.DESCMAX'), 'descMax'],
            [Sequelize.json('dados.PRODUTOS'), 'padraoProdutos'],
            [Sequelize.json('dados.CLIENTES'), 'padraoClientes'],
            [Sequelize.json('dados.VENDEDORES'), 'padraoVendedores'],
          ],
          where: {
            empresa_id: dispositivos.empresa_id,
            tabela: 'EMPRESAS',
            dados: {
              CNPJCPF: {
                [Op.like]: cnpjEmpresa.replace(mask, '$1%$2%$3%$4%$5'),
              },
            },
          },
          order: [['data_operacao', 'DESC']],
        });

        if (buscaDadosEmpresa === null || buscaDadosEmpresa.length === 0) {
          buscaDadosEmpresa = {
            descMax: 0,
            padraoProdutos: 1,
            padraoClientes: 1,
            padraoVendedores: 1,
          };
        } else {
          buscaDadosEmpresa = buscaDadosEmpresa[0].dataValues;
        }
        res.send({
          iddispositivo: dispositivos.id,
          mac: dispositivos.mac_address,
          descricao: dispositivos.nome,
          habilitado: true,
          ultimologin: new Date(getUTCTime()).toISOString(),
          status: 'Liberado',
          ultimoidpedido,
          empresa: {
            idempresa: empresas.dados.IDEMPRESA,
            cnpj: empresas.dados.CNPJCPF.split(/[^0-9]/).join(''),
            padraoclientes: buscaDadosEmpresa.padraoClientes,
            padraovendedores: buscaDadosEmpresa.padraoVendedores,
            padraoprodutos: buscaDadosEmpresa.padraoProdutos,
            percmaxdesconto: buscaDadosEmpresa.descMax,
            padraodescontocondpag: true,
          },
        });
      } catch (err) {
        console.error(err);
        res.send({ Erro: err });
      }
    }
  );

  // /rest/versao/check
  expressApp.get('/rest/versao/check', jsonParser, async (req, res) => {
    if (!fs.existsSync(`${__dirname}/../public/version/aplicativo`)) {
      res.send({
        result: false,
        version: '0.0.0',
      });
    }

    let files = fs.readdirSync(`${__dirname}/../public/version/aplicativo`);

    if (files.length === 0) {
      res.send({
        result: false,
        versao_nome: '0.0.0',
        versao_codigo: '0',
        url_apk: 'http://sinc.windel.com.br/download/aplicativo.apk',
      });
    } else {
      files = files.map((fileName) => ({
        name: fileName,
        time: fs
          .statSync(`${__dirname}/../public/version/aplicativo/${fileName}`)
          .mtime.getTime(),
      }));

      files.sort((a, b) => b.time - a.time);

      const version = files[0].name.split('.')[0].split('-');

      res.send({
        result: true,
        versao_nome: version[0].split('_').join('.'),
        versao_codigo: version[1],
        url_apk: `http://sinc.windel.com.br/version/aplicativo/${files[0].name}`,
      });
    }
  });

  // /rest/replicacao/dispositivo/login
  expressApp.put(
    '/rest/replicacao/dispositivo/login',
    jsonParser,
    async (req, res) => {
      const token_dispositivo = req.headers.authtoken;

      if (!token_dispositivo) {
        res.send({
          result: false,
          control: {
            erro: true,
            mensagem: 'Dispositivo não encontrado!',
          },
        });
        return;
      }
      const dispositivos = await dispositivo.findOne({
        where: {
          auth: token_dispositivo,
        },
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

      if (
        req.body.token_onesignal &&
        req.body.token_onesignal !== dispositivos.token_onesignal
      ) {
        await dispositivo.update(
          {
            token_onesignal: req.body.token_onesignal,
          },
          {
            where: {
              auth: token_dispositivo,
            },
          }
        );
      }
      /* const mask = /(\w{2})(\w{2})(\w{2})(\w{2})(\w{2})(\w{2})/;
      const macAddress = String(dispositivos.mac_address);
      axios
        .patch('http://webservice.windel.com.br/dispositivos-moveis/1', {
          mac: macAddress.replace(mask, '$1:$2:$3:$4:$5:$6'),
          data_ultimo_login: new Date(getUTCTime()).toISOString(),
        })
        .catch((error) => {
          console.error(error);
        }); */

      res.send('true');
    }
  );

  /// rest/replicacao/cliente/novocliente
  expressApp.post(
    '/rest/replicacao/cliente/novocliente',
    jsonParser,
    async (req, res) => {
      const token_dispositivo = req.headers.authtoken;

      if (!token_dispositivo) {
        res.send({
          result: false,
          control: {
            erro: true,
            mensagem: 'Dispositivo não encontrado!',
          },
        });
        return;
      }
      const dispositivos = await dispositivo.findOne({
        where: {
          auth: token_dispositivo,
        },
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

      const lista = req.body;
      const promises = [];
      Object.keys(lista).forEach((key) => {
        if ({}.hasOwnProperty.call(lista, key)) {
          const cliente = lista[key];
          cliente.statusReplic = 'EM_REPLICACAO';
          promises.push(
            replicacao
              .findAll({
                where: {
                  empresa_id: dispositivos.empresa_id,
                  tabela: 'MOBILE_CLIENTE',
                  dados: {
                    IDPESSOA: cliente.idpessoa,
                    IDEMPRESA: cliente.idempresa,
                    TIPOCADASTRO: cliente.tipocadastro,
                    HASHREPLIC: cliente.hashreplic,
                  },
                },
              })
              .then(async (clienteMobile) => {
                const clienteERP = await prepareItemForERP.mobile_cliente(
                  cliente
                );
                if (clienteMobile === null || clienteMobile.length === 0) {
                  const enderecoUUID = UUID.v4();
                  await replicacao.create({
                    empresa_id: dispositivos.empresa_id,
                    uuid: UUID.v4(),
                    tabela: 'MOBILE_CLIENTE',
                    data_operacao: getUTCTime(),
                    situacao: 0,
                    dados: clienteERP,
                    ultimo_autor: dispositivos.auth,
                  });
                  let cidade = await replicacao.findAll({
                    where: {
                      empresa_id: dispositivos.empresa_id,
                      tabela: 'CIDADES',
                      dados: {
                        IDCIDADE: cliente.endereco.cidade.idcidade,
                      },
                    },
                  });

                  if (cidade && cidade[0].dados) {
                    cidade = cidade[0].dados;
                  } else {
                    cidade = { COD_NACIONAL: null };
                  }

                  await replicacao.create({
                    empresa_id: dispositivos.empresa_id,
                    uuid: enderecoUUID,
                    tabela: 'MOBILE_CLIENTE_ENDERECO',
                    data_operacao: getUTCTime(),
                    situacao: 0,
                    dados: {
                      IDPESSOA: clienteERP.IDPESSOA,
                      IDEMPRESA: clienteERP.IDEMPRESA,
                      TIPOCADASTRO: clienteERP.TIPOCADASTRO,
                      HASHREPLIC: clienteERP.HASHREPLIC,
                      CEP: cliente.endereco.cep,
                      LOGRADOURO: cliente.endereco.logradouro,
                      NUMERO: cliente.endereco.numero,
                      COMPLEMENTO: cliente.endereco.complemento,
                      BAIRRO: cliente.endereco.bairro,
                      IDCIDADE: cidade.COD_NACIONAL,
                      SINC_UUID: enderecoUUID,
                    },
                    ultimo_autor: dispositivos.auth,
                  });
                } else {
                  clienteMobile[0].dados = clienteERP;
                  await replicacao.update(
                    {
                      dados: clienteMobile[0].dados,
                      data_operacao: getUTCTime(),
                      ultimo_autor: dispositivos.auth,
                    },
                    {
                      where: {
                        uuid: clienteMobile[0].uuid,
                        tabela: 'MOBILE_CLIENTE',
                        empresa_id: dispositivos.empresa_id,
                      },
                    }
                  );
                  let clienteMobileEndereco = await replicacao.findAll({
                    where: {
                      empresa_id: dispositivos.empresa_id,
                      tabela: 'CLIENTE_MOBILE_ENDERECO',
                      dados: {
                        IDPESSOA: cliente.idpessoa,
                        IDEMPRESA: cliente.idempresa,
                        TIPOCADASTRO: cliente.tipocadastro,
                        HASHREPLIC: cliente.hashreplic,
                      },
                    },
                  });

                  clienteMobileEndereco = clienteMobileEndereco[0];

                  const enderecoUUID = clienteMobileEndereco.uuid;
                  await replicacao.update(
                    {
                      dados: {
                        IDPESSOA: clienteERP.IDPESSOA,
                        IDEMPRESA: clienteERP.IDEMPRESA,
                        TIPOCADASTRO: clienteERP.TIPOCADASTRO,
                        HASHREPLIC: clienteERP.HASHREPLIC,
                        CEP: cliente.endereco.CEP,
                        LOGRADOURO: cliente.endereco.LOGRADOURO,
                        NUMERO: cliente.endereco.NUMERO,
                        COMPLEMENTO: cliente.endereco.COMPLEMENTO,
                        BAIRRO: cliente.endereco.BAIRRO,
                        IDCIDADE: cliente.endereco.IDCIDADE,
                        SINC_UUID: enderecoUUID,
                      },
                      data_operacao: getUTCTime(),
                      ultimo_autor: dispositivos.auth,
                    },
                    {
                      where: {
                        uuid: enderecoUUID,
                        tabela: 'MOBILE_CLIENTE_ENDERECO',
                        empresa_id: dispositivos.empresa_id,
                      },
                    }
                  );
                }

                lista[key] = cliente;
              })
          );
        }
      });
      await Promise.all(promises);
      res.send(lista);
    }
  );

  expressApp.get(
    '/rest/replicacao/cliente/buscarclientesreplic',
    jsonParser,
    async (req, res) => {
      const token_dispositivo = req.headers.authtoken;

      if (!token_dispositivo) {
        res.send({
          result: false,
          control: {
            erro: true,
            mensagem: 'Dispositivo não encontrado!',
          },
        });
        return;
      }
      const dispositivos = await dispositivo.findOne({
        where: {
          auth: token_dispositivo,
        },
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

      const results = await replicacao.findAll({
        where: {
          empresa_id: dispositivos.empresa_id,
          tabela: 'MOBILE_CLIENTE',
          dados: {
            statusReplic: 'EM_REPLICACAO',
          },
        },
      });

      const clientes = [];
      Object.keys(results).forEach((key) => {
        if ({}.hasOwnProperty.call(results, key)) {
          clientes.push(results[key].dados);
        }
      });

      res.send({
        result: clientes,
        control: {
          erro: false,
          mensagem: '',
        },
      });
    }
  );

  expressApp.post(
    '/rest/replicacao/cliente/buscarstatusclientesreplic',
    jsonParser,
    async (req, res) => {
      const token_dispositivo = req.headers.authtoken;

      if (!token_dispositivo) {
        res.send({
          result: false,
          control: {
            erro: true,
            mensagem: 'Dispositivo não encontrado!',
          },
        });
        return;
      }

      const dispositivos = await dispositivo.findOne({
        where: {
          auth: token_dispositivo,
        },
      });

      if (dispositivo == null) {
        res.send({
          result: false,
          control: {
            erro: true,
            mensagem: 'Dispositivo bloqueado!',
          },
        });
        return;
      }
      const lista = req.body;

      const retorno = [];
      const promises = [];

      Object.keys(lista).forEach((key) => {
        if ({}.hasOwnProperty.call(lista, key)) {
          promises.push(
            replicacao
              .findOne({
                where: {
                  empresa_id: dispositivos.empresa_id,
                  tabela: 'MOBILE_CLIENTE',
                  dados: {
                    HASHREPLIC: lista[key].hashreplic,
                  },
                },
              })
              .then(async (result) => {
                if (result !== null) {
                  const { dados } = result;
                  retorno.push(
                    await prepareItemForMobile.cliente(dados, dispositivos)
                  );
                }
              })
          );
        }
      });
      await Promise.all(promises);
      res.send(retorno);
    }
  );

  // /rest/replicacao/pedido/novopedido
  expressApp.post(
    '/rest/replicacao/pedido/novopedido',
    jsonParser,
    async (req, res) => {
      const token_dispositivo = req.headers.authtoken;

      if (!token_dispositivo) {
        res.send({
          result: false,
          control: {
            erro: true,
            mensagem: 'Dispositivo não encontrado!',
          },
        });
        return;
      }
      const dispositivos = await dispositivo.findOne({
        where: { auth: token_dispositivo },
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
      const lista = req.body;
      const promises = [];
      const listaRetorno = [];
      // eslint-disable-next-line no-restricted-syntax
      for (const key of lista) {
        const pedido = key;

        const consPedido = await replicacao.findOne({
          where: {
            empresa_id: dispositivos.empresa_id,
            tabela: 'MOBILE_PEDIDO',
          },
          order: [
            [Sequelize.cast(Sequelize.json('dados.IDPEDIDO'), 'INT'), 'desc'],
          ],
        });

        if (
          consPedido !== null &&
          consPedido.dados &&
          consPedido.dados.IDPEDIDO
        ) {
          pedido.old = pedido.idpedido;
          pedido.new = parseInt(consPedido.dados.IDPEDIDO, 10) + 1;
          pedido.idpedido = parseInt(consPedido.dados.IDPEDIDO, 10) + 1;
        }
        const pedidoERP = await prepareItemForERP.mobile_pedido(pedido);
        const produtosERP = await prepareItemForERP.mobile_pedido_produtos(
          pedido
        );
        await replicacao.create({
          empresa_id: dispositivos.empresa_id,
          tabela: 'MOBILE_PEDIDO',
          uuid: UUID.v4(),
          data_operacao: getUTCTime(),
          situacao: 0,
          dados: pedidoERP,
          ultimo_autor: dispositivos.auth,
        });

        await replicacao.destroy({
          where: {
            empresa_id: dispositivos.empresa_id,
            tabela: 'MOBILE_PEDIDO_PRODUTOS',
            dados: {
              IDPEDIDO: pedidoERP.IDPEDIDO,
              MACPEDIDO: pedidoERP.MAC,
            },
          },
        });

        const promisesLoop = [];
        for (let i = 0; i < produtosERP.length; i += 1) {
          promisesLoop.push(
            replicacao.create({
              empresa_id: dispositivos.empresa_id,
              uuid: UUID.v4(),
              tabela: 'MOBILE_PEDIDO_PRODUTOS',
              data_operacao: getUTCTime(),
              situacao: 0,
              dados: produtosERP[i],
              ultimo_autor: dispositivos.auth,
            })
          );
        }
        await Promise.all(promisesLoop);
        listaRetorno.push(pedido);
      }

      res.send(listaRetorno);
    }
  );

  /// rest/replicacao/pedido/buscardataultimopedidoreplicprocessado //OLD SINCRONIZADOR

  expressApp.post(
    '/rest/replicacao/pedido/buscarstatuspedidosreplicacao',
    jsonParser,
    async (req, res) => {
      const token_dispositivo = req.headers.authtoken;

      if (!token_dispositivo) {
        res.send({
          result: false,
          control: {
            erro: true,
            mensagem: 'Dispositivo não encontrado!',
          },
        });
        return;
      }
      const dispositivos = await dispositivo.findOne({
        where: { auth: token_dispositivo },
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

      const lista = req.body;
      const listaRetorno = [];

      const promises = [];
      Object.keys(lista).forEach((key) => {
        if ({}.hasOwnProperty.call(lista, key)) {
          let pedido = lista[key];

          promises.push(
            replicacao
              .findOne({
                where: {
                  empresa_id: dispositivos.empresa_id,
                  tabela: 'MOBILE_PEDIDO',
                  dados: {
                    IDPEDIDO: pedido.idpedido,
                    IDEMPRESA: pedido.idempresa,
                    MAC: pedido.mac,
                  },
                },
                order: [['data_operacao', 'DESC']],
              })
              .then(async (dataPedido) => {
                if (dataPedido && dataPedido.dados !== null) {
                  pedido = await prepareItemForMobile.pedido(
                    dataPedido.dados,
                    dispositivos
                  );

                  pedido.statusreplic = dataPedido.dados.STATUSPEDIDO;
                  pedido.inforeprovado = dataPedido.dados.INFOREPROVADO;

                  listaRetorno.push(pedido);
                }
              })
          );
        }
      });
      await Promise.all(promises);
      res.send(listaRetorno);
    }
  );

  expressApp.get(
    '/rest/replicacao/cidadescount',
    jsonParser,
    async (req, res) => {
      const token_dispositivo = req.headers.authtoken;

      if (!token_dispositivo) {
        res.send({
          result: false,
          control: {
            erro: true,
            mensagem: 'Dispositivo não encontrado!',
          },
        });
        return;
      }

      const dispositivos = await dispositivo.findOne({
        where: { auth: token_dispositivo },
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
      const result = await replicacao.count({
        where: {
          empresa_id: dispositivos.empresa_id,
          tabela: 'CIDADES',
        },
      });

      res.send(`${result}`);
    }
  );

  expressApp.get(
    '/rest/replicacao/cidades/:cidade',
    jsonParser,
    async (req, res) => {
      const token_dispositivo = req.headers.authtoken;

      if (!token_dispositivo) {
        res.send({
          result: false,
          control: {
            erro: true,
            mensagem: 'Dispositivo não encontrado!',
          },
        });
        return;
      }

      const dispositivos = await dispositivo.findOne({
        where: { auth: token_dispositivo },
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

      const nomeCidade = req.params.cidade;

      const result = await replicacao.findAll({
        where: {
          empresa_id: dispositivos.empresa_id,
          tabela: 'CIDADES',
          dados: {
            DESCRICAO: {
              [Op.like]: `${nomeCidade}%`,
            },
          },
        },
      });

      const cidades = [];
      for (let i = 0; i < result.length; i += 1) {
        cidades.push(result[i].dados);
      }

      res.send(cidades);
    }
  );
  expressApp.get('/rest/replicacao/cidades', jsonParser, async (req, res) => {
    const token_dispositivo = req.headers.authtoken;

    if (!token_dispositivo) {
      res.send({
        result: false,
        control: {
          erro: true,
          mensagem: 'Dispositivo não encontrado!',
        },
      });
      return;
    }

    const dispositivos = await dispositivo.findOne({
      where: { auth: token_dispositivo },
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
    const result = await replicacao.findAll({
      where: {
        empresa_id: dispositivos.empresa_id,
        tabela: 'CIDADES',
      },
    });

    const cidades = [];
    const promises = [];
    for (let i = 0; i < result.length; i += 1) {
      const objeto = result[i].dados;
      promises.push(
        prepareItemForMobile.prepareCidade(objeto).then((results) => {
          cidades.push(results);
        })
      );
    }
    await Promise.all(promises);
    res.send(cidades);
  });

  // /rest/replicacao/cliente/buscarstatusclientesreplic

  // buscarstatuspedidosreplicacao

  // /rest/replicacao/pacotesincronizacao?
  //                                      tabela= &
  //                                      data=

  expressApp.get(
    '/rest/replicacao/pacotesincronizacao',
    jsonParser,
    async (req, res) => {
      const token_dispositivo = req.headers.authtoken;

      if (!token_dispositivo) {
        res.send({
          result: false,
          control: {
            erro: true,
            mensagem: 'Dispositivo não encontrado!',
          },
        });
        return;
      }

      const dispositivos = await dispositivo.findOne({
        where: { auth: token_dispositivo },
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
        case 'titulos':
          tabelaConsulta = 'TITULOS';
          extraConditions = {
            situacao: {
              [Op.not]: 2,
            },
          };
          break;
        default:
          tabelaConsulta = tabela.toUpperCase();
          break;
      }

      const linhasBanco = await replicacao.findAll({
        limit: 50,
        where: {
          empresa_id: dispositivos.empresa_id,
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
      res.send({
        result: objetos,
        control: {
          erro: false,
          mensagem: '',
        },
      });
    }
  );

  // /rest/replicacao/cidades
};
