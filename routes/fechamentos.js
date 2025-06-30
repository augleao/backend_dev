const express = require('express');
const router = express.Router();
const pool = require('../db');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'uma_chave_super_secreta';

// Middleware de autenticação
const autenticar = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ erro: 'Token não fornecido' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // O payload do token deve conter o nome do usuário
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido' });
  }
};

router.get('/meus-fechamentos', autenticar, async (req, res) => {
  try {
    const usuario = req.user?.nome;
    if (!usuario) return res.status(401).json({ erro: 'Usuário não autenticado' });

    // Busca atos pagos do usuário com codigo 0001 ou 0005
    const result = await pool.query(
      `SELECT
        data,
        hora,
        codigo,
        descricao,
        quantidade AS total_quantidade,
        valor_unitario AS total_valor,
        usuario
      FROM
        public.atos_pagos
      WHERE
        usuario = $1
        AND codigo IN ('0001', '0005')
      ORDER BY
        data DESC, hora DESC;`,
      [usuario]
    );
    console.log('Usuario:', usuario);
    console.log('Fechamentos encontrados:', result.rows);
    res.json({ fechamentos: result.rows });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar fechamentos' });
  }
});

module.exports = router;