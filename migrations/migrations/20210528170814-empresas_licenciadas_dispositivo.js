'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('dispositivo', 'empresas_licenciadas', {
      type: Sequelize.JSON,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('dispositivo', 'empresas_licenciadas');
  },
};
