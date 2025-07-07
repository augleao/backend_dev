const express = require('express');
const router = express.Router();
const pool = require('../db'); // ajuste para seu pool/conexão

// Buscar atos praticados por data (e opcionalmente por usuário)
router.get('/', async (req, res) => {
  const { data, usuario } = req.query;
  try {
    let query = 'SELECT * FROM atos_praticados WHERE 1=1';
    let params = [];
    if (data) {
      params.push(data);
      query += ` AND data = $${params.length}`;
    }
    if (usuario) {
      params.push(usuario);
      query += ` AND usuario = $${params.length}`;
    }
    query += ' ORDER BY hora ASC, id ASC';
    const result = await pool.query(query, params);
    res.json({ atos: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar atos praticados.' });
  }
});

// Criar novo ato praticado
router.post('/', async (req, res) => {
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
    res.status(201).json({ ato: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar ato praticado.' });
  }
});

// Remover ato praticado por ID
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM atos_praticados WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover ato praticado.' });
  }
});

module.exports = router;