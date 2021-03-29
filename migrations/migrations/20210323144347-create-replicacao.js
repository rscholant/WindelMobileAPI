'use strict';

const { query } = require('express');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface
      .createTable('replicacao', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER,
        },
        empresa_id: {
          type: Sequelize.INTEGER,
          references: {
            model: 'empresa',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          ondDelete: 'SET NULL',
        },
        uuid: {
          type: Sequelize.STRING,
        },
        tabela: {
          type: Sequelize.STRING,
        },
        data_operacao: {
          type: Sequelize.BIGINT,
        },
        situacao: {
          type: Sequelize.INTEGER,
        },
        dados: {
          type: Sequelize.JSON,
        },
        ultimo_autor: {
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
      })
      .then(() =>
        queryInterface.addIndex('replicacao', ['uuid', 'tabela'], {
          unique: true,
        })
      )
      .then(() =>
        queryInterface.addIndex(
          'replicacao',
          ['empresa_id', 'tabela', 'data_operacao'],
          { unique: false }
        )
      )
      .then(() =>
        queryInterface.addIndex(
          'replicacao',
          ['empresa_id', 'tabela', 'data_operacao', 'ultimo_autor'],
          { unique: false }
        )
      );
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('replicacao');
  },
};
