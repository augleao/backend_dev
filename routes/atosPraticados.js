// routes/atosPraticados.js
const express = require('express');
const router = express.Router();
const pool = require('../db'); // ajuste para seu pool/conexão

// GET /api/atos-praticados?data=YYYY-MM-DD
router.get('/api/atos-praticados', authenticate, async (req, res) => {
  const { data } = req.query;
  console.log('[GET] /api/atos-praticados chamada com data:', data);
  try {
    let query = 'SELECT * FROM atos_praticados';
    let params = [];
    if (data) {
      query += ' WHERE data = $1';
      params.push(data);
    }
    query += ' ORDER BY hora ASC, id ASC';
    const result = await pool.query(query, params);
    console.log('[GET] /api/atos-praticados - retornando', result.rows.length, 'atos');
    res.json({ atos: result.rows });
  } catch (err) {
    console.error('[GET] /api/atos-praticados - erro:', err);
    res.status(500).json({ error: 'Erro ao buscar atos praticados.' });
  }
});

// POST /api/atos-praticados
router.post('/api/atos-praticados', authenticate, async (req, res) => {
  console.log('[POST] /api/atos-praticados - body recebido:', req.body);
  const {
    data,
    hora,
    codigo,
    tributacao,
    descricao,
    quantidade,
    valor_unitario,
    pagamentos,
    usuario
  } = req.body;

  // Log dos campos recebidos
  console.log('[POST] Campos recebidos:', {
    data, hora, codigo, tributacao, descricao, quantidade, valor_unitario, pagamentos, usuario
  });

  try {
    const result = await pool.query(
      `INSERT INTO atos_praticados
      (data, hora, codigo, tributacao, descricao, quantidade, valor_unitario, pagamentos, usuario)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        data,
        hora,
        codigo,
        tributacao || null,
        descricao,
        quantidade,
        valor_unitario,
        JSON.stringify(pagamentos),
        usuario
      ]
    );
    console.log('[POST] /api/atos-praticados - inserido com sucesso:', result.rows[0]);
    res.status(201).json({ ato: result.rows[0] });
  } catch (err) {
    console.error('[POST] /api/atos-praticados - erro ao inserir:', err);
    res.status(500).json({ error: 'Erro ao salvar ato praticado.', details: err.message });
  }
});

// DELETE /api/s/:id
router.delete('/api/s/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  console.log('[DELETE] /api/atos-praticados chamada para id:', id);
  try {
    await pool.query('DELETE FROM atos_praticados WHERE id = $1', [id]);
    console.log('[DELETE] /api/atos-praticados - removido id:', id);
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE] /api/atos-praticados - erro:', err);
    res.status(500).json({ error: 'Erro ao remover ato praticado.' });
  }
});

module.exports = router;