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
        const { mac } = req.query;

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
        const buscaEmpresa = await empresa.findAll({
          limit: 1,
          where: {
            id: dispositivos.empresa_id,
          },
        });
        const mask = /(\w{2})(\w{3})(\w{3})(\w{4})(\w{2})/;
        const cnpjEmpresa = String(buscaEmpresa[0].cnpj);

        let empresas = await replicacao.findAll({
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

        empresas = JSON.parse(empresas[0].dados);

        let ultimoidpedido = await replicacao.findAll({
          limit: 1,
          attributes: [[Sequelize.json('dados.IDPEDIDO'), 'id']],
          where: {
            empresa_id: dispositivos.empresa_id,
            tabela: 'MOBILE_PEDIDO',
          },
          order: [[Sequelize.json('dados.IDPEDIDO'), 'DESC']],
        });

        if (ultimoidpedido === null) {
          ultimoidpedido = { id: 1 };
        }
        ultimoidpedido = ultimoidpedido[0].dataValues.id;

        let buscaDadosEmpresa = await replicacao.findAll({
          attributes: [
            [Sequelize.json('dados.DESCMAX'), 'padraoVendedores'],
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

        if (buscaDadosEmpresa === null) {
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
            idempresa: empresas.IDEMPRESA,
            cnpj: empresas.CNPJCPF.split(/[^0-9]/).join(''),
            padraoclientes: buscaDadosEmpresa.padraoClientes,
            padraovendedores: buscaDadosEmpresa.padraoVendedores,
            padraoprodutos: buscaDadosEmpresa.padraoProdutos,
            percmaxdesconto: buscaDadosEmpresa.descMax,
            padraodescontocondpag: true,
          },
        });
      } catch (err) {
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
      const mask = /(\w{2})(\w{2})(\w{2})(\w{2})(\w{2})(\w{2})/;
      const macAddress = String(dispositivos.mac_address);
      axios
        .patch('http://webservice.windel.com.br/dispositivos-moveis/1', {
          mac: macAddress.replace(mask, '$1:$2:$3:$4:$5:$6'),
          data_ultimo_login: new Date(getUTCTime()).toISOString(),
        })
        .catch((error) => {
          console.error(error);
        });

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
                if (clienteMobile === null) {
                  const enderecoUUID = UUID.v4();
                  await replicacao.create({
                    empresa_id: dispositivos.empresa_id,
                    uuid: UUID.v4(),
                    tabela: 'MOBILE_CLIENTE',
                    data_operacao: getUTCTime(),
                    situacao: 0,
                    dados: JSON.stringify(clienteERP),
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
                    cidade = JSON.parse(cidade[0].dados);
                  } else {
                    cidade = { COD_NACIONAL: null };
                  }

                  await replicacao.create({
                    empresa_id: dispositivos.empresa_id,
                    uuid: enderecoUUID,
                    tabela: 'MOBILE_CLIENTE_ENDERECO',
                    data_operacao: getUTCTime(),
                    situacao: 0,
                    dados: JSON.stringify({
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
                    }),
                    ultimo_autor: dispositivos.auth,
                  });
                } else {
                  clienteMobile[0].dados = clienteERP;
                  await replicacao.update(
                    {
                      dados: JSON.stringify(clienteMobile[0].dados),
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
                      dados: JSON.stringify({
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
                      }),
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
          clientes.push(JSON.parse(results[key].dados));
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
                  const dados = JSON.parse(result.dados);
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
      const dispositivos = dispositivo.findOne({
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

      Object.keys(lista).forEach((key) => {
        if ({}.hasOwnProperty.call(lista, key)) {
          const pedido = lista[key];

          pedido.old = pedido.idpedido;
          pedido.new = pedido.idpedido;

          promises.push(
            prepareItemForERP.mobile_pedido(pedido).then(async (pedidoERP) => {
              const produtosERP = await prepareItemForERP.mobile_pedido_produtos(
                pedido
              );
              await replicacao.create({
                empresa_id: dispositivos.empresa_id,
                uuid: UUID.v4(),
                data_operacao: getUTCTime(),
                situacao: 0,
                dados: JSON.stringify(pedidoERP),
                ultimo_autor: dispositivos.auth,
              });

              await replicacao.delete({
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
                    dados: JSON.stringify(produtosERP[i]),
                    ultimo_autor: dispositivos.auth,
                  })
                );
              }
              await Promise.all(promisesLoop);
              lista[key] = pedido;
            })
          );
        }
      });
      await Promise.all(promises);
      res.send(lista);
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
      const dispositivos = dispositivo.findOne({
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
              })
              .then(async (dataPedido) => {
                if (dataPedido !== null) {
                  dataPedido.dados = JSON.parse(dataPedido.dados);

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

      const dispositivos = dispositivo.findOne({
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

      const dispositivos = dispositivo.findOne({
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

      const result = replicacao.findAll({
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
        cidades.push(JSON.parse(result[i].dados));
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

    const dispositivos = dispositivo.findOne({
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
    const result = replicacao.findAll({
      where: {
        empresa_id: dispositivos.empresa_id,
        tabela: 'CIDADES',
      },
    });

    const cidades = [];
    const promises = [];
    for (let i = 0; i < result.length; i += 1) {
      const objeto = JSON.parse(result[i].dados);
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

      const dispositivos = dispositivo.findOne({
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
        default:
          tabelaConsulta = tabela.toUpperCase();
          break;
      }

      const linhasBanco = await replicacao.findAll({
        limit: 100,
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
              [Op.not]: {
                [Op.like]: 'null',
              },
              [Op.not]: {
                [Op.like]: '%[]%',
              },
            },
          },
          ...extraConditions,
        },
      });

      const promises = [];
      const objetos = [];

      Object.keys(linhasBanco).forEach((key) => {
        if ({}.hasOwnProperty.call(linhasBanco, key)) {
          const dados = JSON.parse(linhasBanco[key].dados);
          const newDados = {};

          Object.keys(dados).forEach((dadoKey) => {
            if ({}.hasOwnProperty.call(dados, dadoKey)) {
              newDados[dadoKey.toLowerCase()] = dados[dadoKey];
            }
          });
          const objeto = {};
          objeto.operacao = `${linhasBanco[key].situacao}`;
          objeto.data = linhasBanco[key].data_operacao;

          if (tabela in prepareItemForMobile) {
            promises.push(
              prepareItemForMobile[tabela](newDados, dispositivo).then(
                (results) => {
                  objeto.registro = results;
                }
              )
            );
          } else {
            promises.push(
              prepareItemForMobile
                .prepareDefault(newDados, dispositivo)
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
