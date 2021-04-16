'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class dispositivo extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      dispositivo.belongsTo(models.empresa, {
        foreignKey: 'id',
      });
    }
  }
  dispositivo.init(
    {
      empresa_id: DataTypes.INTEGER,
      auth: DataTypes.STRING,
      nome: DataTypes.STRING,
      mac_address: DataTypes.STRING,
      token_onesignal: DataTypes.STRING,
      app_version: DataTypes.INTEGER,
    },
    {
      sequelize,
      modelName: 'dispositivo',
    }
  );
  return dispositivo;
};
