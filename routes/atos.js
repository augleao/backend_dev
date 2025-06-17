// routes/atos.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate, requireRegistrador } = require('../middlewares/auth');

// Listar atos com busca
router.get('/', authenticate, async (req, res) => {
  const search = req.query.search || '';
  try {
    const result = await pool.query(
      `SELECT id, codigo, descricao, valor_final FROM atos
       WHERE codigo ILIKE $1 OR descricao ILIKE $1
       ORDER BY codigo
       LIMIT 20`,
      [`%${search}%`]
    );
    res.json({ atos: result.rows });
  } catch (err) {
    console.error('Erro ao listar atos:', err);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

// Outras rotas: GET /:id, PUT /:id, POST /, DELETE / podem ser adicionadas aqui

module.exports = router;