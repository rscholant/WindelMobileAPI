'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class logs extends Model {
    static associate(models) {
      logs.belongsTo(models.dispositivo, {
        foreignKey: 'id',
      });
    }
  }
  logs.init(
    {
      device_id: DataTypes.INTEGER,
      description: DataTypes.STRING,
      logDate: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'logs',
    }
  );
  return logs;
};
