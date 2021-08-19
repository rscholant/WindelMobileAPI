<<<<<<< HEAD
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
=======
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
>>>>>>> ce731d5f190eeae2dda9600e903a768e6e09c83b
