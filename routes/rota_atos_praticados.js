// Rota /api/atos-tabela para o backend Node.js/Express.js
// Adaptada para a tabela atos_praticados
// Arquivo: routes/atos-praticados.js ou similar

const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajuste o caminho conforme sua estrutura

// Middleware de autenticação (ajuste conforme seu sistema)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }

  // Aqui você deve validar o JWT token
  // jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
  //   if (err) return res.status(403).json({ error: 'Token inválido' });
  //   req.user = user;
  //   next();
  // });
  
  // Por enquanto, vamos pular a validação para teste
  next();
};

// GET /api/atos-tabela?data=YYYY-MM-DD
// Buscar atos por data
router.get('/', authenticateToken, async (req, res) => {
  const { data } = req.query;
  
  console.log('[atos-praticados] GET - Buscar atos por data:', data);
  
  try {
    let query = `
      SELECT 
        ap.id,
        ap.data,
        ap.hora,
        ap.codigo,
        ap.tributacao,
        cg.descricao as tributacao_descricao,
        ap.descricao,
        ap.quantidade,
        ap.valor_unitario,
        ap.pagamentos,
        ap.usuario
      FROM atos_praticados ap
      LEFT JOIN codigos_gratuitos cg ON ap.tributacao = cg.codigo
    `;
    
    let params = [];
    
    if (data) {
      query += ' WHERE ap.data = $1';
      params.push(data);
    }
    
    query += ' ORDER BY ap.data DESC, ap.hora DESC, ap.id DESC';
    
    console.log('[atos-praticados] Query:', query, 'Params:', params);
    
    const result = await pool.query(query, params);
    
    console.log('[atos-praticados] Resultados encontrados:', result.rowCount);
    
    // Formatar os dados para o frontend
    const atosFormatados = result.rows.map(ato => ({
      id: ato.id,
      data: ato.data,
      hora: ato.hora,
      codigo: ato.codigo,
      tributacao: ato.tributacao,
      tributacao_descricao: ato.tributacao_descricao,
      descricao: ato.descricao,
      quantidade: ato.quantidade,
      valor_unitario: parseFloat(ato.valor_unitario),
      pagamentos: ato.pagamentos, // já é JSON (jsonb)
      usuario: ato.usuario
    }));
    
    res.json({
      success: true,
      atos: atosFormatados,
      total: result.rowCount
    });
    
  } catch (error) {
    console.error('[atos-praticados] Erro ao buscar atos:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Erro ao buscar atos'
    });
  }
});

// POST /api/atos-tabela
// Adicionar novo ato
router.post('/', authenticateToken, async (req, res) => {
  const {
    data,
    hora,
    codigo,
    tributacao_codigo, // Código da tributação (ex: "01")
    descricao,
    quantidade,
    valor_unitario,
    pagamentos,
    usuario
  } = req.body;
  
  console.log('[atos-praticados] POST - Adicionar novo ato:', req.body);
  
  // Validações básicas
  if (!data || !hora || !codigo || !descricao || !usuario) {
    return res.status(400).json({
      error: 'Campos obrigatórios: data, hora, codigo, descricao, usuario'
    });
  }
  
  if (!tributacao_codigo) {
    return res.status(400).json({
      error: 'Campo obrigatório: tributacao_codigo'
    });
  }
  
  try {
    // Verificar se o código do ato existe na tabela atos
    const atoExiste = await pool.query('SELECT codigo FROM atos WHERE codigo = $1', [codigo]);
    if (atoExiste.rowCount === 0) {
      return res.status(400).json({
        error: `Código de ato '${codigo}' não encontrado na tabela atos`
      });
    }
    
    // Verificar se o código de tributação existe na tabela codigos_gratuitos
    const tributacaoExiste = await pool.query('SELECT codigo FROM codigos_gratuitos WHERE codigo = $1', [tributacao_codigo]);
    if (tributacaoExiste.rowCount === 0) {
      return res.status(400).json({
        error: `Código de tributação '${tributacao_codigo}' não encontrado na tabela codigos_gratuitos`
      });
    }
    
    const query = `
      INSERT INTO atos_praticados (
        data,
        hora,
        codigo,
        tributacao,
        descricao,
        quantidade,
        valor_unitario,
        pagamentos,
        usuario
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const params = [
      data,
      hora,
      codigo,
      tributacao_codigo, // Salvar apenas o código na coluna tributacao
      descricao,
      quantidade || 1,
      valor_unitario || 0,
      pagamentos || {}, // JSON vazio se não fornecido
      usuario
    ];
    
    console.log('[atos-praticados] Query INSERT:', query);
    console.log('[atos-praticados] Params:', params);
    
    const result = await pool.query(query, params);
    
    console.log('[atos-praticados] Ato inserido com sucesso:', result.rows[0]);
    
    res.status(201).json({
      success: true,
      message: 'Ato adicionado com sucesso',
      ato: {
        ...result.rows[0],
        valor_unitario: parseFloat(result.rows[0].valor_unitario)
      }
    });
    
  } catch (error) {
    console.error('[atos-praticados] Erro ao inserir ato:', error);
    
    // Tratar erros específicos de chave estrangeira
    if (error.code === '23503') {
      if (error.constraint === 'fk_ato') {
        return res.status(400).json({
          error: `Código de ato '${codigo}' não é válido`
        });
      } else if (error.constraint === 'fk_tributacao') {
        return res.status(400).json({
          error: `Código de tributação '${tributacao_codigo}' não é válido`
        });
      }
    }
    
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Erro ao adicionar ato'
    });
  }
});

// DELETE /api/atos-tabela/:id
// Remover ato por ID
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  console.log('[atos-praticados] DELETE - Remover ato ID:', id);
  
  if (!id || isNaN(id)) {
    return res.status(400).json({
      error: 'ID inválido'
    });
  }
  
  try {
    const query = 'DELETE FROM atos_praticados WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'Ato não encontrado'
      });
    }
    
    console.log('[atos-praticados] Ato removido:', result.rows[0]);
    
    res.json({
      success: true,
      message: 'Ato removido com sucesso',
      ato: {
        ...result.rows[0],
        valor_unitario: parseFloat(result.rows[0].valor_unitario)
      }
    });
    
  } catch (error) {
    console.error('[atos-praticados] Erro ao remover ato:', error);
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

const atosPraticados = require('./routes/atos-praticados'); // Ajuste o caminho
app.use('/api/atos-tabela', atosPraticados);

2. A tabela atos_praticados já existe conforme fornecido:

CREATE TABLE db_yq0x.public.atos_praticados (
  id serial DEFAULT nextval('atos_praticados_id_seq'::regclass) NOT NULL,
  "data" date NOT NULL,
  hora time NOT NULL,
  codigo varchar(10) NOT NULL,
  tributacao varchar(10),
  descricao varchar(255) NOT NULL,
  quantidade int4 DEFAULT 1 NOT NULL,
  valor_unitario numeric(12,2) NOT NULL,
  pagamentos jsonb NOT NULL,
  usuario varchar(100) NOT NULL,
  CONSTRAINT atos_praticados_pkey PRIMARY KEY (id),
  CONSTRAINT fk_ato FOREIGN KEY (codigo) REFERENCES db_yq0x.public.atos(codigo),
  CONSTRAINT fk_tributacao FOREIGN KEY (tributacao) REFERENCES db_yq0x.public.codigos_gratuitos(codigo)
);

3. Teste as rotas:

GET /api/atos-tabela?data=2025-07-06
POST /api/atos-tabela (com body JSON incluindo tributacao_codigo)
DELETE /api/atos-tabela/123

4. Logs para debug:
- Todos os logs começam com [atos-praticados]
- Queries e parâmetros são logados
- Erros são capturados e logados
- Validações de chave estrangeira incluídas

5. Formato do POST esperado:
{
  "data": "2025-07-06",
  "hora": "14:30:00",
  "codigo": "7802",
  "tributacao_codigo": "01",
  "descricao": "Certidão em resumo...",
  "quantidade": 1,
  "valor_unitario": 60.98,
  "pagamentos": {"dinheiro": {"quantidade": 1, "valor": 60.98}},
  "usuario": "Nayara Silva"
}

*/

