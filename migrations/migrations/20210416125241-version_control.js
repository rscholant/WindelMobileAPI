'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable(
      'version_control',
      {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER,
        },
        version: {
          allowNull: false,
          type: Sequelize.INTEGER,
        },
        message: {
          allowNull: true,
          type: Sequelize.STRING,
        },
        validity: {
          allowNull: false,
          type: Sequelize.DATE,
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
      { tableName: 'version_control' }
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('version_control');
  },
};
