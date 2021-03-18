const axios = require('axios');
const fs = require('fs');
const UUID = require('uuid');

let mysql = null;

const prepareItemForMobile = require('./prepareItemForMobile');
const prepareItemForERP = require('./prepareItemForERP');

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

module.exports = (expressApp, jsonParser, database) => {
  mysql = database;

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

        const dispositivo = await mysql.queryOne(
          `SELECT * FROM dispositivo WHERE mac_address = ? LIMIT 1`,
          [mac.toLowerCase()]
        );

        if (dispositivo === null) {
          res.send({
            result: false,
            control: {
              erro: true,
              mensagem: 'Dispositivo não encontrado 😥',
            },
          });
          return;
        }
        const buscaEmpresa = await mysql.queryOne(
          `SELECT * FROM empresa WHERE id = ? LIMIT 1`,
          [dispositivo.empresa_id]
        );

        let empresa = await mysql.queryOne(
          `SELECT dados FROM replicacao WHERE empresa_id = ? AND tabela = ?
                AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(dados->"$.CNPJCPF", '.', ''), '-', ''), '/', ''), ' ', ''), '"', '') = ?
                AND dados IS NOT NULL LIMIT 1`,
          [dispositivo.empresa_id, 'EMPRESAS', buscaEmpresa.cnpj]
        );
        if (empresa == null) {
          res.send({
            result: false,
            control: { erro: true, mensagem: 'Empresa não enontrada 😥' },
          });
          return;
        }

        empresa = JSON.parse(empresa.dados);

        let ultimoidpedido = await mysql.queryOne(
          `SELECT dados->"$.IDPEDIDO" as id FROM replicacao WHERE empresa_id = ? AND tabela = ? ORDER BY dados->"$.IDPEDIDO" DESC`,
          [dispositivo.empresa_id, 'MOBILE_PEDIDO']
        );
        if (ultimoidpedido === null) {
          ultimoidpedido = { id: 1 };
        }
        ultimoidpedido = ultimoidpedido.id;
        let buscaDadosEmpresa = await mysql.queryOne(
          `SELECT dados->"$.DESCMAX" AS descMax, dados->"$.PRODUTOS" AS padraoProdutos,
          dados->"$.CLIENTES" AS padraoClientes, dados->"$.VENDEDORES" AS padraoVendedores
          FROM replicacao WHERE empresa_id = ? AND tabela = ?
          AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(dados->"$.CNPJCPF", '.', ''), '-', ''), '/', ''), ' ', ''), '"', '') = ?
          ORDER BY DATA_OPERACAO DESC`,
          [dispositivo.empresa_id, 'EMPRESAS', buscaEmpresa.cnpj]
        );
        if (buscaDadosEmpresa === null) {
          buscaDadosEmpresa = {
            descMax: 0,
            padraoProdutos: 1,
            padraoClientes: 1,
            padraoVendedores: 1,
          };
        }
        res.send({
          iddispositivo: dispositivo.id,
          mac: dispositivo.mac_address,
          descricao: dispositivo.nome,
          habilitado: true,
          ultimologin: new Date(getUTCTime()).toISOString(),
          status: 'Liberado',
          ultimoidpedido,
          empresa: {
            idempresa: empresa.IDEMPRESA,
            cnpj: empresa.CNPJCPF.split(/[^0-9]/).join(''),
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

      const dispositivo = await mysql.queryOne(
        `SELECT * FROM dispositivo WHERE auth = ?`,
        [token_dispositivo]
      );

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
      const mask = /(\w{2})(\w{2})(\w{2})(\w{2})(\w{2})(\w{2})/;
      const macAddress = String(dispositivo.mac_address);
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

      const dispositivo = await mysql.queryOne(
        `SELECT * FROM dispositivo WHERE auth = ?`,
        [token_dispositivo]
      );

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
      const promises = [];
      const mysqlLoop = mysql;
      for (const key in lista) {
        if ({}.hasOwnProperty.call(lista, key)) {
          const cliente = lista[key];
          cliente.statusReplic = 'EM_REPLICACAO';
          promises.push(
            mysql
              .queryOne(
                `SELECT * FROM replicacao
                    WHERE
                        empresa_id = ? AND
                        tabela = ? AND
                        dados->"$.IDPESSOA" = ? AND
                        dados->"$.IDEMPRESA" = ? AND
                        dados->"$.TIPOCADASTRO" = ? AND
                        dados->"$.HASHREPLIC" = ?
                `,
                [
                  dispositivo.empresa_id,
                  'MOBILE_CLIENTE',
                  cliente.idpessoa,
                  cliente.idempresa,
                  cliente.tipocadastro,
                  cliente.hashreplic,
                ]
              )
              .then(async (clienteMobile) => {
                const clienteERP = await prepareItemForERP.mobile_cliente(
                  cliente
                );
                if (clienteMobile === null) {
                  const enderecoUUID = UUID.v4();
                  await mysqlLoop.query(
                    `INSERT INTO replicacao
                      (empresa_id, uuid, tabela, data_operacao, situacao, dados, ultimo_autor)
                      VALUES (?,UUID(),?,?,?,?,?)`,
                    [
                      dispositivo.empresa_id,
                      'MOBILE_CLIENTE',
                      getUTCTime(),
                      '0',
                      JSON.stringify(clienteERP),
                      dispositivo.auth,
                    ]
                  );

                  let cidade = await mysqlLoop.queryOne(
                    `SELECT * FROM replicacao WHERE empresa_id = ? AND tabela = ? AND dados->"$.IDCIDADE" = ?`,
                    [
                      dispositivo.empresa_id,
                      'CIDADES',
                      cliente.endereco.cidade.idcidade,
                    ]
                  );

                  if (cidade && cidade.dados) {
                    cidade = JSON.parse(cidade.dados);
                  } else {
                    cidade = { COD_NACIONAL: null };
                  }

                  await mysqlLoop.query(
                    `INSERT INTO replicacao
                          (empresa_id, uuid, tabela, data_operacao, situacao, dados, ultimo_autor)
                      VALUES (?,?,?,?,?,?,?)`,
                    [
                      dispositivo.empresa_id,
                      enderecoUUID,
                      'MOBILE_CLIENTE_ENDERECO',
                      getUTCTime(),
                      '0',
                      JSON.stringify({
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
                      dispositivo.auth,
                    ]
                  );
                } else {
                  clienteMobile.dados = clienteERP;
                  await mysqlLoop.query(
                    'UPDATE replicacao SET dados = ?, data_operacao = ?, ultimo_autor = ? WHERE uuid = ? AND tabela = ? AND empresa_id = ?',
                    [
                      JSON.stringify(clienteMobile.dados),
                      getUTCTime(),
                      dispositivo.auth,
                      clienteMobile.uuid,
                      'MOBILE_CLIENTE',
                      dispositivo.empresa_id,
                    ]
                  );

                  const clienteMobileEndereco = await mysqlLoop.queryOne(
                    `SELECT * FROM replicacao
                          WHERE
                              empresa_id = ? AND
                              tabela = ? AND
                              dados->"$.IDPESSOA" = ? AND
                              dados->"$.IDEMPRESA" = ? AND
                              dados->"$.TIPOCADASTRO" = ? AND
                              dados->"$.HASHREPLIC" = ?
                `,
                    [
                      dispositivo.empresa_id,
                      'MOBILE_CLIENTE_ENDERECO',
                      cliente.idpessoa,
                      cliente.idempresa,
                      cliente.tipocadastro,
                      cliente.hashreplic,
                    ]
                  );

                  const enderecoUUID = clienteMobileEndereco.uuid;

                  await mysqlLoop.query(
                    `UPDATE replicacao SET dados = ?, data_operacao = ?, ultimo_autor = ? WHERE uuid = ? AND tabela = ? AND empresa_id = ?`,
                    [
                      JSON.stringify({
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
                      getUTCTime(),
                      dispositivo.auth,
                      enderecoUUID,
                      'MOBILE_CLIENTE_ENDERECO',
                      dispositivo.empresa_id,
                    ]
                  );
                }

                lista[key] = cliente;
              })
          );
        }
      }
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

      const dispositivo = await mysql.queryOne(
        `SELECT * FROM dispositivo WHERE auth = ?`,
        [token_dispositivo]
      );

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

      const results = await mysql.query(
        `SELECT * FROM replicacao WHERE empresa_id = ? AND tabela = ? AND dados->"$.statusReplic" = ?`,
        [dispositivo.empresa_id, 'MOBILE_CLIENTE', 'EM_REPLICACAO']
      );

      const clientes = [];

      for (const key in results) {
        if ({}.hasOwnProperty.call(results, key)) {
          clientes.push(JSON.parse(results[key].dados));
        }
      }

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
      const mysqlLoop = mysql;
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

      const dispositivo = await mysql.queryOne(
        `SELECT * FROM dispositivo WHERE auth = ?`,
        [token_dispositivo]
      );

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
      for (const key in lista) {
        if ({}.hasOwnProperty.call(lista, key)) {
          promises.push(
            mysql
              .queryOne(
                `SELECT * FROM replicacao WHERE empresa_id = ? AND tabela = ? AND dados->"$.HASHREPLIC" = ?`,
                [
                  dispositivo.empresa_id,
                  'MOBILE_CLIENTE',
                  lista[key].hashreplic,
                ]
              )
              .then(async (result) => {
                if (result !== null) {
                  const dados = JSON.parse(result.dados);
                  retorno.push(
                    await prepareItemForMobile.cliente(
                      dados,
                      mysqlLoop,
                      dispositivo
                    )
                  );
                }
              })
          );
        }
      }
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

      const dispositivo = await mysql.queryOne(
        `SELECT * FROM dispositivo WHERE auth = ?`,
        [token_dispositivo]
      );

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
      const promises = [];
      const mySQLLoop = mysql;

      for (const key in lista) {
        if ({}.hasOwnProperty.call(lista, key)) {
          const pedido = lista[key];

          pedido.old = pedido.idpedido;
          pedido.new = pedido.idpedido;

          promises.push(
            prepareItemForERP.mobile_pedido(pedido).then(async (pedidoERP) => {
              const produtosERP = await prepareItemForERP.mobile_pedido_produtos(
                pedido
              );

              await mySQLLoop.query(
                `INSERT INTO replicacao
                  (empresa_id, uuid, tabela, data_operacao, situacao, dados, ultimo_autor)
                 VALUES
                  (?, UUID(), ?, ?, ?, ?, ?)`,
                [
                  dispositivo.empresa_id,
                  'MOBILE_PEDIDO',
                  getUTCTime(),
                  '0',
                  JSON.stringify(pedidoERP),
                  dispositivo.auth,
                ]
              );

              await mySQLLoop.execute(
                `DELETE FROM replicacao
                  WHERE empresa_id = ?
                    AND tabela = ?
                    AND dados->"$.IDPEDIDO" = ?
                    AND dados->"$.MACPEDIDO" = ?
                `,
                [
                  dispositivo.empresa_id,
                  'MOBILE_PEDIDO_PRODUTOS',
                  pedidoERP.IDPEDIDO,
                  pedidoERP.MAC,
                ]
              );

              const promisesLoop = [];
              for (let i = 0; i < produtosERP.length; i += 1) {
                promisesLoop.push(
                  mySQLLoop.query(
                    `INSERT INTO replicacao
                      (empresa_id, uuid, tabela, data_operacao, situacao, dados, ultimo_autor)
                     VALUES
                      (?, UUID(), ?, ?, ?, ?, ?)`,
                    [
                      dispositivo.empresa_id,
                      'MOBILE_PEDIDO_PRODUTOS',
                      getUTCTime(),
                      '0',
                      JSON.stringify(produtosERP[i]),
                      dispositivo.auth,
                    ]
                  )
                );
              }
              await Promise.all(promisesLoop);
              lista[key] = pedido;
            })
          );
        }
      }
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

      const dispositivo = await mysql.queryOne(
        `SELECT * FROM dispositivo WHERE auth = ?`,
        [token_dispositivo]
      );

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
      const listaRetorno = [];

      const promises = [];
      const mySQLLoop = mysql;
      for (const key in lista) {
        if ({}.hasOwnProperty.call(lista, key)) {
          let pedido = lista[key];

          promises.push(
            mysql
              .queryOne(
                `SELECT * FROM replicacao
                    WHERE
                        empresa_id = ? AND
                        tabela = ? AND
                        dados->"$.IDPEDIDO" = ? AND
                        dados->"$.IDEMPRESA" = ? AND
                        dados->"$.MAC" = ? `,
                [
                  dispositivo.empresa_id,
                  'MOBILE_PEDIDO',
                  pedido.idpedido,
                  pedido.idempresa,
                  pedido.mac,
                ]
              )
              .then(async (dataPedido) => {
                if (dataPedido !== null) {
                  dataPedido.dados = JSON.parse(dataPedido.dados);

                  pedido = await prepareItemForMobile.pedido(
                    dataPedido.dados,
                    mySQLLoop,
                    dispositivo
                  );

                  pedido.statusreplic = dataPedido.dados.STATUSPEDIDO;
                  pedido.inforeprovado = dataPedido.dados.INFOREPROVADO;

                  listaRetorno.push(pedido);
                }
              })
          );
        }
      }
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

      const dispositivo = await mysql.queryOne(
        `SELECT * FROM dispositivo WHERE auth = ?`,
        [token_dispositivo]
      );

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

      const result = await mysql.queryOne(
        'SELECT count(*) as total FROM replicacao WHERE empresa_id = ? AND tabela = ?',
        [dispositivo.empresa_id, 'CIDADES']
      );

      res.send(`${result.total}`);
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

      const dispositivo = await mysql.queryOne(
        `SELECT * FROM dispositivo WHERE auth = ?`,
        [token_dispositivo]
      );

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

      const nomeCidade = req.params.cidade;

      const result = await mysql.query(
        `SELECT * FROM replicacao WHERE empresa_id = ? AND tabela = ? AND dados->"$.DESCRICAO" LIKE ?`,
        [dispositivo.empresa_id, 'CIDADES', `${nomeCidade}%`]
      );

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

    const dispositivo = await mysql.queryOne(
      `SELECT * FROM dispositivo WHERE auth = ?`,
      [token_dispositivo]
    );

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

    const result = await mysql.query(
      `SELECT * FROM replicacao WHERE empresa_id = ? AND tabela = ?`,
      [dispositivo.empresa_id, 'CIDADES']
    );

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

      const dispositivo = await mysql.queryOne(
        `SELECT * FROM dispositivo WHERE auth = ?`,
        [token_dispositivo]
      );

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

      const { tabela } = req.query;
      const { data } = req.query;

      const columns = ['*'];
      const joins = [];
      const conditions = ['empresa_id = ?', 'tabela = ?'];
      const conditionsParams = [dispositivo.empresa_id];

      switch (tabela) {
        case 'vendedor':
          conditionsParams.push('PESSOAS');
          conditions.push(`dados->"$.IDTIPO_PS" = ?`);
          conditionsParams.push(5);
          break;
        case 'cliente':
          conditionsParams.push('PESSOAS');
          conditions.push(`dados->"$.IDTIPO_PS" = ?`);
          conditionsParams.push(1);
          break;
        case 'formapgto':
          conditionsParams.push('FORMAPGTO');
          break;
        case 'condicaopgto':
          conditionsParams.push('CONDPAG');
          break;
        case 'pedido':
          conditionsParams.push('MOBILE_PEDIDO');
          break;
        case 'produto':
          conditionsParams.push('PRODUTOS');
          break;
        case 'parametro':
          conditionsParams.push('PARAMETROS');
          break;
        default:
          conditionsParams.push(tabela.toUpperCase());
          break;
      }

      conditions.push(`data_operacao > ?`);
      conditionsParams.push(data);
      conditions.push(`(situacao = 2
                        or (not dados is null
                        and not dados like 'null'
                        and not dados like '%[]%'))`);
      const linhasBanco = await mysql.query(
        `SELECT ${columns}
            FROM replicacao
            ${joins.join(', ')}
        WHERE ${conditions.join(' AND ')}
        ORDER BY data_operacao ASC, id ASC
        LIMIT 50`,
        conditionsParams
      );
      const promises = [];
      const objetos = [];
      for (const key in linhasBanco) {
        if ({}.hasOwnProperty.call(linhasBanco, key)) {
          const dados = JSON.parse(linhasBanco[key].dados);
          const newDados = {};
          for (const dadoKey in dados) {
            if ({}.hasOwnProperty.call(dados, dadoKey)) {
              newDados[dadoKey.toLowerCase()] = dados[dadoKey];
            }
          }
          const objeto = {};
          objeto.operacao = `${linhasBanco[key].situacao}`;
          objeto.data = linhasBanco[key].data_operacao;

          if (tabela in prepareItemForMobile) {
            promises.push(
              prepareItemForMobile[tabela](newDados, mysql, dispositivo).then(
                (results) => {
                  objeto.registro = results;
                }
              )
            );
          } else {
            promises.push(
              prepareItemForMobile
                .prepareDefault(newDados, mysql, dispositivo)
                .then((results) => {
                  objeto.registro = results;
                })
            );
          }
          objetos.push(objeto);
        }
      }
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
