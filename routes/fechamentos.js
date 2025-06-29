const express = require('express');
const router = express.Router();
const pool = require('../db');

// Exemplo de middleware de autenticação (ajuste conforme seu projeto)
const autenticar = (req, res, next) => {
  // Aqui você deve validar o token e preencher req.user com o nome do usuário
  // Exemplo fictício:
  req.user = { nome: 'Alessandra Dias' };
  next();
};

router.get('/meus-fechamentos', autenticar, async (req, res) => {
  try {
    const usuario = req.user?.nome;
    if (!usuario) return res.status(401).json({ erro: 'Usuário não autenticado' });

    // Busca todos os atos pagos do usuário no banco PostgreSQL
    const result = await pool.query(
      `SELECT
  data,
  codigo,
  descricao,
  SUM(quantidade) AS total_quantidade,
  SUM(valor_unitario) AS total_valor,
  usuario
FROM
  public.atos_pagos
WHERE
  usuario = $1
  AND codigo = '0001'
GROUP BY
  data, codigo, descricao, usuario
ORDER BY
  data DESC;`,
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