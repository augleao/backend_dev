const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/codigos-gratuitos?search=texto
router.get('/', async (req, res) => {
  const { search } = req.query;
  console.log('[codigos-gratuitos] Requisição recebida. search:', search);

  try {
    let query = 'SELECT codigo, descricao FROM codigos_gratuitos';
    let params = [];
    if (search) {
      query += ' WHERE codigo ILIKE $1 OR descricao ILIKE $1';
      params.push(`%${search}%`);
      console.log('[codigos-gratuitos] Query com filtro:', query, params);
    } else {
      console.log('[codigos-gratuitos] Query sem filtro:', query);
    }
    query += ' ORDER BY codigo ASC LIMIT 20';
    const result = await pool.query(query, params);
    console.log('[codigos-gratuitos] Resultados encontrados:', result.rowCount);
    res.json({ codigos: result.rows });
  } catch (err) {
    console.error('[codigos-gratuitos] Erro:', err);
    res.status(500).json({ error: 'Erro ao buscar códigos gratuitos.' });
  }
});

module.exports = router;