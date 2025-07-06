
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate } = require('../middlewares/auth');

// Buscar atos pagos por data e usuário
router.get('/', authenticate, async (req, res) => {
  const data = req.query.data;
  const usuario = req.user;

  if (!data) return res.status(400).json({ message: 'Parâmetro data é obrigatório.' });
  if (!usuario) return res.status(401).json({ message: 'Usuário não autenticado.' });

  try {
    const result = await pool.query(
      `SELECT id, data, hora, codigo, descricao, quantidade, valor_unitario, pagamentos, usuario
       FROM atos_pagos
       WHERE DATE(data) = $1 AND usuario = $2
       ORDER BY hora`,
      [data, usuario.email]
    );
    res.json({ CaixaDiario: result.rows });
  } catch (err) {
    console.error('Erro ao buscar atos pagos:', err);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

// POST, DELETE, etc. podem ser adicionados aqui

module.exports = router;