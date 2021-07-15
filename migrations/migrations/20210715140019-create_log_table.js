'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable(
      'logs',
      {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER,
        },
        device_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          foreignKey: true,
          references: {
            model: 'dispositivo',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          ondDelete: 'SET NULL',
        },
        description: {
          allowNull: true,
          type: Sequelize.STRING,
        },
        logDate: {
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
      { tableName: 'logs' }
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('logs');
  },
};
