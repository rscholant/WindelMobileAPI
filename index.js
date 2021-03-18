/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const jsonParser = bodyParser.json({ limit: '50mb' });
const path = require('path');

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
const mysql = require('./common/mysql');

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

  const empresa = req.body;

  empresa.cnpj = empresa.cnpj.split(/[^0-9]/).join('');

  let empresas = await databaseReplicacao.query(
    'SELECT * FROM empresa WHERE cnpj = ?',
    [empresa.cnpj]
  );

  if (empresas.length === 0) {
    await databaseReplicacao.query(
      'INSERT INTO empresa (nome, cnpj) VALUES (?,?)',
      [empresa.nome, empresa.cnpj]
    );

    empresas = await databaseReplicacao.query(
      'SELECT * FROM empresa WHERE cnpj = ?',
      [empresa.cnpj]
    );

    await databaseReplicacao.query(
      'INSERT INTO dispositivo (empresa_id, auth, nome) VALUES (?,?,?)',
      [empresas[0].id, empresa.auth, 'Windel ERP']
    );
  } else {
    await databaseReplicacao.query('UPDATE empresa SET NOME = ? WHERE id = ?', [
      empresa.nome,
      empresas[0].id,
    ]);
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

  const empresas = await databaseReplicacao.query(
    'SELECT * FROM empresa WHERE cnpj = ?',
    [req.body.cnpj]
  );

  if (empresas.length === 0) {
    res.send({
      result: false,
      message: 'CNPJ não encontrado na base de dados',
    });
    return;
  }
  const empresa = empresas[0];

  await databaseReplicacao.query(
    'DELETE FROM dispositivo WHERE empresa_id = ? AND mac_address = ?',
    [empresa.id, req.body.mac_address]
  );

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

  const empresas = await databaseReplicacao.query(
    'SELECT * FROM empresa WHERE cnpj = ?',
    [req.body.cnpj]
  );

  if (empresas.length === 0) {
    res.send({
      result: false,
      message: 'CNPJ não encontrado na base de dados',
    });
    return;
  }

  const dispositivo = req.body;

  await databaseReplicacao.query(
    'INSERT INTO dispositivo (empresa_id, auth, nome, mac_address) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE auth = VALUES(auth), nome = VALUES(nome)',
    [
      empresas[0].id,
      dispositivo.auth,
      dispositivo.nome,
      dispositivo.mac_address,
    ]
  );

  res.send({
    result: true,
  });
});

app.post('/modifications', jsonParser, async (req, res) => {
  if (!req.body.auth) {
    // no auth = no modifications for ya
    res.send({
      result: false,
      message: "Missing 'auth' on request Body",
    });
    return;
  }

  const authToken = req.body.auth;

  const results = await databaseReplicacao.query(
    'SELECT * FROM dispositivo WHERE auth = ?',
    [authToken]
  );

  if (results.length === 0) {
    // nenhum dispositivo encontrada
    res.send({
      result: false,
      message: 'Dispositivo não encontrada para o Auth',
    });
    return;
  }

  const dispositivo = results[0];

  const databaseCliente = await databaseReplicacao.getBancoCliente(
    dispositivo.empresa_id
  );
  const result = {
    result: false,
  };

  try {
    if (req.body.action === 'get') {
      const data = await databaseCliente.query(
        "SELECT * FROM replicacao FORCE INDEX (idx_replicacao_empresa_id_data_operacao_ultimo_autor) WHERE empresa_id= ? AND data_operacao > ? AND ultimo_autor != ? ORDER BY CASE TABELA WHEN 'MOBILE_CLIENTE' THEN '0' WHEN 'MOBILE_CLIENTE_ENDERECO' THEN '1' WHEN 'MOBILE_PEDIDO' THEN '2' WHEN 'MOBILE_PEDIDO_PRODUTOS' THEN '3' ELSE '5' END, data_operacao LIMIT 100",
        [dispositivo.empresa_id, req.body.since, authToken]
      );
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
          dispositivo.empresa_id,
          modification.uuid,
          modification.tabela,
          timeMS,
          modification.situacao,
          dados,
          authToken
        );
      }
      await databaseCliente.query(
        `
                INSERT INTO replicacao (empresa_id,uuid,tabela,data_operacao,situacao,dados,ultimo_autor)
                    VALUES ${valuesMarkers.join(',')}
                ON DUPLICATE KEY UPDATE data_operacao = VALUES(data_operacao), situacao = VALUES(situacao), dados = IF(VALUES(situacao) != 2, VALUES(dados), dados), ultimo_autor = VALUES(ultimo_autor)
            `,
        params
      );
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
  const dispositivos = await databaseReplicacao.query(
    `SELECT * FROM dispositivo WHERE mac_address = ?`,
    [mac]
  );

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

  const results = await databaseReplicacao.query(
    'SELECT * FROM dispositivo WHERE auth = ?',
    [authToken]
  );

  if (results.length === 0) {
    // nenhum dispositivo encontrada
    res.send({
      result: false,
      message: 'Dispositivo não encontrada para o Auth',
    });
    return;
  }

  const dispositivo = results[0];

  await databaseReplicacao.execute(
    `INSERT INTO id_control (empresa_id, tabela, generated_id)
      VALUES (?, ? , ?)
      ON DUPLICATE KEY UPDATE generated_id = VALUES(generated_id)`,
    [dispositivo.empresa_id, req.params.tabela, req.params.ID]
  );
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

  const results = await databaseReplicacao.query(
    'SELECT * FROM dispositivo WHERE auth = ?',
    [authToken]
  );

  if (results.length === 0) {
    // nenhum dispositivo encontrada
    res.send({
      result: false,
      message: 'Dispositivo não encontrada para o Auth',
    });
    return;
  }

  const dispositivo = results[0];

  let consulta_id = await databaseReplicacao.queryOne(
    `SELECT generated_id ID FROM id_control
    WHERE empresa_id = ?
      and tabela = ? `,
    [dispositivo.empresa_id, req.params.tabela]
  );

  if (consulta_id === null) {
    consulta_id = { ID: 1 };
  } else {
    consulta_id.ID = parseInt(consulta_id.ID, 10) + 1;
  }

  await databaseReplicacao.execute(
    `INSERT INTO id_control (empresa_id, tabela, generated_id)
      VALUES (?, ? , ?)
      ON DUPLICATE KEY UPDATE generated_id = VALUES(generated_id)`,
    [dispositivo.empresa_id, req.params.tabela, consulta_id.ID]
  );
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

  const results = await databaseReplicacao.query(
    'SELECT * FROM dispositivo WHERE auth = ?',
    [authToken]
  );

  if (results.length === 0) {
    // nenhum dispositivo encontrada
    res.send({
      result: false,
      message: 'Dispositivo não encontrada para o Auth',
    });
    return;
  }

  const dispositivo = results[0];

  let consulta_id = await databaseReplicacao.queryOne(
    `SELECT generated_id ID FROM id_control
    WHERE empresa_id = ?
      and tabela = ? `,
    [dispositivo.empresa_id, req.params.tabela]
  );

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
