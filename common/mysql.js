/* eslint-disable import/no-self-import */
/* eslint-disable global-require */
const mysql = require('mysql');

module.exports = (host, port, user, password, database) => {
  let connection = null;

  let connectionTimer = null;

  async function startConnection() {
    if (connection == null) {
      connection = await mysql.createConnection({
        host,
        port,
        user,
        password,
        database,
      });
      connection.on('error', (e) => {
        console.error(e);
        setTimeout(async () => {
          startConnection();
        }, 1000);
      });
      connection.on('end', () => {
        setTimeout(async () => {
          startConnection();
        }, 1000);
      });
    }
    if (connectionTimer) {
      clearTimeout(connectionTimer);
    }
    connectionTimer = setTimeout(async () => {
      connection.destroy();
      connection = null;
    }, 5000);
  }
  async function execute(sql, params, tentativas = 5) {
    await startConnection();
    return new Promise((res) => {
      connection.query(sql, params, (error) => {
        if (error) {
          console.error(error);
          setTimeout(async () => {
            if (tentativas - 1 > 0) {
              startConnection();
              res(await execute(sql, params, tentativas - 1));
            } else {
              res(null);
            }
          }, 1000);
          return;
        }
        res({ OK: 'OK' });
      });
    });
  }
  async function AddColumn(table, column, columnOPT) {
    return execute(`CALL ADD_COLUMN(?, ?, ?);`, [table, column, columnOPT]);
  }
  async function query(sql, params, tentativas = 5) {
    await startConnection();
    return new Promise((res) => {
      connection.query(sql, params, (error, results) => {
        if (error) {
          console.error(error);
          setTimeout(async () => {
            if (tentativas - 1 > 0) {
              startConnection();
              res(await query(sql, params, tentativas - 1));
            } else {
              res(null);
            }
          }, 1000);
          return;
        }
        res(results);
      });
    });
  }

  async function queryOne(sql, params, tentativas) {
    const results = await query(sql, params, tentativas);
    if (results.length > 0) {
      return results[0];
    }
    return null;
  }

  async function getBancoCliente(empresa_id) {
    const dadosEmpresa = await queryOne('SELECT * FROM empresa WHERE id = ?', [
      empresa_id,
    ]);
    let dadosConexao = {};
    try {
      if (dadosEmpresa.dados_conexao == null) {
        throw new Error('Sem dados de conexão');
      }
      dadosConexao = JSON.parse(dadosEmpresa.dados_conexao);
    } catch (error) {
      dadosConexao = {
        MYSQL_HOST: process.env.MYSQL_HOST,
        MYSQL_PORT: process.env.MYSQL_PORT,
        MYSQL_USER: process.env.MYSQL_USER,
        MYSQL_PASS: process.env.MYSQL_PASS,
        MYSQL_BASE: process.env.MYSQL_BASE,
      };
    }

    const databaseCliente = require('./mysql')(
      dadosConexao.MYSQL_HOST,
      dadosConexao.MYSQL_PORT,
      dadosConexao.MYSQL_USER,
      dadosConexao.MYSQL_PASS,
      dadosConexao.MYSQL_BASE
    );
    return databaseCliente;
  }
  return {
    query,
    queryOne,
    getBancoCliente,
    execute,
    AddColumn,
  };
};
