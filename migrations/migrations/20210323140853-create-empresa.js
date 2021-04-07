'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable(
      'empresa',
      {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER,
        },
        nome: {
          type: Sequelize.STRING,
        },
        cnpj: {
          type: Sequelize.STRING,
        },
        dados_conexao: {
          type: Sequelize.STRING,
        },
        createdAt: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW,
        },
        updatedAt: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW,
        },
      },
      { tableName: 'empresa' }
    );
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('empresa');
  },
};
