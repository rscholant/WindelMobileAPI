'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class replicacao extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      replicacao.belongsTo(models.empresa, {
        foreignKey: 'id',
      });
    }
  }
  replicacao.init(
    {
      empresa_id: DataTypes.INTEGER,
      uuid: DataTypes.STRING,
      tabela: DataTypes.STRING,
      data_operacao: DataTypes.BIGINT,
      situacao: DataTypes.INTEGER,
      dados: DataTypes.JSON,
      ultimo_autor: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: 'replicacao',
    }
  );
  return replicacao;
};
