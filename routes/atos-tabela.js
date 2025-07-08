const express = require('express');
const router = express.Router();
const pool = require('../db');

// Middleware de autenticação (ajuste conforme seu sistema)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('[atos-tabela][auth] Authorization header:', authHeader);
  if (!token) {
    console.log('[atos-tabela][auth] Token não fornecido!');
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }

  // Aqui você pode validar o token se desejar
  // jwt.verify(token, process.env.JWT_SECRET, (err, user) => { ... });

  next();
};

// Buscar atos por data
router.get('/api/atos-tabela', authenticateToken, async (req, res) => {
  const { data } = req.query;
  console.log('[atos-tabela][GET] Requisição recebida. Query:', req.query);

  try {
    let query = `
      SELECT 
        id,
        data,
        hora,
        codigo,
        tributacao,
        descricao,
        quantidade,
        valor_unitario,
        pagamentos,
        detalhes_pagamentos,
        created_at
      FROM atos_tabela
    `;
    let params = [];
    if (data) {
      query += ' WHERE data = $1';
      params.push(data);
    }
    query += ' ORDER BY data DESC, hora DESC, created_at DESC';

    console.log('[atos-tabela][GET] Query:', query, 'Params:', params);

    const result = await pool.query(query, params);

    console.log('[atos-tabela][GET] Resultados encontrados:', result.rowCount);

    res.json({
      success: true,
      atos: result.rows,
      total: result.rowCount
    });

  } catch (error) {
    console.error('[atos-tabela][GET] Erro ao buscar atos:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Erro ao buscar atos'
    });
  }
});

// POST /api/atos-tabela
router.post('/api/atos-tabela', authenticateToken, async (req, res) => {
  console.log('[atos-tabela][POST] Body recebido:', req.body);

  const {
    data,
    hora,
    codigo,
    tributacao,
    descricao,
    quantidade,
    valor_unitario,
    pagamentos,
    detalhes_pagamentos
  } = req.body;

  // Validações básicas
  if (!data || !hora || !codigo || !descricao) {
    console.log('[atos-tabela][POST] Campos obrigatórios faltando!');
    return res.status(400).json({
      error: 'Campos obrigatórios: data, hora, codigo, descricao'
    });
  }

  try {
    const query = `
      INSERT INTO atos_tabela (
        data,
        hora,
        codigo,
        tributacao,
        descricao,
        quantidade,
        valor_unitario,
        pagamentos,
        detalhes_pagamentos
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const params = [
      data,
      hora,
      codigo,
      tributacao || null,
      descricao,
      quantidade || 1,
      valor_unitario || 0,
      typeof pagamentos === 'object' ? JSON.stringify(pagamentos) : pagamentos,
      detalhes_pagamentos || null
    ];

    console.log('[atos-tabela][POST] Query INSERT:', query);
    console.log('[atos-tabela][POST] Params:', params);

    const result = await pool.query(query, params);

    console.log('[atos-tabela][POST] Ato inserido com sucesso:', result.rows[0]);

    res.status(201).json({
      success: true,
      message: 'Ato adicionado com sucesso',
      ato: result.rows[0]
    });

  } catch (error) {
    console.error('[atos-tabela][POST] Erro ao inserir ato:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Erro ao adicionar ato'
    });
  }
});

// DELETE /api/atos-tabela/:id
router.delete('/api/atos-tabela/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  console.log('[atos-tabela][DELETE] Requisição para remover ID:', id);

  if (!id || isNaN(id)) {
    console.log('[atos-tabela][DELETE] ID inválido!');
    return res.status(400).json({
      error: 'ID inválido'
    });
  }

  try {
    const query = 'DELETE FROM atos_tabela WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);

    if (result.rowCount === 0) {
      console.log('[atos-tabela][DELETE] Ato não encontrado para remoção.');
      return res.status(404).json({
        error: 'Ato não encontrado'
      });
    }

    console.log('[atos-tabela][DELETE] Ato removido:', result.rows[0]);

    res.json({
      success: true,
      message: 'Ato removido com sucesso',
      ato: result.rows[0]
    });

  } catch (error) {
    console.error('[atos-tabela][DELETE] Erro ao remover ato:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Erro ao remover ato'
    });
  }
});

module.exports = router;

// ============================================
// INSTRUÇÕES PARA INTEGRAÇÃO NO APP PRINCIPAL
// ============================================

/*
1. No seu arquivo principal (app.js ou server.js), adicione:

const atosTabela = require('./routes/atos-tabela'); // Ajuste o caminho
app.use('/api/atos-tabela', atosTabela);

2. Certifique-se de que a tabela existe no PostgreSQL:

CREATE TABLE IF NOT EXISTS atos_tabela (
  id SERIAL PRIMARY KEY,
  data DATE NOT NULL,
  hora TIME NOT NULL,
  codigo VARCHAR(10) NOT NULL,
  tributacao VARCHAR(255),
  descricao TEXT NOT NULL,
  quantidade INTEGER DEFAULT 1,
  valor_unitario DECIMAL(10,2) DEFAULT 0,
  pagamentos TEXT, -- JSON string ou valor como "ISENTO"
  detalhes_pagamentos TEXT, -- JSON string dos detalhes de pagamento
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

3. Teste as rotas:

GET /api/atos-tabela?data=2025-07-06
POST /api/atos-tabela (com body JSON)
DELETE /api/atos-tabela/123

4. Logs para debug:
- Todos os logs começam com [atos-tabela]
- Queries e parâmetros são logados
- Erros são capturados e logados

*/

