const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/pedidos/:protocolo
router.get('/:protocolo', async (req, res) => {
  const { protocolo } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM pedidos WHERE protocolo = $1',
      [protocolo]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }
    const pedido = result.rows[0];
    res.json({ ...pedido, status: pedido.status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar pedido' });
  }
});

// Outras rotas de pedidos podem ser adicionadas aqui

module.exports = router;
