/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const jsonParser = bodyParser.json({ limit: '50mb' });
const path = require('path');
const Sequelize = require('sequelize');
const { Op } = require('sequelize');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const fs = require('fs');

app.use(express.static('public'));

const {
  empresa,
  dispositivo,
  replicacao,
  id_control,
} = require('./migrations/models');

app.post('/empresa', jsonParser, async (req, res) => {
  if (!req.body.cnpj) {
    res.send({
      result: false,
      message: "Missing 'cnpj' on request body",
    });
    return;
  }
  if (!req.body.nome) {
    res.send({
      result: false,
      message: "Missing 'nome' on request body",
    });
    return;
  }
  if (!req.body.auth) {
    res.send({
      result: false,
      message: "Missing 'token' on request body",
    });
    return;
  }
  const emp_data = req.body;

  emp_data.cnpj = emp_data.cnpj.split(/[^0-9]/).join('');

  let empresas = await empresa.findAll({
    where: {
      cnpj: emp_data.cnpj,
    },
  });

  if (empresas.length === 0) {
    empresas = await empresa.create({
      nome: emp_data.nome,
      cnpj: emp_data.cnpj,
      dados_conexao: emp_data.dados_conexao,
    });
    await dispositivo.create({
      empresa_id: empresas.id,
      auth: emp_data.auth,
      nome: 'Windel ERP',
    });
  } else {
    await empresa.update(
      {
        nome: emp_data.nome,
        dados_conexao: emp_data.dados_conexao ? emp_data.dados_conexao : '',
      },
      { where: { id: empresas[0].id } }
    );
  }

  res.send({
    result: true,
  });
});

app.delete('/dispositivo', jsonParser, async (req, res) => {
  if (!req.body.mac_address) {
    res.status(406).send({
      result: false,
      message: "Missing 'mac_address' on request body",
    });
    return;
  }
  if (!req.body.cnpj) {
    res.status(406).send({
      result: false,
      message: "Missing 'cnpj' on request body",
    });
    return;
  }
  req.body.cnpj = req.body.cnpj.split(/[^0-9]/).join('');
  req.body.mac_address = req.body.mac_address
    .toLowerCase()
    .split(/[^a-z0-9]/)
    .join('');

  const empresas = await empresa.findAll({
    where: {
      cnpj: req.body.cnpj,
    },
  });
  if (empresas.length === 0) {
    res.send({
      result: false,
      message: 'CNPJ não encontrado na base de dados',
    });
    return;
  }
  await dispositivo.destroy({
    where: {
      empresa_id: empresas[0].id,
      mac_address: req.body.mac_address,
    },
  });

  res.send({
    result: true,
  });
});

app.post('/dispositivo', jsonParser, async (req, res) => {
  if (!req.body.nome) {
    res.send({
      result: false,
      message: "Missing 'nome' on request body",
    });
    return;
  }
  if (!req.body.auth) {
    res.send({
      result: false,
      message: "Missing 'token' on request body",
    });
    return;
  }
  if (!req.body.mac_address) {
    res.send({
      result: false,
      message: "Missing 'mac_address' on request body",
    });
    return;
  }
  if (!req.body.cnpj) {
    res.send({
      result: false,
      message: "Missing 'cnpj' on request body",
    });
    return;
  }
  req.body.cnpj = req.body.cnpj.split(/[^0-9]/).join('');
  req.body.mac_address = `${req.body.mac_address}`
    .toLowerCase()
    .split(/[^a-z0-9]/)
    .join('');

  const empresas = await empresa.findAll({
    where: {
      cnpj: req.body.cnpj,
    },
  });

  if (empresas.length === 0) {
    res.send({
      result: false,
      message: 'CNPJ não encontrado na base de dados',
    });
    return;
  }

  const dispositivos = req.body;

  await dispositivo.create({
    empresa_id: empresas[0].id,
    auth: dispositivos.auth,
    nome: dispositivos.nome,
    mac_address: dispositivos.mac_address,
  });

  res.send({
    result: true,
  });
});
app.post('/haveModifications', jsonParser, async (req, res) => {
  if (!req.headers.authtoken) {
    res.send({
      result: false,
      message: "Missing 'auth' on request Body",
    });
    return;
  }

  const authToken = req.headers.authtoken;

  const dispositivos = await dispositivo.findOne({
    where: { auth: authToken },
  });

  if (dispositivos === null) {
    res.send({
      result: false,
      message: 'Dispositivo não encontrada para o Auth',
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
  whereClause = `empresa_id = ${dispositivos.empresa_id}
    AND ultimo_autor != '${authToken}'
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
app.post('/modifications', jsonParser, async (req, res) => {
  if (!req.body.auth) {
    res.send({
      result: false,
      message: "Missing 'auth' on request Body",
    });
    return;
  }

  const authToken = req.body.auth;

  const results = await dispositivo.findAll({ where: { auth: authToken } });

  if (results.length === 0) {
    // nenhum dispositivo encontrada
    res.send({
      result: false,
      message: 'Dispositivo não encontrada para o Auth',
    });
    return;
  }

  const dispositivos = results[0];

  const result = {
    result: false,
  };

  try {
    if (req.body.action === 'get') {
      const data = await replicacao.findAll({
        limit: 200,
        where: {
          empresa_id: dispositivos.empresa_id,
          data_operacao: {
            [Op.gt]: req.body.since,
          },
          ultimo_autor: {
            [Op.ne]: authToken,
          },
        },
        order: Sequelize.literal(
          `CASE TABELA WHEN 'MOBILE_CLIENTE' THEN '0' WHEN 'MOBILE_CLIENTE_ENDERECO' THEN '1' WHEN 'MOBILE_PEDIDO' THEN '2' WHEN 'MOBILE_PEDIDO_PRODUTOS' THEN '3' ELSE '5' END, data_operacao`
        ),
      });
      const count = await replicacao.count({
        where: {
          empresa_id: dispositivos.empresa_id,
          data_operacao: {
            [Op.gt]: req.body.since,
          },
          ultimo_autor: {
            [Op.ne]: authToken,
          },
        },
      });
      result.data = data;
      result.result = true;
      if (data.length > 0) {
        result.next_since = data[data.length - 1].data_operacao;
      } else {
        result.next_since = req.body.since;
      }
      for (let i = 0; i < result.data.length; i += 1) {
        result.data[i].dados = JSON.stringify(result.data[i].dados);
      }
      result.remaining = count < 200 ? 0 : count - 200;
    } else if (req.body.action === 'new') {
      const valuesMarkers = [];
      const params = [];
      for (let i = 0; i < req.body.modifications.length; i += 1) {
        const timeMS = new Date().getTime();
        const modification = req.body.modifications[i];
        const { dados } = modification;
        valuesMarkers.push('(?,?,?,?,?,?,?)');
        params.push({
          empresa_id: dispositivos.empresa_id,
          uuid: modification.uuid,
          tabela: modification.tabela,
          data_operacao: timeMS + i,
          situacao: modification.situacao,
          dados,
          ultimo_autor: authToken,
        });
      }

      await replicacao.bulkCreate(params, {
        fields: [
          'empresa_id',
          'uuid',
          'tabela',
          'data_operacao',
          'situacao',
          'dados',
          'ultimo_autor',
        ],
        updateOnDuplicate: [
          'data_operacao',
          'situacao',
          'dados',
          'ultimo_autor',
        ],
      });

      result.result = true;
    }
  } catch (e) {
    console.error(e);
  }

  res.send(result);
});

app.get('/download/aplicativo.apk', jsonParser, async (req, res) => {
  if (!fs.existsSync(`${__dirname}/public/download/aplicativo.apk`)) {
    res.send({
      result: false,
      version: '0.0.0',
    });
  }

  res.download(`${__dirname}/public/download/aplicativo.apk`);
});
app.get('/download/Sincronizador.zip', jsonParser, async (req, res) => {
  if (!fs.existsSync(`${__dirname}/public/download/Sincronizador.zip`)) {
    res.send({
      result: false,
      version: '0.0.0',
    });
  }

  res.download(`${__dirname}/public/download/Sincronizador.zip`);
});

app.get('/version/:app/:version', jsonParser, async (req, res) => {
  if (
    !fs.existsSync(
      `${__dirname}/public/version/${req.params.app}/${req.params.version}`
    )
  ) {
    res.send({
      result: false,
      version: '0.0.0',
    });
  }

  res.download(
    `${__dirname}/public/version/${req.params.app}/${req.params.version}`
  );
});

app.get('/version/:app', jsonParser, async (req, res) => {
  if (!fs.existsSync(`${__dirname}/public/version/${req.params.app}`)) {
    res.send({
      result: false,
      version: '0.0.0',
    });
  }

  const files = fs.readdirSync(`${__dirname}/public/version/${req.params.app}`);

  if (files.length === 0) {
    res.send({
      result: false,
      version: '0.0.0',
    });
  } else {
    files.sort((a, b) => b.localeCompare(a));

    const version = files[0].split('.').slice(0, -1).join('.');

    res.send({
      result: true,
      version,
    });
  }
});

app.get('/get-tokens/:mac', jsonParser, async (req, res) => {
  const mac = req.params.mac
    .toLowerCase()
    .split(/[^a-z0-9]/)
    .join('');
  const dispositivos = await dispositivo.findAll({
    where: { mac_address: mac },
  });

  const tokens = [];

  for (const key in dispositivos) {
    tokens.push(dispositivos[key].auth);
  }

  res.send(tokens);
});
app.post('/id-generator/:auth/:tabela/:ID', jsonParser, async (req, res) => {
  if (!req.params.auth) {
    res.send({
      result: false,
      message: "Missing 'token' on request body",
    });
    return;
  }
  if (!req.params.ID) {
    res.send({
      result: false,
      message: 'Missing ID on request body',
    });
    return;
  }
  const authToken = req.params.auth;
  const results = await dispositivo.findAll({ where: { auth: authToken } });

  if (results.length === 0) {
    // nenhum dispositivo encontrada
    res.send({
      result: false,
      message: 'Dispositivo não encontrada para o Auth',
    });
    return;
  }

  const dispositivos = results[0];
  await id_control.create({
    empresa_id: dispositivos.empresa_id,
    tabela: req.params.tabela,
    generated_id: req.params.ID,
  });
  res.send({
    result: true,
    message: 'Registro incluido com sucesso!',
  });
});
app.get('/id-generator/:auth/:tabela', jsonParser, async (req, res) => {
  if (!req.params.auth) {
    res.send({
      result: false,
      message: "Missing 'token' on request body",
    });
    return;
  }

  const authToken = req.params.auth;

  const results = await dispositivo.findAll({ where: { auth: authToken } });

  if (results.length === 0) {
    // nenhum dispositivo encontrada
    res.send({
      result: false,
      message: 'Dispositivo não encontrada para o Auth',
    });
    return;
  }

  const dispositivos = results[0];
  let consulta_id = await id_control.findOne({
    where: {
      empresa_id: dispositivos.empresa_id,
      tabela: req.params.tabela,
    },
  });

  if (consulta_id === null) {
    consulta_id = { ID: 1 };
  } else {
    consulta_id.ID = parseInt(consulta_id.ID, 10) + 1;
  }
  await id_control.create({
    empresa_id: dispositivos.empresa_id,
    tabela: req.params.tabela,
    generated_id: consulta_id.ID,
  });

  res.send({
    result: true,
    ID: consulta_id.ID,
  });
});

app.get('/id-watcher/:auth/:tabela', jsonParser, async (req, res) => {
  if (!req.params.auth) {
    res.send({
      result: false,
      message: "Missing 'token' on request body",
    });
    return;
  }

  const authToken = req.params.auth;

  const results = await dispositivo.findAll({ where: { auth: authToken } });

  if (results.length === 0) {
    // nenhum dispositivo encontrada
    res.send({
      result: false,
      message: 'Dispositivo não encontrada para o Auth',
    });
    return;
  }

  const dispositivos = results[0];

  let consulta_id = await id_control.findOne({
    where: {
      empresa_id: dispositivos.empresa_id,
      tabela: req.params.tabela,
    },
  });

  if (consulta_id === null) {
    consulta_id = { ID: 1 };
  } else {
    consulta_id.ID = parseInt(consulta_id.ID, 10);
  }

  res.send({
    result: true,
    ID: consulta_id.ID,
  });
});

require('./retro/chamadas_aplicativo.js')(app, jsonParser);
require('./routes.new.js')(app, jsonParser);

app.all('*', jsonParser, (req, res) => {
  res.send('Rota invalida');
});

process.on('uncaughtException', (err) => {
  console.error(`Uncaught Exception: ${err.message} ${err.stack}`);
});

app.listen(3000, async () => {
  console.info('Servidor Node escutando em 3000!');
});
