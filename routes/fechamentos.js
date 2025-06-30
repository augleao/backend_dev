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

    const result = await pool.query(
      `SELECT
        f.data,
        f.hora AS hora_fechamento,
        f.valor_unitario AS valor_final,
        i.valor_unitario AS valor_inicial
      FROM
        public.atos_pagos f
      LEFT JOIN public.atos_pagos i
        ON f.data = i.data
        AND f.usuario = i.usuario
        AND i.codigo = '0005'
      WHERE
        f.usuario = $1
        AND f.codigo = '0001'
      ORDER BY
        f.data DESC, f.hora DESC;`,
      [usuario]
    );
    res.json({ fechamentos: result.rows });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar fechamentos' });
  }
});

module.exports = router;