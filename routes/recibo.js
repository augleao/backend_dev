const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/recibo/:protocolo
router.get('/:protocolo', async (req, res) => {
  const { protocolo } = req.params;
  try {
    const result = await pool.query(
      `SELECT p.*, u.nome as usuario_nome FROM pedidos p LEFT JOIN users u ON p.usuario = u.nome WHERE p.protocolo = $1`,
      [protocolo]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recibo não encontrado' });
    }
    const recibo = result.rows[0];
    res.json(recibo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar recibo' });
  }
});

// Outras rotas de recibo podem ser adicionadas aqui

module.exports = router;
