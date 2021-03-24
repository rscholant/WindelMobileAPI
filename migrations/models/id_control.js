'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class id_control extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      id_control.belongsTo(models.empresa, {
        foreignKey: 'id',
      });
    }
  }
  id_control.init(
    {
      empresa_id: DataTypes.INTEGER,
      tabela: DataTypes.STRING,
      generated_id: DataTypes.INTEGER,
    },
    {
      sequelize,
      modelName: 'id_control',
    }
  );
  return id_control;
};
