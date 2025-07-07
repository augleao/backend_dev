const express = require('express');
const router = express.Router();
const pool = require('../db'); // ajuste para seu pool/conexão

// Buscar códigos gratuitos por termo
router.get('/', async (req, res) => {
  const { search } = req.query;
  try {
    let query = 'SELECT codigo, descricao FROM codigos_gratuitos';
    let params = [];
    if (search) {
      query += ' WHERE codigo ILIKE $1 OR descricao ILIKE $1';
      params.push(`%${search}%`);
    }
    query += ' ORDER BY codigo ASC LIMIT 20';
    const result = await pool.query(query, params);
    res.json({ codigos: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar códigos gratuitos.' });
  }
});

module.exports = router;