const { DataTypes } = require('sequelize');
const sequelize = require('../db'); // ajuste o caminho para sua instância do Sequelize

const aixaDiario = sequelize.define('CaixaDiario', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  data: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  hora: {
    type: DataTypes.STRING,
    allowNull: true
  },
  codigo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  descricao: {
    type: DataTypes.STRING,
    allowNull: true
  },
  quantidade: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  valor_unitario: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  usuario: {
    type: DataTypes.STRING,
    allowNull: false
  }
  // Adicione outros campos conforme necessário
}, {
  tableName: 'atos_pagos', // nome da tabela no banco
  timestamps: false        // se não usar createdAt/updatedAt
});

module.exports = { caixaDiario };