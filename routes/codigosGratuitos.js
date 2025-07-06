const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/codigos-gratuitos?search=texto
router.get('/', async (req, res) => {
  const { search } = req.query;
  console.log('[codigos-gratuitos] Requisição recebida. search:', search);

  try {
    let query, params;
    
    if (search && search.trim()) {
      const searchTerm = search.trim();
      const searchPattern = `%${searchTerm}%`;
      const prefixPattern = `${searchTerm}%`;
      
      // Query com ordenação inteligente para priorizar resultados mais relevantes
      query = `
        SELECT codigo, descricao 
        FROM codigos_gratuitos 
        WHERE codigo ILIKE $1 OR descricao ILIKE $1
        ORDER BY 
          CASE 
            WHEN LOWER(codigo) = LOWER($2) THEN 1          -- Match exato no código (prioridade máxima)
            WHEN LOWER(codigo) LIKE LOWER($3) THEN 2       -- Código que começa com o termo
            WHEN LOWER(descricao) LIKE LOWER($3) THEN 3    -- Descrição que começa com o termo
            WHEN codigo ILIKE $1 THEN 4                    -- Código que contém o termo
            ELSE 5                                          -- Descrição que contém o termo
          END,
          codigo ASC
        LIMIT 20
      `;
      
      params = [searchPattern, searchTerm, prefixPattern];
      console.log('[codigos-gratuitos] Query com filtro otimizado:', query);
      console.log('[codigos-gratuitos] Parâmetros:', params);
    } else {
      // Se não há busca, retorna lista vazia (como esperado pelo frontend)
      query = 'SELECT codigo, descricao FROM codigos_gratuitos ORDER BY codigo ASC LIMIT 20';
      params = [];
      console.log('[codigos-gratuitos] Query sem filtro (retornando todos):', query);
    }
    
    const result = await pool.query(query, params);
    console.log('[codigos-gratuitos] Resultados encontrados:', result.rowCount);
    
    // Log dos primeiros resultados para debug
    if (result.rows.length > 0) {
      console.log('[codigos-gratuitos] Primeiros resultados:', 
        result.rows.slice(0, 3).map(row => `${row.codigo} - ${row.descricao}`)
      );
    }
    
    res.json({ codigos: result.rows });
    
  } catch (err) {
    console.error('[codigos-gratuitos] Erro:', err);
    res.status(500).json({ 
      error: 'Erro ao buscar códigos gratuitos.',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;

// ===== VERSÃO ALTERNATIVA MAIS SIMPLES (se a complexa der problema) =====

/*
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
    
    if (search && search.trim()) {
      query += ' WHERE codigo ILIKE $1 OR descricao ILIKE $1';
      params.push(`%${search.trim()}%`);
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
*/

// ===== INSTRUÇÕES DE IMPLEMENTAÇÃO =====

/*
INSTRUÇÕES PARA ATUALIZAR SEU ARQUIVO codigosGratuitos.js:

1. SUBSTITUA o conteúdo do seu arquivo codigosGratuitos.js pela versão adaptada acima

2. A VERSÃO PRINCIPAL inclui:
   - Lógica de ordenação inteligente para priorizar resultados mais relevantes
   - Match exato no código tem prioridade máxima
   - Códigos/descrições que começam com o termo têm prioridade alta
   - Logs detalhados para debug
   - Tratamento de erro melhorado

3. SE A VERSÃO PRINCIPAL DER PROBLEMAS:
   - Use a versão alternativa mais simples (comentada no final)
   - Ela mantém a lógica original com pequenos ajustes

4. TESTE A ROTA:
   GET /api/codigos-gratuitos?search=01
   GET /api/codigos-gratuitos?search=pago
   GET /api/codigos-gratuitos?search=gratuito

5. FORMATO DE RESPOSTA ESPERADO:
   {
     "codigos": [
       {"codigo": "01", "descricao": "Ato Pago"},
       {"codigo": "02", "descricao": "Ato Gratuito"}
     ]
   }

6. COMPORTAMENTO ESPERADO:
   - Busca vazia ou sem parâmetro: retorna até 20 códigos ordenados
   - Busca com termo: retorna códigos/descrições que contêm o termo, priorizados por relevância
   - Case-insensitive (ILIKE)
   - Limite de 20 resultados

O frontend AtoSearchAtosPraticados.jsx já está preparado para usar essa rota!
*/

