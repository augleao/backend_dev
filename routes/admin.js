// routes/admin.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate, requireRegistrador } = require('../middlewares/auth');

// Listar todos os usuários (protegida)
router.get('/usuarios', authenticate, requireRegistrador, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, email, serventia, cargo FROM public.users ORDER BY nome'
    );
    res.json({ usuarios: result.rows });
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

// Editar usuário (protegida)
router.put('/usuarios/:id', authenticate, requireRegistrador, async (req, res) => {
  const { id } = req.params;
  const { nome, serventia, cargo } = req.body;
  try {
    await pool.query(
      'UPDATE public.users SET nome = $1, serventia = $2, cargo = $3 WHERE id = $4',
      [nome, serventia, cargo, id]
    );
    res.json({ message: 'Usuário atualizado com sucesso.' });
  } catch (err) {
    console.error('Erro ao atualizar usuário:', err);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

// Excluir usuário (protegida)
router.delete('/usuarios/:id', authenticate, requireRegistrador, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM public.users WHERE id = $1', [id]);
    res.json({ message: 'Usuário excluído com sucesso.' });
  } catch (err) {
    console.error('Erro ao excluir usuário:', err);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

module.exports = router;