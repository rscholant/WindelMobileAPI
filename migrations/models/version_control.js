'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class version_control extends Model {}
  version_control.init(
    {
      version: DataTypes.INTEGER,
      message: DataTypes.STRING,
      validity: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'version_control',
    }
  );
  return version_control;
};
