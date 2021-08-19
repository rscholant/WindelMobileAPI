const dbVersion = 3;

module.exports = async (databaseReplicacao) => {
  let version = 0;
  try {
    const serverInfo = await databaseReplicacao.queryOne(
      'SELECT valor FROM server_info where chave = ?',
      ['version'],
      1
    );
    version = serverInfo !== null ? parseInt(serverInfo.valor, 10) : 0;
  } catch (error) {
    version = 0;
  }
  let newVersion = null;
  if (dbVersion > version) {
    console.info('Inicializando processo de atualização do server.');
    if (version < 1) {
      await databaseReplicacao.execute(
        'CREATE TABLE IF NOT EXISTS `sinc_replicacao`.`server_info` (`chave` VARCHAR(50) NOT NULL, `valor` VARCHAR(200) NULL, PRIMARY KEY (`chave`))',
        [],
        1
      );
      newVersion = 0;
    }
    if (version < 2) {
      try {
        await databaseReplicacao.AddColumn(
          'empresa',
          'dados_conexao',
          'JSON NULL AFTER cnpj'
        );
      } catch (error) {
        console.error(error);
      }
      newVersion = 2;
    }
    if (version < 3) {
      await databaseReplicacao.execute(
        'CREATE TABLE `sinc_replicacao`.`id_control` (`empresa_id` INT UNSIGNED NOT NULL,' +
          ' `tabela` VARCHAR(200) NOT NULL, `generated_id` INT NULL, PRIMARY KEY (`empresa_id`, `tabela`), ' +
          ' CONSTRAINT `fk_id_control_x_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`) ON UPDATE CASCADE ) ' +
          ' ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8;',
        [],
        1
      );
      newVersion = 3;
    }
    if (newVersion !== null) {
      await databaseReplicacao.execute(
        `INSERT INTO server_info (chave, valor) values (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
        ['version', newVersion + 1]
      );
    }
    console.info('Processo terminado com sucesso!');
  }
};
