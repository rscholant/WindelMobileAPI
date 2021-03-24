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

const databaseReplicacao = require('./common/mysql')(
  process.env.MYSQL_HOST,
  process.env.MYSQL_PORT,
  process.env.MYSQL_USER,
  process.env.MYSQL_PASS,
  process.env.MYSQL_BASE
);

const checkVersion = require('./util/checkVersion.js');

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
        dados_conexao: emp_data.dados_conexao
          ? JSON.stringify(emp_data.dados_conexao)
          : '',
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
  await dispositivo.delete({
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

app.post('/modifications', jsonParser, async (req, res) => {
  if (!req.body.auth) {
    res.send({
      result: false,
      message: "Missing 'auth' on request Body",
    });
    return;
  }

  const authToken = req.body.auth;

  const results = dispositivo.findAll({ where: { auth: authToken } });

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
        limit: 100,
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
      result.data = data;
      result.result = true;
      if (data.length > 0) {
        result.next_since = data[data.length - 1].data_operacao;
      } else {
        result.next_since = req.body.since;
      }
    } else if (req.body.action === 'new') {
      const valuesMarkers = [];
      const params = [];
      for (let i = 0; i < req.body.modifications.length; i += 1) {
        const timeMS = new Date().getTime();
        const modification = req.body.modifications[i];
        const dados = JSON.stringify(modification.dados);
        valuesMarkers.push('(?,?,?,?,?,?,?)');
        params.push(
          dispositivos.empresa_id,
          modification.uuid,
          modification.tabela,
          timeMS,
          modification.situacao,
          dados,
          authToken
        );
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
  let consulta_id = await id_control.findAll({
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

  let consulta_id = await id_control.findAll({
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

// RETRO COMPATIBILIDADE COM O APLICATIVO escrito no Android Studio
require('./retro/chamadas_aplicativo.js')(app, jsonParser, databaseReplicacao);

app.all('*', jsonParser, (req, res) => {
  res.send('Rota invalida');
});

process.on('uncaughtException', (err) => {
  console.error(`Uncaught Exception: ${err.message} ${err.stack}`);
});

/*
setTimeout(() => {
  process.exit(1);
}, 600000);
*/

app.listen(3000, async () => {
  await checkVersion(databaseReplicacao);
  console.info('Servidor Node escutando em 3000!');
});
