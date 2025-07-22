const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pdfParse = require('pdf-parse');
const path = require('path');
const app = express();
//const port = process.env.PORT || 3001;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // outras configs se necessário
});

//const express = require('express');
//const router = express.Router();
//const pool = require('../db'); // ajuste para seu pool/conexão

const router = express.Router();

// ...existing code...
const gerarProtocolo = async () => {
  try {
    // Tenta criar a sequence se não existir
    await pool.query(`
      CREATE SEQUENCE IF NOT EXISTS protocolo_seq 
      START WITH 1 
      INCREMENT BY 1 
      NO MINVALUE 
      NO MAXVALUE 
      CACHE 1
    `);
    
    // Busca o próximo valor da sequência
    const seqRes = await pool.query('SELECT nextval(\'protocolo_seq\') as seq');
    const seq = seqRes.rows[0].seq;
    
    // Data/hora atual
    const agora = new Date();
    const dataStr = agora.toISOString().replace(/[-T:\.Z]/g, '').slice(0, 12); // YYYYMMDDHHMM
    
    // Protocolo: data + seq
    return `${dataStr}-${seq}`;
  } catch (error) {
    console.error('Erro ao gerar protocolo:', error);
    
    // Fallback: usar timestamp + número aleatório
    const agora = new Date();
    const dataStr = agora.toISOString().replace(/[-T:\.Z]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    return `${dataStr}-${random}`;
  }
};


dotenv.config();
const port = process.env.PORT || 3001;
app.use(express.json());



// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'uma_chave_super_secreta';

// CORS
const allowedOrigins = [
  'https://frontend-0f8x.onrender.com',
  'https://www.bibliofilia.com.br',
  'https://frontend-dev-e7yt.onrender.com',
];

const corsOptions = {
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'O CORS não permite acesso deste domínio.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// Função para processar texto extraído e capturar os dados reais
function processarTextoExtraido(texto) {
  const parseValor = (str) => {
    if (!str) return 0;
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  };

  const emolumentoMatch = texto.match(/Emolumento Apurado:\s*R\$\s*([\d\.,]+)/i);
  const tfjMatch = texto.match(/Taxa de Fiscalização Judiciária Apurada:\s*R\$\s*([\d\.,]+)/i);
  const recompeMatch = texto.match(/RECOMPE.*?Apurado:\s*R\$\s*([\d\.,]+)/i);
  const issqnMatch = texto.match(/ISSQN recebido dos usuários:\s*R\$\s*([\d\.,]+)/i);
  const totalDespesasMatch = texto.match(/Total de despesas do mês:\s*R\$\s*([\d\.,]+)/i);
  const recompeRecebidoMatch = texto.match(/Valores recebidos do RECOMPE:\s*R\$\s*([\d\.,]+)/i);

  const atosMatch = texto.match(/Total\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i);

  const atosPraticados = atosMatch
    ? atosMatch.slice(1).reduce((acc, val) => acc + parseInt(val, 10), 0)
    : 0;

  return {
    atosPraticados,
    emolumentoApurado: emolumentoMatch ? parseValor(emolumentoMatch[1]) : 0,
    tfj: tfjMatch ? parseValor(tfjMatch[1]) : 0,
    valoresRecompe: recompeMatch ? parseValor(recompeMatch[1]) : 0,
    issqn: issqnMatch ? parseValor(issqnMatch[1]) : 0,
    recompeApurado: recompeMatch ? parseValor(recompeMatch[1]) : 0,
    recompeRecebido: recompeRecebidoMatch ? parseValor(recompeRecebidoMatch[1]) : 0,
    totalDespesas: totalDespesasMatch ? parseValor(totalDespesasMatch[1]) : 0,
  };
}

// Configuração do multer para upload de arquivos (single)
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos PDF são permitidos!'));
    }
  },
});

// Configuração do multer para upload de múltiplos arquivos (tabelas 07 e 08)
const uploadAtos = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de texto (.txt) são permitidos!'));
    }
  },
});

async function extractTextWithPdfParse(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  console.log('Tamanho do buffer recebido:', dataBuffer.length);
  const data = await pdfParse(dataBuffer);
  return data.text;
}


//Configura o multer para múltiplos arquivos PDF

const uploadPdfMultiple = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos PDF são permitidos!'));
    }
  },
});

const campos = [
  { name: 'file0', maxCount: 1 },
  { name: 'file1', maxCount: 1 },
  { name: 'file2', maxCount: 1 },
  { name: 'file3', maxCount: 1 },
  { name: 'file4', maxCount: 1 },
  { name: 'file5', maxCount: 1 },
];

// Rota para importar e processar até 6 arquivos PDF
app.post('/api/importar-atos-pdf', authenticate, uploadPdfMultiple.fields(campos), async (req, res) => {
  try {
    const arquivos = [];
    for (let i = 0; i < 6; i++) {
      const campo = `file${i}`;
      if (req.files[campo] && req.files[campo][0]) {
        arquivos.push(req.files[campo][0]);
      }
    }

    if (arquivos.length !== 6) {
      return res.status(400).json({ error: 'É necessário enviar exatamente 6 arquivos PDF.' });
    }

    const resultados = [];

    for (const file of arquivos) {
      console.log(`Processando arquivo: ${file.originalname}`);
      const textoExtraido = await extractTextWithPdfParse(file.path);
      console.log('Tipo de textoExtraido:', typeof textoExtraido);
console.log('Conteúdo (início):', textoExtraido.slice(0, 100));
      const dadosProcessados = processarTextoExtraido(textoExtraido);

      resultados.push({
        nomeArquivo: file.originalname,
        ...dadosProcessados,
      });

      fs.unlink(file.path, (err) => {
        if (err) console.error('Erro ao deletar arquivo temporário:', err);
      });
    }

    res.json({
      sucesso: true,
      totalArquivos: arquivos.length,
      dadosIndividuais: resultados,
      totais: {
        atosPraticados: resultados.reduce((sum, r) => sum + r.atosPraticados, 0),
        arrecadacao: resultados.reduce((sum, r) => sum + r.emolumentoApurado + r.recompeRecebido + r.tfj + r.issqn, 0).toFixed(2),
        custeio: resultados.reduce((sum, r) => sum + r.totalDespesas, 0).toFixed(2),
        repasses: resultados.reduce((sum, r) => sum + r.recompeApurado + r.issqn + r.tfj, 0).toFixed(2),
      }
    });
  } catch (error) {
    console.error('Erro ao processar arquivos PDF:', error);
    res.status(500).json({ error: 'Erro interno ao processar arquivos PDF.', details: error.message });
  }
});


// Função para extrair texto do PDF usando pdf-parse
async function extrairDadosDoPdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const pdfData = await pdfParse(dataBuffer);
  // Aqui você pode processar pdfData.text para extrair os dados que precisa
  return {
    textoExtraido: pdfData.text,
    tamanho: pdfData.text.length,
  };
}


//rota protegida (com authenticate) para receber os arquivos, extrair os dados e responder CNJ
app.post('/api/importar-atos-pdf', authenticate, uploadPdfMultiple.array('files', 6), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo PDF enviado.' });
    }

    const resultados = [];

    for (const file of req.files) {
      const dadosExtraidos = await extrairDadosDoPdf(file.path);

      resultados.push({
        nomeArquivo: file.originalname,
        dados: dadosExtraidos,
      });

      // Remove arquivo temporário
      fs.unlink(file.path, (err) => {
        if (err) console.error('Erro ao deletar arquivo temporário:', err);
      });
    }

    res.json({
      sucesso: true,
      totalArquivos: req.files.length,
      resultados,
    });
  } catch (error) {
    console.error('Erro ao processar arquivos PDF:', error);
    res.status(500).json({ error: 'Erro interno ao processar arquivos PDF.' });
  }
});


// Função robusta para extrair atos do texto das tabelas


const codigosTabela07 = new Set([
  '7101', '7201', '7302', '7402', '7501', '7502', '7701', '7802', '7803', '7804',
  '7901', '7100', '7110', '7120', '7130', '7140', '7150', '7180', '7190', '7927'
]);

const codigosTabela08 = new Set(['8101', '8301', '8310']);

function extrairAtos(texto, origem) {
  if (origem === 'Tabela 07') {
    return extrairAtosTabela07(texto);
  } else if (origem === 'Tabela 08') {
    return extrairAtosTabela08(texto);
  } else {
    return [];
  }
}

function extrairAtosTabela07(texto) {
  const atos = [];
  const linhas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let buffer = '';
  const isLinhaInicioAto = (linha) => /^\d+(\.\d+)?\s*-\s*/.test(linha);

  const linhasIgnorar = [
    'Tabela', 'Certidões', 'Revogado', 'VETADO', '---', 'Obs.', 'Nota', 'Item vetado', 'Expedição', 'Apostilamento'
  ];

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];

    if (linhasIgnorar.some(palavra => linha.includes(palavra))) {
      continue;
    }

    if (isLinhaInicioAto(linha)) {
      if (buffer) {
        const ato = processarAtoTabela07(buffer);
        if (ato) atos.push(ato);
      }
      buffer = linha;
    } else {
      buffer += ' ' + linha;
    }
  }

  if (buffer) {
    const ato = processarAtoTabela07(buffer);
    if (ato) atos.push(ato);
  }

  return atos.filter(ato => codigosTabela07.has(ato.codigo));
}

function processarAtoTabela07(textoAto) {
  textoAto = textoAto.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();

  // Regex para capturar valores e código no final, mais flexível para espaços e formatos
  const regex = /^(.*?)(?:R?\$?\s*[\d.,]+\s+){6}(\d+)$/;

  const match = textoAto.match(regex);
  if (!match) {
    console.warn('Não conseguiu extrair ato Tabela 07:', textoAto.substring(0, 100));
    return null;
  }

  const descricao = match[1].trim();

  const valoresRegex = /R?\$?\s*([\d.,]+)/g;
  const valores = [];
  let m;
  while ((m = valoresRegex.exec(textoAto)) !== null) {
    valores.push(m[1]);
  }

  if (valores.length < 6) {
    console.warn('Valores insuficientes para ato Tabela 07:', textoAto.substring(0, 100));
    return null;
  }

  const parseValor = v => parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0;

  return {
    descricao,
    emol_bruto: parseValor(valores[0]),
    recompe: parseValor(valores[1]),
    emol_liquido: parseValor(valores[2]),
    issqn: parseValor(valores[3]),
    taxa_fiscal: parseValor(valores[4]),
    valor_final: parseValor(valores[5]),
    codigo: match[2],
    origem: 'Tabela 07',
  };
}

function extrairAtosTabela08(texto) {
  const atos = [];
  const linhas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const linhasIgnorar = ['VETADO', 'Nota', 'Notas', 'Tabela', '---'];

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];

    if (linhasIgnorar.some(palavra => linha.includes(palavra))) {
      continue;
    }

    if (!linha.includes('|')) {
      continue;
    }

    const partes = linha.split('|').map(s => s.trim()).filter(s => s.length > 0);

    if (partes.length < 8) {
      continue;
    }

    const codigo = partes[7];
    if (!codigosTabela08.has(codigo)) {
      continue;
    }

    const parseValor = v => parseFloat(v.replace(/[R$\s]/g, '').replace(',', '.')) || 0;

    atos.push({
      descricao: partes[0],
      emol_bruto: parseValor(partes[1]),
      recompe: parseValor(partes[2]),
      emol_liquido: parseValor(partes[3]),
      issqn: parseValor(partes[4]),
      taxa_fiscal: parseValor(partes[5]),
      valor_final: parseValor(partes[6]),
      codigo,
      origem: 'Tabela 08',
    });
  }

  return atos;
}

function processarAto(textoAto, origem) {
  // Remove pipes e múltiplos espaços
  textoAto = textoAto.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();

  // Regex mais flexível para capturar valores e código no final
  // Captura a descrição até o primeiro valor monetário, depois captura 6 valores monetários e o código no final
  const regex = /^(.*?)(?:R?\$?\s*[\d.,]+\s+){6}(\d+)$/;

  const match = textoAto.match(regex);
  if (!match) {
    console.warn('Não conseguiu extrair ato:', textoAto.substring(0, 100));
    return null;
  }

  const descricao = match[1].trim();

  // Extrair os valores monetários e código usando outra regex para pegar todos os números no final
  const valoresRegex = /R?\$?\s*([\d.,]+)/g;
  const valores = [];
  let m;
  while ((m = valoresRegex.exec(textoAto)) !== null) {
    valores.push(m[1]);
  }

  if (valores.length < 6) {
    console.warn('Valores insuficientes para ato:', textoAto.substring(0, 100));
    return null;
  }

  const parseValor = v => parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0;

  return {
    descricao,
    emol_bruto: parseValor(valores[0]),
    recompe: parseValor(valores[1]),
    emol_liquido: parseValor(valores[2]),
    issqn: parseValor(valores[3]),
    taxa_fiscal: parseValor(valores[4]),
    valor_final: parseValor(valores[5]),
    codigo: match[2],
    origem,
  };
}

//rota para listar os atos do tj

app.get('/api/atos', authenticate, async (req, res) => {
  const search = req.query.search || ''; // Pega o parâmetro de busca da query string
  try {
    const result = await pool.query(
      `SELECT id, codigo, descricao, valor_final FROM atos
       WHERE codigo ILIKE $1 OR descricao ILIKE $1
       ORDER BY codigo
       LIMIT 20`,
      [`%${search}%`] // Usa o parâmetro de busca na query
    );
    res.json({ atos: result.rows });
  } catch (err) {
    console.error('Erro ao listar atos:', err);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});


// Middleware de autenticação (exemplo)
function authenticate(req, res, next) {
  // Sua lógica de autenticação aqui
  next();
}


// Rota para buscar atos pagos por data e usuário
app.get('/api/atos-pagos', authenticate, async (req, res) => {
  const data = req.query.data; // espera 'YYYY-MM-DD'
  console.log('Data recebida do frontend:', data);
  const usuario = req.user; // middleware authenticate define req.user

  if (!data) {
    return res.status(400).json({ message: 'Parâmetro data é obrigatório.' });
  }
  if (!usuario) {
    return res.status(401).json({ message: 'Usuário não autenticado.' });
  }

  try {
    const result = await pool.query(
      `SELECT id, data, hora, codigo, descricao, quantidade, valor_unitario, pagamentos, usuario
       FROM atos_pagos
       WHERE (data) = $1 AND usuario = $2
       ORDER BY hora`,
      [data, usuario.nome]  // <-- aqui usamos apenas o id do usuário
    );
    res.json({ CaixaDiario: result.rows });
    } catch (err) {
    console.error('Erro ao buscar atos pagos:', err);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

// Rota para adicionar um ato pago com usuário
app.post('/api/atos-pagos', authenticate, async (req, res) => {
  const { data, hora, codigo, descricao, quantidade, valor_unitario, pagamentos } = req.body;
  const usuarioAutenticado = req.user;
  const usuarioId = usuarioAutenticado.nome;

  // Verificação para códigos 0001 e 0005
  if (codigo === '0001' || codigo === '0005') {
    const existe = await pool.query(
      `SELECT 1 FROM atos_pagos WHERE data = $1 AND usuario = $2 AND codigo = $3`,
      [data, usuarioId, codigo]
    );
    if (existe.rowCount > 0) {
      return res.status(409).json({ message: `Já existe um ato com código ${codigo} para este dia e usuário.` });
    }
  }

  // Inserção do ato pago
  try {
    const result = await pool.query(
      `INSERT INTO atos_pagos (data, hora, codigo, descricao, quantidade, valor_unitario, pagamentos, usuario)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [data, hora, codigo, descricao, quantidade, valor_unitario, pagamentos, usuarioId]
    );
    res.status(201).json({ atoPago: result.rows[0], message: 'Ato pago cadastrado com sucesso!' });
  } catch (err) {
    console.error('Erro ao cadastrar ato pago:', err);
    res.status(500).json({ message: 'Erro interno ao cadastrar ato pago.' });
  }
});

// Rota para deletar um ato pago pelo id
app.delete('/api/atos-pagos/:id', authenticate, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await pool.query(`DELETE FROM atos_pagos WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Ato não encontrado.' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar ato pago:', err);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});


//rota para obter um dado especifico por id atos do tj

app.get('/api/atos/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM atos WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Ato não encontrado.' });
    }
    res.json({ ato: result.rows[0] });
  } catch (err) {
    console.error('Erro ao obter ato:', err);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

// GET /api/atos-praticados?data=YYYY-MM-DD
app.get('/api/atos-praticados', authenticate, async (req, res) => {
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
app.post('/api/atos-praticados', authenticate, async (req, res) => {
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

  const codigoTributacao = tributacao
  ? String(tributacao).trim().substring(0, 2)
  : null;

  const params = [
    data,
    hora,
    codigo,
    codigoTributacao, // Use só o código aqui!
    descricao,
    quantidade || 1,
    valor_unitario || 0,
    typeof pagamentos === 'object'
      ? JSON.stringify(pagamentos)
      : JSON.stringify({ valor: pagamentos }),
    detalhes_pagamentos || null
  ];

  const query = `
    INSERT INTO atos_praticados (
      data,
      hora,
      codigo,
      tributacao,
      descricao,
      quantidade,
      valor_unitario,
      detalhes_pagamentos,
      usuario
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

  const result = await pool.query(query, params);

  console.log('[POST] /api/atos-praticados - inserido com sucesso:', result.rows[0]);
  res.status(201).json({ ato: result.rows[0] });
});


// DELETE /api/s/:id
app.delete('/api/s/:id', authenticate, async (req, res) => {
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


// ========== ROTAS DE ATOS PRATICADOS (VERSÃO CORRIGIDA) ==========

// GET /api/atos-tabela - Buscar atos por data
app.get('/api/atos-tabela', authenticateToken, async (req, res) => {
  const { data } = req.query;
  console.log('[atos-tabela][GET] Requisição recebida. Query:', req.query);

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
        ap.detalhes_pagamentos,
        ap.usuario,
        u.serventia as usuario_serventia
      FROM atos_praticados ap
      LEFT JOIN codigos_gratuitos cg ON ap.tributacao = cg.codigo
      LEFT JOIN public.users u ON ap.usuario = u.nome
    `;
    
    let params = [];
    if (data) {
      query += ' WHERE ap.data = $1';
      params.push(data);
    }
    query += ' ORDER BY ap.data DESC, ap.hora DESC, ap.id DESC';

    console.log('[atos-tabela][GET] Query:', query, 'Params:', params);

    const result = await pool.query(query, params);

    console.log('[atos-tabela][GET] Resultados encontrados:', result.rowCount);

    // Formatar os dados para o frontend
    const atosFormatados = result.rows.map((ato) => ({
      id: ato.id,
      data: ato.data,
      hora: ato.hora,
      codigo: ato.codigo,
      tributacao: ato.tributacao,
      tributacao_descricao: ato.tributacao_descricao,
      descricao: ato.descricao,
      quantidade: ato.quantidade,
      valor_unitario: parseFloat(ato.valor_unitario),
      pagamentos: ato.pagamentos,
      detalhes_pagamentos: ato.detalhes_pagamentos,
      usuario: ato.usuario,
      usuario_serventia: ato.usuario_serventia
    }));

    // LOG DO QUE SERÁ ENVIADO AO FRONTEND
    console.log('[atos-tabela][GET] Enviando ao frontend:', JSON.stringify(atosFormatados, null, 2));

    res.json({
      success: true,
      atos: atosFormatados,
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

// POST /api/atos-tabela - Adicionar novo ato
app.post('/api/atos-tabela', authenticateToken, async (req, res) => {
  console.log('[atos-tabela][POST] Body recebido:', req.body);

  const {
    data,
    hora,
    codigo,
    tributacao_codigo, // Código da tributação (ex: "01")
    descricao,
    quantidade,
    valor_unitario,
    pagamentos,
    detalhes_pagamentos,
    usuario
  } = req.body;

  // Validações básicas
  if (!data || !hora || !codigo || !descricao || !usuario) {
    console.log('[atos-tabela][POST] Campos obrigatórios faltando!');
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
    const tributacaoExiste = await pool.query(
      'SELECT codigo FROM codigos_gratuitos WHERE codigo = $1',
      [tributacao_codigo]
    );
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
        detalhes_pagamentos,
        usuario
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      JSON.stringify(pagamentos || {}), // Sempre converter para JSON string
      JSON.stringify(detalhes_pagamentos || {}), // Sempre converter para JSON string
      usuario
    ];

    console.log('[atos-tabela][POST] Query INSERT:', query);
    console.log('[atos-tabela][POST] Params:', params);

    const result = await pool.query(query, params);

    console.log('[atos-tabela][POST] Ato inserido com sucesso:', result.rows[0]);

    res.status(201).json({
      success: true,
      message: 'Ato adicionado com sucesso',
      ato: {
        ...result.rows[0],
        valor_unitario: parseFloat(result.rows[0].valor_unitario),
      }
    });

  } catch (error) {
    console.error('[atos-tabela][POST] Erro ao inserir ato:', error);

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

// DELETE /api/atos-tabela/:id - Remover ato por ID
app.delete('/api/atos-tabela/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  console.log('[atos-tabela][DELETE] Requisição para remover ID:', id);

  if (!id || isNaN(id)) {
    console.log('[atos-tabela][DELETE] ID inválido!');
    return res.status(400).json({
      error: 'ID inválido'
    });
  }

  try {
    const query = 'DELETE FROM atos_praticados WHERE id = $1 RETURNING *';
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
      ato: {
        ...result.rows[0],
        valor_unitario: parseFloat(result.rows[0].valor_unitario),
      }
    });

  } catch (error) {
    console.error('[atos-tabela][DELETE] Erro ao remover ato:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Erro ao remover ato'
    });
  }
});

//rota para atualizar um ato existente do tj

app.put('/api/atos/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { descricao, emol_bruto, recompe, emol_liquido, issqn, taxa_fiscal, valor_final, origem } = req.body;
  try {
    await pool.query(
      `UPDATE atos SET descricao = $1, emol_bruto = $2, recompe = $3, emol_liquido = $4,
       issqn = $5, taxa_fiscal = $6, valor_final = $7, origem = $8 WHERE id = $9`,
      [descricao, emol_bruto, recompe, emol_liquido, issqn, taxa_fiscal, valor_final, origem, id]
    );
    res.json({ message: 'Ato atualizado com sucesso.' });
  } catch (err) {
    console.error('Erro ao atualizar ato:', err);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

//rota para referencia

app.get('/api/atos', authenticate, async (req, res) => {
  const search = req.query.search || '';
  try {
    const result = await pool.query(
      `SELECT id, codigo, descricao FROM atos WHERE codigo ILIKE $1 OR descricao ILIKE $1 ORDER BY codigo LIMIT 20`,
      [`%${search}%`]
    );
    res.json({ atos: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erro ao buscar atos.' });
  }
});

//rota para cadastrar atos via api

app.post('/api/atos', authenticate, requireRegistrador, async (req, res) => {
  const { codigo, descricao, emol_bruto, recompe, emol_liquido, issqn, taxa_fiscal, valor_final, origem } = req.body;

  if (!codigo || !descricao) {
    return res.status(400).json({ message: 'Código e descrição são obrigatórios.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO atos (codigo, descricao, emol_bruto, recompe, emol_liquido, issqn, taxa_fiscal, valor_final, origem)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [codigo, descricao, emol_bruto || null, recompe || null, emol_liquido || null, issqn || null, taxa_fiscal || null, valor_final || null, origem || null]
    );
    res.status(201).json({ ato: result.rows[0], message: 'Ato cadastrado com sucesso!' });
  } catch (err) {
    console.error('Erro ao cadastrar ato:', err);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

// Middleware para autenticação
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.sendStatus(401);
  const [, token] = auth.split(' ');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.sendStatus(401);
  }
}

// Middleware para verificar se o usuário é Registrador (superuser)
function requireRegistrador(req, res, next) {
  if (req.user && req.user.cargo === 'Registrador') {
    return next();
  }
  return res.status(403).json({ message: 'Acesso restrito ao Registrador.' });
}

// ========== ROTAS DE AUTENTICAÇÃO ==========

// Cadastro de usuário
app.post('/api/signup', async (req, res) => {
  const { nome, email, password, serventia, cargo } = req.body;
  
  if (!nome ||!email || !password || !serventia || !cargo) {
    return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO public.users (nome, email, password, serventia, cargo) VALUES ($1, $2, $3, $4, $5)',
      [nome, email, hash, serventia, cargo]
    );
    return res.status(201).json({ message: 'Cadastro realizado com sucesso!' });
  } catch (err) {
    console.error('Erro no cadastro:', err);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'E-mail já cadastrado.' });
    }
    return res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

// Login de usuário
app.post('/api/login', async (req, res) => {
  const { nome, password } = req.body;
  
  if (!nome || !password) {
    return res.status(400).json({ message: 'Nome de Usuário e senha são obrigatórios.' });
  }

  try {
    const result = await pool.query('SELECT * FROM public.users WHERE nome = $1', [nome]);
    
    if (!result.rowCount) {
      return res.status(401).json({ message: 'Credenciais inválidas.' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Credenciais inválidas.' });
    }

    const token = jwt.sign(
      { id: user.id, nome: user.nome, cargo: user.cargo }, 
      JWT_SECRET, 
      { expiresIn: '8h' }
    );
    
    res.json({ 
      token, 
      user: { 
        id: user.id,
        nome: user.nome,
        email: user.email, 
        serventia: user.serventia, 
        cargo: user.cargo 
      } 
    });
  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

// Rota para obter perfil do usuário (protegida)
app.get('/api/profile', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, email, serventia, cargo FROM public.users WHERE id = $1', 
      [req.user.id]
    );
    
    if (!result.rowCount) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }
    
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Erro ao buscar perfil:', err);
    return res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

// ========== ROTAS DE UPLOAD (PROTEGIDAS) ==========

// Upload de PDF (single, protegido por autenticação)
app.post('/api/upload', authenticate, (req, res) => {
  const uploadMiddleware = upload.single('file');

  uploadMiddleware(req, res, async (err) => {
    if (err) {
      console.error('Erro no upload:', err);
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo não enviado' });
    }

    try {
      const textoExtraido = await extractTextWithPdfParse(req.file.path);

      // Remove o arquivo temporário
      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) console.error('Erro ao deletar arquivo temporário:', unlinkErr);
      });

      return res.json({
        message: 'Upload e extração de dados do PDF concluídos',
        texto: textoExtraido,
      });

    } catch (processErr) {
      console.error('Erro ao processar o arquivo:', processErr);
      return res.status(500).json({ 
        error: 'Erro ao processar o upload do PDF', 
        details: processErr.message 
      });
    }
  });
});

// Rota de upload e extração dos atos das tabelas 07 e 08
app.post('/api/upload', authenticate, (req, res) => {
  const uploadMiddleware = upload.single('file');

  uploadMiddleware(req, res, async (err) => {
    if (err) {
      console.error('Erro no upload:', err);
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo não enviado' });
    }

    try {
      const textoExtraido = await pdfToTextWithOCR(req.file.path);

      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) console.error('Erro ao deletar arquivo temporário:', unlinkErr);
      });

      return res.json({
        message: 'Upload e extração OCR do PDF concluídos',
        texto: textoExtraido,
      });

    } catch (processErr) {
      console.error('Erro ao processar o arquivo:', processErr);
      return res.status(500).json({ 
        error: 'Erro ao processar o upload do PDF', 
        details: processErr.message 
      });
    }
  });
});

// Rota para salvar relatório (protegida)
app.post('/api/salvar-relatorio', authenticate, async (req, res) => {
  const { dadosRelatorio } = req.body;
  
  if (!dadosRelatorio) {
    return res.status(400).json({ message: 'Dados do relatório são obrigatórios.' });
  }

  try {
    // Busca os dados do usuário logado
    const userResult = await pool.query(
      'SELECT email, cargo, serventia FROM public.users WHERE id = $1', 
      [req.user.id]
    );
    
    if (!userResult.rowCount) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }
    
    const user = userResult.rows[0];
    
    // Salva o relatório no banco
    const result = await pool.query(
      `INSERT INTO relatorios (user_id, email, cargo, serventia, dados_relatorio) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id, data_geracao`,
      [req.user.id, user.email, user.cargo, user.serventia, JSON.stringify(dadosRelatorio)]
    );
    
    res.json({ 
      message: 'Relatório salvo com sucesso!',
      relatorio_id: result.rows[0].id,
      data_geracao: result.rows[0].data_geracao
    });
    
  } catch (err) {
    console.error('Erro ao salvar relatório:', err);
    return res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

// Rota para listar relatórios do usuário (protegida)
app.get('/api/meus-relatorios', authenticate, async (req, res) => {
  try {
    let query = '';
    let params = [];

    if (req.user.cargo === 'Registrador') {
      // Retorna todos os relatórios
      query = 'SELECT * FROM relatorios ORDER BY data_geracao DESC';
    } else {
      // Retorna apenas os relatórios do usuário logado
      query = 'SELECT * FROM relatorios WHERE user_id = $1 ORDER BY data_geracao DESC';
      params = [req.user.id];
    }

    const result = await pool.query(query, params);
    res.json({ relatorios: result.rows });
  } catch (error) {
    console.error('Erro ao buscar relatórios:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

// rota para buscar usuários (protegida)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nome, email, serventia FROM public.users ORDER BY nome');
    res.json({ usuarios: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// Rota para excluir relatório (protegida)
app.delete('/api/excluir-relatorio/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    // Garante que só o dono pode excluir
    const result = await pool.query(
      'DELETE FROM relatorios WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Relatório não encontrado ou não pertence a este usuário.' });
    }
    res.json({ message: 'Relatório excluído com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir relatório:', error);
    res.status(500).json({ message: 'Erro ao excluir relatório.' });
  }
});

// ========== ROTA EXCLUSIVA PARA REGISTRADOR ==========

app.get('/api/relatorios-todos', authenticate, requireRegistrador, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, cargo, serventia, data_geracao, dados_relatorio 
       FROM relatorios 
       ORDER BY data_geracao DESC`
    );
    res.json({ relatorios: result.rows });
  } catch (err) {
    console.error('Erro ao buscar todos os relatórios:', err);
    return res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

const fechamentosRouter = require('./routes/fechamentos');
app.use('/api', fechamentosRouter);

//rota para para importar atos

app.post('/api/importar-atos', authenticate, requireRegistrador, uploadAtos.fields([
  { name: 'tabela07', maxCount: 1 },
  { name: 'tabela08', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('Recebendo arquivos para importação de atos...');
    console.log('Arquivos recebidos:', req.files);

    if (!req.files || !req.files.tabela07 || !req.files.tabela08) {
      console.log('Arquivos de texto não enviados corretamente.');
      return res.status(400).json({ message: 'Envie os dois arquivos de texto.' });
    }

    const caminhoTabela07 = req.files.tabela07[0].path;
    const caminhoTabela08 = req.files.tabela08[0].path;

    console.log('Lendo arquivo tabela07 em:', caminhoTabela07);
    const texto07 = fs.readFileSync(caminhoTabela07, 'utf8');
    console.log('Conteúdo tabela07 (primeiros 200 caracteres):', texto07.substring(0, 200));

    console.log('Lendo arquivo tabela08 em:', caminhoTabela08);
    const texto08 = fs.readFileSync(caminhoTabela08, 'utf8');
    console.log('Conteúdo tabela08 (primeiros 200 caracteres):', texto08.substring(0, 200));

    const atos07 = extrairAtos(texto07, 'Tabela 07');
    const atos08 = extrairAtos(texto08, 'Tabela 08');

    const atos = [...atos07, ...atos08];

    // Deletar arquivos temporários
    fs.unlink(caminhoTabela07, (err) => {
      if (err) console.error('Erro ao deletar arquivo Tabela 07:', err);
      else console.log('Arquivo Tabela 07 deletado.');
    });
    fs.unlink(caminhoTabela08, (err) => {
      if (err) console.error('Erro ao deletar arquivo Tabela 08:', err);
      else console.log('Arquivo Tabela 08 deletado.');
    });

    console.log('Atos extraídos:', atos.length);
    return res.json({ atos });

  } catch (err) {
    console.error('Erro ao importar atos:', err);
    return res.status(500).json({ message: 'Erro ao processar os arquivos.' });
  }
});

// ========== ROTA DE TESTE ==========

app.get('/api/test', (req, res) => {
  res.json({ message: 'API funcionando!', timestamp: new Date().toISOString() });
});

// ========== LISTAR TODOS USUARIOS ==========

app.get('/api/admin/usuarios', authenticate, requireRegistrador, async (req, res) => {
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

// ========== EDITAR USUARIOS ==========

app.put('/api/admin/usuarios/:id', authenticate, requireRegistrador, async (req, res) => {
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

// ========== EXCLUIR USUARIOS ==========

app.delete('/api/admin/usuarios/:id', authenticate, requireRegistrador, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM public.users WHERE id = $1', [id]);
    res.json({ message: 'Usuário excluído com sucesso.' });
  } catch (err) {
    console.error('Erro ao excluir usuário:', err);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

// ========== INICIALIZAÇÃO DO SERVIDOR ==========

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

const codigosGratuitosRouter = require('./routes/codigosGratuitos');
app.use('/api/codigos-gratuitos', codigosGratuitosRouter);

// Middleware para autenticação de token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }
  // Se quiser validar o JWT, descomente abaixo:
  // try {
  //   req.user = jwt.verify(token, JWT_SECRET);
  // } catch {
  //   return res.status(401).json({ error: 'Token inválido' });
  // }
  next();
}

// Buscar atos praticados por data
app.get('/api/atos-praticados', authenticate, async (req, res) => {
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

// Adicionar ato praticado
app.post('/api/atos-praticados', authenticate, async (req, res) => {
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

  const codigoTributacao = tributacao
  ? String(tributacao).trim().substring(0, 2)
  : null;

  const params = [
    data,
    hora,
    codigo,
    codigoTributacao, // Use só o código aqui!
    descricao,
    quantidade || 1,
    valor_unitario || 0,
    typeof pagamentos === 'object'
      ? JSON.stringify(pagamentos)
      : JSON.stringify({ valor: pagamentos }),
    detalhes_pagamentos || null
  ];

  const query = `
    INSERT INTO atos_praticados (
      data,
      hora,
      codigo,
      tributacao,
      descricao,
      quantidade,
      valor_unitario,
      detalhes_pagamentos,
      usuario
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

  const result = await pool.query(query, params);

  console.log('[POST] /api/atos-praticados - inserido com sucesso:', result.rows[0]);
  res.status(201).json({ ato: result.rows[0] });
});

// Deletar ato praticado
app.delete('/api/atos-praticados/:id', authenticate, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await pool.query(`DELETE FROM atos_praticados WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Ato não encontrado.' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar ato pago:', err);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

// Buscar atos da tabela por data
app.get('/', authenticateToken, async (req, res) => {
  const { data } = req.query;
  console.log('[atos-tabela][GET] Requisição recebida. Query:', req.query);

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
        ap.detalhes_pagamentos,
        ap.usuario,
        u.serventia as usuario_serventia
      FROM atos_praticados ap
      LEFT JOIN codigos_gratuitos cg ON ap.tributacao = cg.codigo
      LEFT JOIN public.users u ON ap.usuario = u.nome
    `;
    
    let params = [];
    if (data) {
      query += ' WHERE ap.data = $1';
      params.push(data);
    }
    query += ' ORDER BY ap.data DESC, ap.hora DESC, ap.id DESC';

    console.log('[atos-tabela][GET] Query:', query, 'Params:', params);

    const result = await pool.query(query, params);

    console.log('[atos-tabela][GET] Resultados encontrados:', result.rowCount);

    // Formatar os dados para o frontend
    const atosFormatados = result.rows.map((ato) => ({
      id: ato.id,
      data: ato.data,
      hora: ato.hora,
      codigo: ato.codigo,
      tributacao: ato.tributacao,
      tributacao_descricao: ato.tributacao_descricao,
      descricao: ato.descricao,
      quantidade: ato.quantidade,
      valor_unitario: parseFloat(ato.valor_unitario),
      pagamentos: ato.pagamentos,
      detalhes_pagamentos: ato.detalhes_pagamentos,
      usuario: ato.usuario,
      usuario_serventia: ato.usuario_serventia
    }));

    // LOG DO QUE SERÁ ENVIADO AO FRONTEND
    console.log('[atos-tabela][GET] Enviando ao frontend:', JSON.stringify(atosFormatados, null, 2));

    res.json({
      success: true,
      atos: atosFormatados,
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

// Adicionar ato na tabela
app.post('/api/atos-tabela', authenticateToken, async (req, res) => {
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
    console.log('[busca-atos][POST] Campos obrigatórios faltando!');
    return res.status(400).json({
      error: 'Campos obrigatórios: data, hora, codigo, descricao'
    });
  }

  try {
    const query = `
      INSERT INTO atos_praticados (
        data,
        hora,
        codigo,
        tributacao,
        descricao,
        quantidade,
        valor_unitario,
        detalhes_pagamentos,
        usuario
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
      // Garante que pagamentos seja sempre um JSON válido
      typeof pagamentos === 'object'
        ? JSON.stringify(pagamentos)
        : JSON.stringify({ valor: pagamentos }),
      detalhes_pagamentos || null
    ];

    console.log('[busca-atos][POST] Query INSERT:', query);
    console.log('[busca-atos][POST] Params:', params);

    const result = await pool.query(query, params);

    console.log('[busca-atos][POST] Ato inserido com sucesso:', result.rows[0]);

    res.status(201).json({
      success: true,
      message: 'Ato adicionado com sucesso',
      ato: result.rows[0]
    });

  } catch (error) {
    console.error('[busca-atos][POST] Erro ao inserir ato:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Erro ao adicionar ato'
    });
  }
});

app.get('/api/admin/combos/listar', async (req, res) => {
  try {
    const combos = await pool.query(`
      SELECT c.id, c.nome, 
        COALESCE(json_agg(json_build_object(
          'id', a.id, 
          'codigo', a.codigo, 
          'descricao', a.descricao,
          'valor_final', a.valor_final
        ) ORDER BY ca.ordem) FILTER (WHERE a.id IS NOT NULL), '[]') AS atos
      FROM combos c
      LEFT JOIN combo_atos ca ON ca.combo_id = c.id
      LEFT JOIN atos a ON ca.ato_id = a.id
      GROUP BY c.id
      ORDER BY c.id
    `);
    res.json({ combos: combos.rows });
  } catch (err) {
    console.error('Erro ao buscar combos:', err);
    res.status(500).json({ error: 'Erro ao buscar combos.', details: err.message });
  }
});

app.get('/api/admin/combos', async (req, res) => {
  try {
    const combos = await pool.query(`
      SELECT c.id, c.nome, 
        COALESCE(json_agg(json_build_object('id', a.id, 'codigo', a.codigo, 'descricao', a.descricao)) FILTER (WHERE a.id IS NOT NULL), '[]') AS atos
      FROM combos c
      LEFT JOIN combo_atos ca ON ca.combo_id = c.id
      LEFT JOIN atos a ON ca.ato_id = a.id
      GROUP BY c.id
      ORDER BY c.id
    `);
    res.json({ combos: combos.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar combos.' });
  }
});



// GET /api/atos-tabela/usuarios - Buscar usuários únicos para sugestões
app.get('/api/busca-atos/usuarios', authenticateToken, async (req, res) => {
  const { search } = req.query;
  console.log('[busca-atos][USUARIOS] Termo de busca:', search);

  try {
    let query = `
      SELECT DISTINCT usuario 
      FROM atos_praticados 
      WHERE usuario IS NOT NULL
    `;
    
    const params = [];
    
    if (search) {
      query += ` AND usuario ILIKE $1`;
      params.push(`%${search}%`);
    }
    
    query += ` ORDER BY usuario LIMIT 10`;

    console.log('[busca-atos][USUARIOS] Query:', query);
    console.log('[busca-atos][USUARIOS] Params:', params);

    const result = await pool.query(query, params);
    
    const usuarios = result.rows.map(row => row.usuario);

    console.log('[busca-atos][USUARIOS] Usuários encontrados:', usuarios.length);

    res.json({
      usuarios: usuarios
    });

  } catch (error) {
    console.error('[busca-atos][USUARIOS] Erro:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});
// Deletar ato da tabela
app.delete('/api/busca-atos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  console.log('[busca-atos][DELETE] Requisição para remover ID:', id);

  if (!id || isNaN(id)) {
    console.log('[busca-atos][DELETE] ID inválido!');
    return res.status(400).json({
      error: 'ID inválido'
    });
  }

  try {
    const query = 'DELETE FROM atos_praticados WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);

    if (result.rowCount === 0) {
      console.log('[busca-atos][DELETE] Ato não encontrado para remoção.');
      return res.status(404).json({
        error: 'Ato não encontrado'
      });
    }

    console.log('[busca-atos][DELETE] Ato removido:', result.rows[0]);

    res.json({
      success: true,
      message: 'Ato removido com sucesso',
      ato: result.rows[0]
    });

  } catch (error) {
    console.error('[busca-atos][DELETE] Erro ao remover ato:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Erro ao remover ato'
    });
  }
});

app.delete('/api/admin/combos/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM combos WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir combo:', err);
    res.status(500).json({ error: 'Erro ao excluir combo.' });
  }
});



app.post('/api/admin/combos', async (req, res) => {
  const { nome, atos } = req.body;
  if (!nome || !Array.isArray(atos)) {
    return res.status(400).json({ error: 'Nome e atos são obrigatórios.' });
  }

  try {
    // Insere combo
    const comboResult = await pool.query(
      'INSERT INTO combos (nome) VALUES ($1) RETURNING id',
      [nome]
    );
    const comboId = comboResult.rows[0].id;

    // Insere relação combo-atos
    for (const atoId of atos) {
      await pool.query(
        'INSERT INTO combo_atos (combo_id, ato_id) VALUES ($1, $2)',
        [comboId, atoId]
      );
    }

    res.status(201).json({ success: true, comboId });
  } catch (err) {
    console.error('Erro ao criar combo:', err);
    res.status(500).json({ error: 'Erro ao criar combo.' });
  }
});

// Rota para criar pedido
app.post('/api/pedidos', authenticate, async (req, res) => {
  try {
    const { protocolo, tipo, descricao, prazo, clienteId, valorAdiantado, observacao, combos, usuario } = req.body;
    
    console.log('[POST] /api/pedidos - dados recebidos:', {
      protocolo, tipo, descricao, prazo, clienteId, valorAdiantado, observacao, combos, usuario
    });
    
    // Se há protocolo, verifica se é uma atualização
    if (protocolo && protocolo.trim() !== '') {
      // Verifica se o pedido já existe
      const pedidoExistente = await pool.query('SELECT id FROM pedidos WHERE protocolo = $1', [protocolo]);
      
      if (pedidoExistente.rows.length > 0) {
        // É uma atualização
        const pedidoId = pedidoExistente.rows[0].id;
        
        // Atualiza o pedido
        await pool.query(`
          UPDATE pedidos 
          SET tipo = $1, descricao = $2, prazo = $3, cliente_id = $4, valor_adiantado = $5, observacao = $6, usuario = $7
          WHERE id = $8
        `, [tipo, descricao, prazo, clienteId, valorAdiantado, observacao, usuario, pedidoId]);
        
        // Remove combos antigos
        await pool.query('DELETE FROM pedido_combos WHERE pedido_id = $1', [pedidoId]);
        
        // Adiciona novos combos
        if (Array.isArray(combos)) {
          for (const combo of combos) {
            await pool.query(`
              INSERT INTO pedido_combos (pedido_id, combo_id, ato_id, quantidade, codigo_tributario)
              VALUES ($1, $2, $3, $4, $5)
            `, [pedidoId, combo.combo_id, combo.ato_id, combo.quantidade, combo.codigo_tributario]);
          }
        }
        
        res.json({ message: 'Pedido atualizado com sucesso', protocolo, id: pedidoId });
        return;
      }
    }
    
    // Se não há protocolo ou não existe, cria um novo
    console.log('[POST] /api/pedidos - gerando protocolo...');
    const novoProtocolo = protocolo || await gerarProtocolo();
    console.log('[POST] /api/pedidos - protocolo gerado:', novoProtocolo);
    
    // Resto da lógica de criação existente...
    const result = await pool.query(`
      INSERT INTO pedidos (protocolo, tipo, descricao, prazo, cliente_id, valor_adiantado, observacao, usuario)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [novoProtocolo, tipo, descricao, prazo, clienteId, valorAdiantado, observacao, usuario]);
    
    const pedidoId = result.rows[0].id;
    
    // Inserir combos se houver
    if (Array.isArray(combos)) {
      for (const combo of combos) {
        await pool.query(`
          INSERT INTO pedido_combos (pedido_id, combo_id, ato_id, quantidade, codigo_tributario)
          VALUES ($1, $2, $3, $4, $5)
        `, [pedidoId, combo.combo_id, combo.ato_id, combo.quantidade, combo.codigo_tributario]);
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Pedido criado com sucesso', 
      protocolo: novoProtocolo, 
      id: pedidoId 
    });
    
  } catch (err) {
    console.error('Erro ao criar/atualizar pedido:', err);
    res.status(500).json({ error: 'Erro ao criar/atualizar pedido.' });
  }
});

// Rota para listar pedidos

app.get('/api/pedidos', authenticate, async (req, res) => {
  try {
    const pedidosRes = await pool.query(`
      SELECT p.id, p.protocolo, p.tipo, p.descricao, p.prazo, p.criado_em, 
             c.nome as cliente_nome
      FROM pedidos p
      LEFT JOIN clientes c ON p.cliente_id = c.id
      ORDER BY p.id DESC
    `);
    console.log('pedidos listados no DB:', pedidosRes);
    // Adapte para incluir status, pagamento, entrega, etc. se necessário
    const pedidos = pedidosRes.rows.map(p => ({
      protocolo: p.protocolo,
      tipo: p.tipo,
      cliente: { nome: p.cliente_nome },
      prazo: p.prazo,
      criado_em: p.criado_em, // <-- Adicionado aqui
      execucao: { status: '' },      // Preencha conforme sua lógica
      pagamento: { status: '' },     // Preencha conforme sua lógica
      entrega: { data: '', hora: '' } // Preencha conforme sua lógica
    }));

    res.json({ pedidos });
  } catch (err) {
    console.error('Erro ao listar pedidos:', err);
    res.status(500).json({ error: 'Erro ao listar pedidos.' });
  }
});

// rota para apagar pedido

app.delete('/api/pedidos/:protocolo', authenticate, async (req, res) => {
  try {
    const { protocolo } = req.params;
    
    // Primeiro, busca o ID do pedido
    const pedidoRes = await pool.query('SELECT id FROM pedidos WHERE protocolo = $1', [protocolo]);
    if (pedidoRes.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }
    
    const pedidoId = pedidoRes.rows[0].id;
    
    // Remove os combos associados primeiro (devido à foreign key)
    await pool.query('DELETE FROM pedido_combos WHERE pedido_id = $1', [pedidoId]);
    
    // Remove o pedido
    await pool.query('DELETE FROM pedidos WHERE id = $1', [pedidoId]);
    
    res.json({ message: 'Pedido excluído com sucesso.' });
  } catch (err) {
    console.error('Erro ao excluir pedido:', err);
    res.status(500).json({ error: 'Erro ao excluir pedido.' });
  }
});

//rota para buscar pedido por protocolo - inclui valor_adiantado, usuario e observacao
app.get('/api/pedidos/:protocolo', authenticate, async (req, res) => {
  try {
    const { protocolo } = req.params;
    const pedidoRes = await pool.query(`
      SELECT p.id, p.protocolo, p.tipo, p.descricao, p.prazo, p.criado_em,
             p.valor_adiantado, p.usuario, p.observacao, p.cliente_id,
             c.nome as cliente_nome, c.cpf, c.endereco, c.telefone, c.email
      FROM pedidos p
      LEFT JOIN clientes c ON p.cliente_id = c.id
      WHERE p.protocolo = $1
      LIMIT 1
    `, [protocolo]);
    
    if (pedidoRes.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }
    
    const p = pedidoRes.rows[0];

    // Buscar combos e atos do pedido

    const combosRes = await pool.query(`
      SELECT pc.combo_id, pc.ato_id, pc.quantidade, pc.codigo_tributario,
             c.nome as combo_nome,
             a.codigo as ato_codigo, a.descricao as ato_descricao, a.valor_final
      FROM pedido_combos pc
      LEFT JOIN combos c ON pc.combo_id = c.id
      LEFT JOIN atos a ON pc.ato_id = a.id
      WHERE pc.pedido_id = $1
    `, [p.id]);

    const combos = combosRes.rows.map(row => ({
      combo_id: row.combo_id,
      combo_nome: row.combo_nome,
      ato_id: row.ato_id,
      ato_codigo: row.ato_codigo,
      ato_descricao: row.ato_descricao,
      valor_final: row.valor_final,
      quantidade: row.quantidade,
      codigo_tributario: row.codigo_tributario
    }));

    const pedido = {
      protocolo: p.protocolo,
      tipo: p.tipo,
      descricao: p.descricao,
      prazo: p.prazo,
      criado_em: p.criado_em,
      valor_adiantado: p.valor_adiantado,
      usuario: p.usuario,
      observacao: p.observacao,
      cliente_id: p.cliente_id, // Adiciona o cliente_id aqui
      cliente: {
        id: p.cliente_id, // Adiciona o ID do cliente dentro do objeto cliente
        nome: p.cliente_nome,
        cpf: p.cpf,
        endereco: p.endereco,
        telefone: p.telefone,
        email: p.email
      },
      combos,
      execucao: { status: '' },
      pagamento: { status: '' },
      entrega: { data: '', hora: '' }
    };
    
    res.json({ pedido });
  } catch (err) {
    console.error('Erro ao buscar pedido:', err);
    res.status(500).json({ error: 'Erro ao buscar pedido.' });
  }
});

//rota para listar combos

app.get('/api/combos', async (req, res) => {
  try {
    const combos = await pool.query(`
      SELECT c.id, c.nome, 
        COALESCE(json_agg(json_build_object('id', a.id, 'codigo', a.codigo, 'descricao', a.descricao)) FILTER (WHERE a.id IS NOT NULL), '[]') AS atos
      FROM combos c
      LEFT JOIN combo_atos ca ON ca.combo_id = c.id
      LEFT JOIN atos a ON ca.ato_id = a.id
      GROUP BY c.id
      ORDER BY c.id
    `);
    res.json({ combos: combos.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar combos.' });
  }
});

// Buscar clientes
app.get('/api/clientes', async (req, res) => {
  const search = req.query.search || '';
  const result = await pool.query(
    `SELECT * FROM clientes
     WHERE nome ILIKE $1 OR cpf ILIKE $1
     ORDER BY nome LIMIT 10`,
    [`%${search}%`]
  );
  res.json({ clientes: result.rows });
});

// Salvar novo cliente
app.post('/api/clientes', async (req, res) => {
  const { nome, cpf, endereco, telefone, email } = req.body;
  const result = await pool.query(
    `INSERT INTO clientes (nome, cpf, endereco, telefone, email)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [nome, cpf, endereco, telefone, email]
  );
  res.json(result.rows[0]);
});

// Apagar cliente
app.delete('/api/clientes/:id', async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM clientes WHERE id = $1', [id]);
  res.json({ success: true });
});


module.exports = router;