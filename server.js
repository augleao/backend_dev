

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
const axios = require('axios');
const cron = require('node-cron');
const Tesseract = require('tesseract.js');
const RENDER_API_KEY = process.env.RENDER_API_KEY;

//const port = process.env.PORT || 3001;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // outras configs se necessário
});

// Criar tabela de conferências se não existir
const createConferenciasTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conferencias (
        id SERIAL PRIMARY KEY,
        protocolo VARCHAR(255) NOT NULL,
        usuario VARCHAR(255) NOT NULL,
        status VARCHAR(255) NOT NULL,
        observacao TEXT,
        data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    // erro removido: logs só na api/serventias
  }
}

cron.schedule('* * * * *', async () => {
  const RENDER_API_KEY = process.env.RENDER_API_KEY;
  const now = new Date();
  // Ajuste para fuso horário -3 (Brasília)
  const nowBRT = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const horaAtual = nowBRT.toTimeString().slice(0,5); // 'HH:MM' em Brasília
  let rows = [];
  let erroQuery = false;
  try {
    const result = await pool.query('SELECT postgres_id, horario, ativo FROM backup_agendado WHERE ativo = true');
    rows = result.rows;
  } catch (err) {
    erroQuery = true;
  }


  // Se não conseguiu buscar do banco ou não há linhas válidas, faz fallback para 00:01
  if (erroQuery || !rows.length) {
    if (horaAtual === '00:01') {
      try {
        // Busca todos os postgres_id ativos (se possível)
        let ids = [];
        if (!erroQuery) {
          ids = rows.map(r => r.postgres_id);
        } else {
          // Se nem conseguiu buscar, defina manualmente ou ignore
          // ids = ['id1', 'id2'];
        }
        for (const postgresId of ids) {
          try {
            const resp = await axios.post(`/api/admin/render/postgres/${postgresId}/export`);
          } catch (err) {
          }
        }
      } catch (err) {
      }
    }
    return;
  }

  // Comportamento normal: dispara backup conforme horário do banco
  for (const row of rows) {
    if (row.horario === horaAtual) {
      try {
        const resp = await axios.post(
          `https://api.render.com/v1/postgres/${row.postgres_id}/export`,
          {},
          {
      headers: {
        'Authorization': `Bearer ${RENDER_API_KEY}`,
        'Accept': 'application/json'
      }
          }
        );
      } catch (err) {
      }
    }
  }
});

const { preprocessImage } = require('./utils/imagePreprocess');

async function extrairDadosSeloPorOCR(imagePath) {
  try {
    // Pré-processa a imagem antes do OCR
    const preprocessedPath = await preprocessImage(imagePath);
    // Usar Tesseract com configurações melhoradas para OCR
    const { data: { text } } = await Tesseract.recognize(preprocessedPath, 'por', {
      logger: m => {},
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789áéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ:.,- ()',
    });
    // Usar a função melhorada de extração
    const dadosExtraidos = extrairDadosSeloMelhorado(text);
    // (Opcional) Remover arquivo temporário pré-processado
    try { require('fs').unlinkSync(preprocessedPath); } catch (e) {}
    return dadosExtraidos;
  } catch (error) {
    console.error('[BACKEND] Erro no OCR:', error);
    return {
      seloConsulta: '',
      codigoSeguranca: '',
      qtdAtos: null,
      atosPraticadosPor: '',
      valores: '',
      textoCompleto: ''
    };
  }
}

// Função auxiliar melhorada para extração de dados
function extrairDadosSeloMelhorado(texto) {
  // Normalizar o texto: remover caracteres especiais e normalizar espaços
  const textoNormalizado = texto
    .replace(/\s+/g, ' ')  // Múltiplos espaços para um só
    .replace(/[^\w\s:.-]/g, ' ')  // Remove caracteres especiais exceto : . -
    .trim();


  // === SELO DE CONSULTA ===
  const seloPatterns = [
    /SELO\s+DE\s+CONSULTA[:\s]*([A-Z0-9]+)/i,
    /Selo\s+Consulta[:\s]*([A-Z0-9]+)/i,
    /SELO[:\s]*([A-Z0-9]{8,})/i,
    /consulta[:\s]*([A-Z0-9]{8,})/i
  ];
  
  let seloConsulta = '';
  for (const pattern of seloPatterns) {
    const match = textoNormalizado.match(pattern);
    if (match && match[1]) {
      seloConsulta = match[1];
      break;
    }
  }

  // === CÓDIGO DE SEGURANÇA ===
  const codigoPatterns = [
    /CÓDIGO\s+DE\s+SEGURANÇA[:\s]*([\d\.\,\-]+)/i,
    /C\s*DIGO\s+DE\s+SEGURAN\s*A[:\s]*([\d\.\,\-]+)/i,
    /CODIGO\s+DE\s+SEGURANCA[:\s]*([\d\.\,\-]+)/i,
    /seguranca[:\s]*([\d\.\,\-]+)/i,
    /codigo\s+seguranca[:\s]*([\d\.\,\-]+)/i,
    // Padrão específico para o formato do TJ (números com pontos)
    /(\d{4}\.\d{4}\.\d{4}\.\d{4})/i,
    // Padrão mais flexível para capturar sequências de dígitos com pontos
    /(\d{3,4}[\.\-]\d{3,4}[\.\-]\d{3,4}[\.\-]\d{3,4})/i
  ];

  let codigoSeguranca = '';
  // Primeiro tenta no texto original
  for (const pattern of codigoPatterns) {
    const match = texto.match(pattern);
    if (match && match[1]) {
      codigoSeguranca = match[1];
      break;
    }
  }
  
  // Se não encontrou no texto original, tenta no normalizado
  if (!codigoSeguranca) {
    for (const pattern of codigoPatterns) {
      const match = textoNormalizado.match(pattern);
      if (match && match[1]) {
        codigoSeguranca = match[1];
        break;
      }
    }
  }

  // === QUANTIDADE DE ATOS ===
  const qtdPatterns = [
    // Padrões específicos para o formato do TJ
    /Quantidade\s+de\s+atos\s+praticados[:\s]*(\d+)/i,
    /Qtd\.?\s+Atos[:\s]*(\d+)/i,
    /Qtd\s+de\s+atos[:\s]*(\d+)/i,
    /quantidade[:\s]*(\d+)/i,
    /(\d+)\s+atos/i,
    // Captura números seguidos de código em parênteses como "1(7804)" - só o número
    /(\d+)\s*\(\d+\)/i,
    // Captura número isolado em linhas que podem representar quantidade
    /^(\d+)\s*$/m,
    // Padrão para formato "1 Elise" (onde Elise pode ser parte do OCR)
    /(\d+)\s+[A-Za-z]+/i
  ];

  let qtdAtos = null;
  let qtdAtosCompleto = '';
  
  // Primeiro tenta padrões específicos no texto original
  for (const pattern of qtdPatterns) {
    const match = texto.match(pattern);
    if (match && match[1]) {
      const numero = parseInt(match[1], 10);
      // Valida se é um número razoável para quantidade de atos (1-999)
      if (numero > 0 && numero < 1000) {
        qtdAtos = numero;
        break;
      }
    }
  }
  
  // Se não encontrou no texto original, tenta no normalizado
  if (qtdAtos === null) {
    for (const pattern of qtdPatterns) {
      const match = textoNormalizado.match(pattern);
      if (match && match[1]) {
        const numero = parseInt(match[1], 10);
        if (numero > 0 && numero < 1000) {
          qtdAtos = numero;
          break;
        }
      }
    }
  }

  // Captura informações adicionais dos atos (códigos entre parênteses)
  if (qtdAtos !== null) {
    
    // PRIMEIRO: Procurar e corrigir erros comuns do OCR
    
    // Padrão de erro comum: número seguido de 4+ dígitos e )
    // Ex: "117901)" deve ser "1(7901)"
    const erroOcrPatterns = [
      // Padrão: qtdAtos + 4 dígitos + )
      new RegExp(`\\b${qtdAtos}(\\d{4})\\)`, 'g'),
      // Padrão: qtdAtos + 4 dígitos + ), + mais números + )
      new RegExp(`\\b${qtdAtos}(\\d{4})\\),?\\s*(\\d+)\\)?`, 'g')
    ];
    
    let encontrado = false;
    for (const pattern of erroOcrPatterns) {
      const matches = [...texto.matchAll(pattern)];
      if (matches.length > 0) {
        for (const match of matches) {
          
          // Primeiro grupo: os 4 dígitos que devem ficar entre parênteses
          const codigo4Digitos = match[1];
          
          if (codigo4Digitos && codigo4Digitos.length === 4) {
            // Construir padrão correto: qtdAtos(4digitos)
            qtdAtosCompleto = `${qtdAtos}(${codigo4Digitos})`;
            
            // Se há mais números após, adicionar também
            if (match[2]) {
              qtdAtosCompleto += `, ${match[2]})`;
            }
            
            encontrado = true;
            break;
          }
        }
        if (encontrado) break;
      }
    }
    
    // Se não encontrou erro para corrigir, procurar padrões normais já corretos
    if (!encontrado) {
      const codigosAdicionaisPatterns = [
        // Captura sequência como "1(7802), 117901)" 
        new RegExp(`${qtdAtos}\\s*\\([^)]+\\)[^\\n]*`, 'i'),
        // Captura linha que contém códigos em parênteses
        /(\d+\s*\([^)]+\)[^)]*\))/i,
        // Captura qualquer sequência de números com parênteses na linha seguinte
        /(\d+\s*\([^)]+\)[^\\n]*)/i,
        // Padrão mais específico para "(7802), 117901)"
        /(\d+\s*\([^)]+\),?\s*\d*\)?)/i
      ];
      
      for (const pattern of codigosAdicionaisPatterns) {
        const match = texto.match(pattern);
        if (match && match[0]) {
          qtdAtosCompleto = match[0].trim();
          encontrado = true;
          break;
        }
      }

      // Padrão alternativo: procurar 4 dígitos isolados próximos à quantidade
      if (!encontrado) {
        const digitosProximosPattern = new RegExp(`${qtdAtos}[^\\d\\n]{0,10}(\\d{4})[^\\d]`, 'i');
        const digitosMatch = texto.match(digitosProximosPattern);
        if (digitosMatch) {
          qtdAtosCompleto = `${qtdAtos}(${digitosMatch[1]})`;
        }
      }
    }
  }

  // Garantir que usemos qtdAtosCompleto quando disponível
  if (qtdAtosCompleto) {
  } else if (qtdAtos !== null) {
    qtdAtosCompleto = qtdAtos.toString();
  }

  // Log final para debug

  // Usar qtdAtosCompleto (string) como valor principal para qtdAtos
  const qtdAtosFinal = qtdAtosCompleto || (qtdAtos ? qtdAtos.toString() : null);

  // === ATOS PRATICADOS POR ===
  const atosPorPatterns = [
    /Praticado\(s\)\s+por[:\s]*([^\n\r]+?)(?:\n|\r|$)/i,
    /Atos\s+praticados\s+por[:\s]*([^\n\r]+?)(?:\n|\r|$)/i,
    /praticado\s+por[:\s]*([^\n\r]+?)(?:\n|\r|$)/i,
    /Por[:\s]*([A-Z][^\n\r]+?)(?:\n|\r|$)/i
  ];

  let atosPraticadosPor = '';
  for (const pattern of atosPorPatterns) {
    const match = texto.match(pattern);  // Usando texto original para nomes
    if (match && match[1] && match[1].trim().length > 3) {
      let nome = match[1].trim();
      
      
      // Remove caracteres estranhos e lixo do OCR no final da linha
      nome = nome
        // Remove tudo após hífen seguido de texto minúsculo (provável lixo do OCR)
        .replace(/\s*-\s*[a-z\s]+$/i, '')
        // Remove sequências suspeitas de maiúsculas e minúsculas misturadas no final (como RRFRcSaSoS)
        .replace(/\s+[A-Za-z]*[A-Z][a-z][A-Z][a-z][A-Za-z]*\s*$/g, '')
        // Remove sequências de 4+ caracteres misturando maiúsculas/minúsculas no final
        .replace(/\s+[A-Za-z]{4,}[A-Z][a-z][A-Za-z]*\s*$/g, '')
        // Remove palavras com padrão estranho de maiúsculas/minúsculas (ex: RRFRcSaSoS)
        .replace(/\s+[A-Z]{2,}[a-z]+[A-Z]+[a-z]*[A-Z]*[a-z]*\s*$/g, '')
        // Remove sequências de caracteres repetidos ou aleatórios no final
        .replace(/\s+[A-Za-z]*([A-Z]{2,}|[a-z]{1}[A-Z]{1}){2,}[A-Za-z]*\s*$/g, '')
        // Remove sequências de caracteres estranhos no final
        .replace(/\s*[^\w\s]+\s*[a-z\s]*$/i, '')
        // Remove palavras isoladas de 1-3 caracteres no final (provável lixo)
        .replace(/\s+[a-z]{1,3}(\s+[a-z]{1,3})*\s*$/i, '')
        // Remove números isolados no final
        .replace(/\s+\d+\s*$/g, '')
        // Remove palavras que não sejam nomes típicos (contendo muitas alterações de case)
        .replace(/\s+\b[A-Za-z]*[A-Z][a-z][A-Z][A-Za-z]*\b\s*$/g, '')
        // Remove caracteres especiais, exceto espaços, hífens em nomes e pontos
        .replace(/[^\w\sÀ-ÿ\-\.]/g, ' ')
        // Normaliza espaços múltiplos
        .replace(/\s+/g, ' ')
        .trim();
      
      console.log(`[OCR] Nome após limpeza: "${nome}"`);
      
      // Verifica se o nome ainda tem um tamanho razoável (nomes muito curtos podem ser lixo)
      if (nome.length > 5) {
        atosPraticadosPor = nome;
        console.log(`[OCR] Nome final aceito: "${atosPraticadosPor}"`);
        break;
      } else {
        console.log(`[OCR] Nome rejeitado (muito curto): "${nome}"`);
      }
    }
  }

  // === VALORES ===
  // Extrai todos os valores monetários encontrados no texto ORIGINAL (não normalizado)
  const valoresEncontrados = [];
  
  // Padrões para encontrar valores específicos com suas etiquetas no texto original
  const valoresEspecificos = [
    { nome: 'Emol', pattern: /Emol\.?[:\s]*R\$?\s*([\d,\.]+)/gi },
    { nome: 'Tx. Judic', pattern: /Tx\.?\s*Judic\.?[:\s]*R\$?\s*([\d,\.]+)/gi },
    { nome: 'Total', pattern: /Total[:\s]*R\$?\s*([\d,\.]+)/gi },
    { nome: 'ISS', pattern: /ISS[:\s]*R\$?\s*([\d,\.]+)/gi },
    { nome: 'ISSQN', pattern: /ISSQN[:\s]*R\$?\s*([\d,\.]+)/gi },
    { nome: 'Taxa', pattern: /Taxa[:\s]*R\$?\s*([\d,\.]+)/gi }
  ];
  
  // Busca valores específicos com etiquetas no texto ORIGINAL
  for (const valorEspecifico of valoresEspecificos) {
    let match;
    while ((match = valorEspecifico.pattern.exec(texto)) !== null) {
      valoresEncontrados.push({
        tipo: valorEspecifico.nome,
        valor: match[1],
        posicao: match.index
      });
    }
  }
  
  // Se não encontrou valores específicos, busca padrão geral no texto original
  if (valoresEncontrados.length === 0) {
    const padraoGeralValores = /R\$\s*([\d]{1,3}(?:[,\.]\d{2})?)/gi;
    let matchGeral;
    while ((matchGeral = padraoGeralValores.exec(texto)) !== null) {
      valoresEncontrados.push({
        tipo: 'Valor',
        valor: matchGeral[1],
        posicao: matchGeral.index
      });
    }
  }
  
  // Ordena valores por posição no texto
  valoresEncontrados.sort((a, b) => a.posicao - b.posicao);
  
  // Cria string com todos os valores encontrados
  const valores = valoresEncontrados.length > 0 
    ? valoresEncontrados.map(v => `${v.tipo}: R$ ${v.valor}`).join(' - ')
    : '';
  
  console.log('[OCR] Valores encontrados:', valoresEncontrados);

  const resultado = {
    seloConsulta,
    codigoSeguranca,
    qtdAtos: qtdAtosFinal,  // Usar a quantidade completa com códigos (string)
    atosPraticadosPor,
    valores,
    textoCompleto: texto
  };

  console.log('[OCR] Resultado da extração melhorada:', {
    ...resultado,
    ...(qtdAtosCompleto && { qtdAtosDetalhe: `Quantidade base: ${qtdAtos}, Completo: ${qtdAtosCompleto}` })
  });
  
  return resultado;
}

// Executar criação da tabela
//createConferenciasTable();

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
const JWT_SECRET = process.env.JWT_SECRET || '7a3dfb677e3250bb4584e40d672a7229';
//const jwt = require('jsonwebtoken');
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
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
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/bmp',
      'image/gif',
      'image/webp'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de imagem ou PDF são permitidos!'));
    }
  }
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
      `SELECT id, codigo, descricao, valor_final, issqn FROM atos
       WHERE codigo ILIKE $1 OR descricao ILIKE $1
       ORDER BY codigo
       LIMIT 20`,
      [`%${search}%`]
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
  const data = req.query.data;
  const serventia = req.query.serventia;
  const usuario = req.user;

  console.log('[ATOS-PAGOS][GET] Parâmetros recebidos:', { data, serventia, usuario });

  if (!data) {
    console.warn('[ATOS-PAGOS][GET] Parâmetro data ausente');
    return res.status(400).json({ message: 'Parâmetro data é obrigatório.' });
  }
  if (!usuario) {
    console.warn('[ATOS-PAGOS][GET] Usuário não autenticado');
    return res.status(401).json({ message: 'Usuário não autenticado.' });
  }
  if (!serventia) {
    console.warn('[ATOS-PAGOS][GET] Parâmetro serventia ausente');
    return res.status(400).json({ message: 'Parâmetro serventia é obrigatório.' });
  }

  try {
    // 1. Verifica se a serventia está com caixa unificado
    const configResult = await pool.query(
      'SELECT caixaUnificado FROM serventia WHERE nome_abreviado = $1',
      [serventia]
    );
    console.log('[ATOS-PAGOS][GET] Resultado configResult:', configResult.rows);
    const caixaUnificado = configResult.rows[0]?.caixaunificado;

    let result;
    if (caixaUnificado) {
      // 2. Busca todos os usuários da serventia
      const usuariosResult = await pool.query(
        'SELECT nome FROM users WHERE serventia = $1',
        [serventia]
      );
      const nomesUsuarios = usuariosResult.rows.map(u => u.nome);
      console.log('[ATOS-PAGOS][GET] nomesUsuarios:', nomesUsuarios);

      if (nomesUsuarios.length === 0) {
        console.log('[ATOS-PAGOS][GET] Nenhum usuário encontrado para a serventia');
        return res.json({ CaixaDiario: [] });
      }

      // 3. Busca todos os atos do dia para esses usuários
      result = await pool.query(
        `SELECT id, data, hora, codigo, descricao, quantidade, valor_unitario, pagamentos, usuario
         FROM atos_pagos
         WHERE data = $1 AND usuario = ANY($2)
         ORDER BY hora`,
        [data, nomesUsuarios]
      );
      console.log('[ATOS-PAGOS][GET] Resultados atos pagos (unificado):', result.rows);
    } else {
      // 4. Apenas os atos do usuário logado
      result = await pool.query(
        `SELECT id, data, hora, codigo, descricao, quantidade, valor_unitario, pagamentos, usuario
         FROM atos_pagos
         WHERE data = $1 AND usuario = $2
         ORDER BY hora`,
        [data, usuario.nome]
      );
      console.log('[ATOS-PAGOS][GET] Resultados atos pagos (usuário):', result.rows);
    }
    res.json({ CaixaDiario: result.rows });
  } catch (err) {
    console.error('[ATOS-PAGOS][GET] Erro ao buscar atos pagos:', err);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});
/*
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
*/
// Rota para adicionar um ato pago com usuário
app.post('/api/atos-pagos', authenticate, async (req, res) => {
  const { data, hora, codigo, descricao, quantidade, valor_unitario, pagamentos } = req.body;
  const usuarioAutenticado = req.user;
  const usuarioId = usuarioAutenticado.nome;

  console.log('[ATOS-PAGOS][POST] Dados recebidos:', {
    data, hora, codigo, descricao, quantidade, valor_unitario, pagamentos, usuarioId
  });

  // Verificação para códigos 0001 e 0005
  if (codigo === '0001' || codigo === '0005') {
    try {
      const existe = await pool.query(
        `SELECT 1 FROM atos_pagos WHERE data = $1 AND usuario = $2 AND codigo = $3`,
        [data, usuarioId, codigo]
      );
      if (existe.rowCount > 0) {
        console.warn('[ATOS-PAGOS][POST] Já existe ato com código', codigo, 'para', data, usuarioId);
        return res.status(409).json({ message: `Já existe um ato com código ${codigo} para este dia e usuário.` });
      }
    } catch (err) {
      console.error('[ATOS-PAGOS][POST] Erro ao verificar duplicidade:', err);
      return res.status(500).json({ message: 'Erro ao verificar duplicidade.', details: err.message });
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
    console.log('[ATOS-PAGOS][POST] Sucesso ao inserir:', result.rows[0]);
    res.status(201).json({ atoPago: result.rows[0], message: 'Ato pago cadastrado com sucesso!' });
  } catch (err) {
    console.error('[ATOS-PAGOS][POST] Erro ao cadastrar ato pago:', err);
    res.status(500).json({ message: 'Erro interno ao cadastrar ato pago.', details: err.message });
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


// rota para buscar o status do pedido


// rota Express para sugestões de códigos tributários
app.get('/api/codigos-tributarios', async (req, res) => {
  const termo = req.query.s || '';
  if (termo.length < 2) return res.json({ sugestoes: [] });

  // Exemplo usando PostgreSQL (ajuste para seu banco)
  const query = `
    SELECT codigo, descricao
    FROM codigos_gratuitos
    WHERE codigo ILIKE $1 OR descricao ILIKE $1
    ORDER BY codigo
    LIMIT 10
  `;
  const values = [`%${termo}%`];
  try {
    const { rows } = await pool.query(query, values);
    res.json({ sugestoes: rows });
  } catch (err) {
    console.error('Erro ao buscar códigos tributários:', err);
    res.status(500).json({ sugestoes: [] });
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
app.post('/api/pedidos-criar', authenticate, async (req, res) => {
  try {
    const { 
      protocolo, tipo, descricao, prazo, clienteId, valorAdiantado, valorAdiantadoDetalhes, observacao, 
      combos, usuario, origem, origemInfo 
    } = req.body;

    console.log('[POST] /api/pedidos - dados recebidos:', {
      protocolo, tipo, descricao, prazo, clienteId, valorAdiantado, observacao, 
      combos, usuario, origem, origemInfo
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
          SET tipo = $1, descricao = $2, prazo = $3, cliente_id = $4, valor_adiantado = $5, valor_adiantado_detalhes = $6, observacao = $7, usuario = $8, origem = $9, origem_info = $10
          WHERE id = $11
        `, [tipo, descricao, prazo, clienteId, valorAdiantado, JSON.stringify(valorAdiantadoDetalhes), observacao, usuario, origem, origemInfo, pedidoId]);

        // Remove combos antigos
        await pool.query('DELETE FROM pedido_combos WHERE pedido_id = $1', [pedidoId]);
        
        // Adiciona novos combos
        if (Array.isArray(combos)) {
  for (const combo of combos) {
    // Busca valor_final e issqn do ato no banco
    const atoRes = await pool.query(
      'SELECT valor_final, issqn FROM atos WHERE id = $1',
      [combo.ato_id]
    );
    const ato = atoRes.rows[0] || {};
    await pool.query(`
      INSERT INTO pedido_combos (
        pedido_id, combo_id, ato_id, quantidade, codigo_tributario,
        tipo_registro, nome_registrados, livro, folha, termo,
        valor_final, issqn
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      pedidoId, combo.combo_id, combo.ato_id, combo.quantidade, combo.codigo_tributario,
      combo.tipo_registro || null, combo.nome_registrados || null, combo.livro || null, combo.folha || null, combo.termo || null,
      ato.valor_final, ato.issqn
    ]);
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

    // Criação do novo pedido com os novos campos
    const result = await pool.query(`
      INSERT INTO pedidos (protocolo, tipo, descricao, prazo, cliente_id, valor_adiantado, valor_adiantado_detalhes, observacao, usuario, origem, origem_info)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `, [novoProtocolo, tipo, descricao, prazo, clienteId, valorAdiantado, JSON.stringify(valorAdiantadoDetalhes), observacao, usuario, origem, origemInfo]);
    const pedidoId = result.rows[0].id;

    // Inserir combos se houver
    if (Array.isArray(combos)) {
      for (const combo of combos) {
        // Busca valor_final e issqn do ato no banco
        const atoRes = await pool.query(
          'SELECT valor_final, issqn FROM atos WHERE id = $1',
          [combo.ato_id]
        );
        const ato = atoRes.rows[0] || {};
        await pool.query(`
          INSERT INTO pedido_combos (
            pedido_id, combo_id, ato_id, quantidade, codigo_tributario,
            tipo_registro, nome_registrados, livro, folha, termo,
            valor_final, issqn
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          pedidoId, combo.combo_id, combo.ato_id, combo.quantidade, combo.codigo_tributario,
          combo.tipo_registro || null, combo.nome_registrados || null, combo.livro || null, combo.folha || null, combo.termo || null,
          ato.valor_final, ato.issqn
        ]);
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
             p.valor_adiantado, p.valor_adiantado_detalhes, p.usuario, p.observacao,
             p.origem, p.origem_info,
             c.nome as cliente_nome
      FROM pedidos p
      LEFT JOIN clientes c ON p.cliente_id = c.id
      ORDER BY p.id DESC
    `);
    console.log('pedidos listados no DB:', pedidosRes);
    console.log('[DEBUG] Primeiro pedido raw:', pedidosRes.rows[0]);
    console.log('[DEBUG] valor_adiantado_detalhes do primeiro pedido:', pedidosRes.rows[0]?.valor_adiantado_detalhes);
    console.log('[DEBUG] Tipo do valor_adiantado_detalhes:', typeof pedidosRes.rows[0]?.valor_adiantado_detalhes);

    const pedidos = pedidosRes.rows.map(p => {
      // Processar valor_adiantado_detalhes
      let valorAdiantadoDetalhes = [];
      if (p.valor_adiantado_detalhes) {
        try {
          // Como é JSONB, pode vir já como objeto ou string
          if (typeof p.valor_adiantado_detalhes === 'object') {
            valorAdiantadoDetalhes = p.valor_adiantado_detalhes;
          } else if (typeof p.valor_adiantado_detalhes === 'string') {
            valorAdiantadoDetalhes = JSON.parse(p.valor_adiantado_detalhes);
          }
        } catch (e) {
          console.error('Erro ao processar valor_adiantado_detalhes:', e);
          valorAdiantadoDetalhes = [];
        }
      }
      
      return {
        protocolo: p.protocolo,
        tipo: p.tipo,
        cliente: { nome: p.cliente_nome },
        prazo: p.prazo,
        criado_em: p.criado_em,
        descricao: p.descricao,
        valor_adiantado: p.valor_adiantado,
        valorAdiantadoDetalhes: valorAdiantadoDetalhes,
        usuario: p.usuario,
        observacao: p.observacao,
        origem: p.origem,
        origemInfo: p.origem_info,
        execucao: { status: '' },
        pagamento: { status: '' },
        entrega: { data: '', hora: '' }
      };
    });

    res.json({ pedidos });
  } catch (err) {
    console.error('Erro ao listar pedidos:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao listar pedidos.', details: err && err.message ? err.message : String(err) });
    }
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
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao excluir pedido.', details: err && err.message ? err.message : String(err) });
    }
  }
});

//rota para buscar pedido por protocolo - inclui valor_adiantado, usuario e observacao
app.get('/api/pedidos/:protocolo', authenticate, async (req, res) => {
  try {
    const { protocolo } = req.params;
    const pedidoRes = await pool.query(`
      SELECT p.id, p.protocolo, p.tipo, p.descricao, p.prazo, p.criado_em,
             p.valor_adiantado, p.valor_adiantado_detalhes, p.usuario, p.observacao, p.cliente_id,
             p.origem, p.origem_info,
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

    // Buscar o último status do pedido
    const statusRes = await pool.query(
      `SELECT status FROM pedido_status WHERE protocolo = $1 ORDER BY data_hora DESC LIMIT 1`,
      [protocolo]
    );
    const ultimoStatus = statusRes.rows.length > 0 ? statusRes.rows[0].status : '';

    // Buscar combos e atos do pedido, incluindo campos extras
    const combosRes = await pool.query(`
      SELECT pc.combo_id, pc.ato_id, pc.quantidade, pc.codigo_tributario,
             pc.tipo_registro, pc.nome_registrados, pc.livro, pc.folha, pc.termo,
             pc.valor_final, pc.issqn,
             c.nome as combo_nome,
             a.codigo as ato_codigo, a.descricao as ato_descricao
      FROM pedido_combos pc
      LEFT JOIN combos c ON pc.combo_id = c.id
      LEFT JOIN atos a ON pc.ato_id = a.id
      WHERE pc.pedido_id = $1
    `, [p.id]);
    console.log('[PEDIDOS][GET] Combos retornados do banco:', combosRes.rows);
    const combos = combosRes.rows.map(row => ({
      combo_id: row.combo_id,
      combo_nome: row.combo_nome,
      ato_id: row.ato_id,
      ato_codigo: row.ato_codigo,
      ato_descricao: row.ato_descricao,
      valor_final: row.valor_final,
      issqn: row.issqn,
      quantidade: row.quantidade,
      codigo_tributario: row.codigo_tributario,
      tipo_registro: row.tipo_registro,
      nome_registrados: row.nome_registrados,
      livro: row.livro,
      folha: row.folha,
      termo: row.termo
    }));

    let detalhes = [];
    if (p.valor_adiantado_detalhes) {
      try {
        // Como é JSONB, pode vir já como objeto ou string
        if (typeof p.valor_adiantado_detalhes === 'object') {
          detalhes = p.valor_adiantado_detalhes;
        } else if (typeof p.valor_adiantado_detalhes === 'string') {
          detalhes = JSON.parse(p.valor_adiantado_detalhes);
        }
      } catch (e) {
        console.error('Erro ao processar valor_adiantado_detalhes:', e);
        detalhes = [];
      }
    }
    // Buscar entrega_servico pelo protocolo
    let entrega = null;
    try {
      const entregaRes = await pool.query(
        'SELECT id, protocolo, data, hora, retirado_por, usuario, criado_em FROM entrega_servico WHERE protocolo = $1 ORDER BY criado_em DESC LIMIT 1',
        [p.protocolo]
      );
      if (entregaRes.rows.length > 0) {
        entrega = entregaRes.rows[0];
      }
    } catch (e) {
      entrega = null;
    }

    const pedido = {
      protocolo: p.protocolo,
      tipo: p.tipo,
      descricao: p.descricao,
      prazo: p.prazo,
      criado_em: p.criado_em,
      valor_adiantado: p.valor_adiantado,
      valorAdiantadoDetalhes: detalhes,
      usuario: p.usuario,
      observacao: p.observacao,
      origem: p.origem,
      origemInfo: p.origem_info,
      status: ultimoStatus,
      cliente_id: p.cliente_id,
      cliente: {
        id: p.cliente_id,
        nome: p.cliente_nome,
        cpf: p.cpf,
        endereco: p.endereco,
        telefone: p.telefone,
        email: p.email
      },
      combos,
      execucao: { status: '' },
      pagamento: { status: '' },
      entrega
    };
    res.json({ pedido });
  } catch (err) {
    console.error('Erro ao buscar pedido:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao buscar pedido.', details: err && err.message ? err.message : String(err) });
    }
  }
});



// GET: retorna config da serventia
app.get('/api/configuracoes-serventia', async (req, res) => {
  const { serventia } = req.query;
  if (!serventia) return res.status(400).json({ error: 'serventia obrigatória' });
  try {
    console.log('[CONFIGURACOES SERVENTIA][GET] Valor recebido:', serventia, '| Length:', serventia.length);
    const result = await pool.query(
      'SELECT caixaUnificado FROM serventia WHERE nome_abreviado = $1 LIMIT 1',
      [serventia]
    );
    console.log('[CONFIGURACOES SERVENTIA][GET] Resultado da query:', result.rows);
    if (!result.rows || result.rows.length === 0) return res.json({});
    res.json({ caixa_unificado: !!result.rows[0].caixaunificado });
  } catch (err) {
    console.error('[CONFIGURACOES SERVENTIA][GET] Erro:', err);
    res.status(500).json({ error: 'Erro ao buscar configuração', details: err.message });
  }
});

// POST: atualiza config da serventia
app.post('/api/configuracoes-serventia', async (req, res) => {
  const { serventia, caixa_unificado } = req.body;
  if (!serventia) return res.status(400).json({ error: 'serventia obrigatória' });
  try {
    console.log('[CONFIGURACOES SERVENTIA][POST] Body recebido:', req.body);
    await pool.query(
      'UPDATE serventia SET caixaUnificado = $1 WHERE nome_abreviado = $2',
      [!!caixa_unificado, serventia]
    );
    console.log('[CONFIGURACOES SERVENTIA][POST] Atualização realizada para:', serventia);
    res.json({ ok: true });
  } catch (err) {
    console.error('[CONFIGURACOES SERVENTIA][POST] Erro:', err);
    res.status(500).json({ error: 'Erro ao atualizar configuração', details: err.message });
  }
});

//rota para obter lista dos pedidos com o ultimo status
app.get('/api/pedidos/:protocolo/status/ultimo', async (req, res) => {
  const { protocolo } = req.params;
  try {
    const result = await pool.query(
      `SELECT status FROM pedido_status
       WHERE protocolo = $1
       ORDER BY data_hora DESC, id DESC
       LIMIT 1`,
      [protocolo]
    );
    if (result.rows.length > 0) {
      res.json({ status: result.rows[0].status });
    } else {
      res.json({ status: '-' });
    }
  } catch (err) {
    console.error('Erro ao buscar último status:', err);
    res.status(500).json({ error: 'Erro ao buscar status' });
  }
});


// rota para salvar o status do pedido
// Certifique-se de importar ou definir o pool corretamente no topo do seu arquivo:
// const { pool } = require('./db'); // ou conforme seu projeto

app.post('/api/pedidos/:protocolo/status', async (req, res) => {
  const { status, usuario } = req.body;
  const protocolo = req.params.protocolo;
  console.log('[STATUS API] Protocolo:', protocolo);
  console.log('[STATUS API] Body:', req.body);
  if (!status || !usuario) {
    console.log('[STATUS API] Faltando status ou usuario');
    return res.status(400).json({ error: 'Campos status e usuario são obrigatórios.' });
  }
  try {
    console.log('[STATUS API] Executando INSERT em pedido_status');
    const result = await pool.query(
      'INSERT INTO pedido_status (protocolo, status, usuario, data_hora) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [protocolo, status, usuario]
    );
    console.log('[STATUS API] INSERT result:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[STATUS API] Erro ao salvar status:', err);
    res.status(500).json({ error: 'Erro ao salvar status' });
  }
});

// Criação do registro de pagamento
app.post('/api/pedido_pagamento', async (req, res) => {
  try {
    const {
      protocolo,
      valorAtos,
      valorAdicional,
      totalAdiantado,
      usuario,
      data,
      hora,
      complementos // novo campo JSON
    } = req.body;

    await pool.query(
      `INSERT INTO pedido_pagamento
        (protocolo, valor_atos, valor_adicional, total_adiantado, usuario, data, hora, complemento_pagamento)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [protocolo, valorAtos, valorAdicional, totalAdiantado, usuario, data, hora, complementos ? JSON.stringify(complementos) : null]
    );

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Erro ao salvar pedido_pagamento:', err);
    res.status(500).json({ error: 'Erro ao salvar pagamento' });
  }
});

// GET /pedido_pagamento/:protocolo
app.get('/api/pedido_pagamento/:protocolo', async (req, res) => {
  const { protocolo } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM pedido_pagamento WHERE protocolo = $1 LIMIT 1',
      [protocolo]
    );
    if (result.rows.length > 0) {
      const pagamento = result.rows[0];
      // Padronizar para sempre retornar no campo complementos_pagamento (plural)
      if (pagamento.complemento_pagamento) {
        try {
          pagamento.complementos_pagamento = JSON.parse(pagamento.complemento_pagamento);
        } catch (e) {
          pagamento.complementos_pagamento = null;
        }
      } else {
        pagamento.complementos_pagamento = null;
      }
      res.json(pagamento);
    } else {
      res.status(404).json({ error: 'Pagamento não encontrado' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar pagamento' });
  }
});

// DELETE /pedido_pagamento/:protocolo
app.delete('/api/pedido_pagamento/:protocolo', async (req, res) => {
  const { protocolo } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM pedido_pagamento WHERE protocolo = $1',
      [protocolo]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir pagamento' });
  }
});


//rota para buscar recibo do pedido
app.get('/api/recibo/:protocolo', async (req, res) => {
  const { protocolo } = req.params;
  try {
    console.log(`[RECIBO] Buscando recibo para protocolo: ${protocolo}`);
    const pedidoRes = await pool.query(
      `SELECT 
         p.protocolo, p.descricao, p.prazo, p.criado_em, p.cliente_id, 
         p.valor_adiantado_detalhes,
         c.nome as cliente_nome, c.telefone, c.cpf,
         u.serventia as usuario_serventia,
         s.nome_abreviado, s.nome_completo, s.endereco, s.cnpj, 
         s.telefone as telefone_cartorio, s.email, s.whatsapp, s.cns
       FROM pedidos p
       LEFT JOIN clientes c ON p.cliente_id = c.id
       LEFT JOIN users u ON p.usuario = u.nome
       LEFT JOIN serventia s ON s.nome_abreviado = u.serventia
       WHERE p.protocolo = $1`, [protocolo]
    );
    console.log('[RECIBO] Resultado do SELECT:', pedidoRes.rows);
    if (pedidoRes.rows.length === 0) {
      console.log('[RECIBO] Pedido não encontrado para protocolo:', protocolo);
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }
    const pedido = pedidoRes.rows[0];
    console.log('[RECIBO] Campos retornados:', Object.keys(pedido));
    console.log('[RECIBO] valor_adiantado_detalhes (raw):', pedido.valor_adiantado_detalhes);
    console.log('[RECIBO] Tipo do valor_adiantado_detalhes:', typeof pedido.valor_adiantado_detalhes);
    
    let detalhes = [];
    
    // Como é JSONB, pode vir já como objeto ou string
    if (pedido.valor_adiantado_detalhes) {
      if (typeof pedido.valor_adiantado_detalhes === 'object') {
        // Já é um objeto (JSONB retorna como objeto)
        detalhes = pedido.valor_adiantado_detalhes;
        console.log('[RECIBO] valor_adiantado_detalhes já é objeto:', detalhes);
      } else if (typeof pedido.valor_adiantado_detalhes === 'string') {
        // É string, precisa fazer parse
        try {
          detalhes = JSON.parse(pedido.valor_adiantado_detalhes);
          console.log('[RECIBO] valor_adiantado_detalhes parseado:', detalhes);
        } catch (e) {
          console.log('[RECIBO] Erro ao fazer parse de valor_adiantado_detalhes:', e);
          detalhes = [];
        }
      }
    } else {
      console.log('[RECIBO] valor_adiantado_detalhes está null/undefined/empty');
    }
    res.json({
      pedido: {
        protocolo: pedido.protocolo,
        descricao: pedido.descricao,
        prazo: pedido.prazo,
        criado_em: pedido.criado_em,
        valorAdiantadoDetalhes: detalhes,
  cliente: { nome: pedido.cliente_nome, telefone: pedido.telefone, cpf: pedido.cpf },
        serventia: {
          nome_abreviado: pedido.nome_abreviado,
          nome_completo: pedido.nome_completo,
          endereco: pedido.endereco,
          cnpj: pedido.cnpj,
          telefone: pedido.telefone_cartorio,
          email: pedido.email,
          whatsapp: pedido.whatsapp,
          cns: pedido.cns
        }
      }
    });
  } catch (err) {
    console.log('[RECIBO] Erro ao buscar pedido:', err);
    res.status(500).json({ error: 'Erro ao buscar pedido.' });
  }
});

// Buscar todas as conferências de um protocolo
app.get('/api/conferencias', async (req, res) => {
  try {
    const { protocolo } = req.query;
    if (!protocolo) return res.status(400).json({ error: 'Protocolo obrigatório' });
    
    const result = await pool.query(
      'SELECT * FROM conferencias WHERE protocolo = $1 ORDER BY data_hora DESC',
      [protocolo]
    );
    
    res.json({ conferencias: result.rows });
  } catch (error) {
    console.error('Erro ao buscar conferências:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Adicionar uma nova conferência
app.post('/api/conferencias', async (req, res) => {
  try {
    const { protocolo, usuario, status, observacao } = req.body;
    if (!protocolo || !usuario || !status) {
      return res.status(400).json({ error: 'Campos obrigatórios: protocolo, usuario, status' });
    }
    
    const result = await pool.query(
      'INSERT INTO conferencias (protocolo, usuario, status, observacao, data_hora) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
      [protocolo, usuario, status, observacao]
    );
    
    res.status(201).json({ conferencia: result.rows[0] });
  } catch (error) {
    console.error('Erro ao criar conferência:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Atualizar uma conferência existente (PUT)
app.put('/api/conferencias/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, observacao } = req.body;
    
    const result = await pool.query(
      'UPDATE conferencias SET status = COALESCE($1, status), observacao = COALESCE($2, observacao) WHERE id = $3 RETURNING *',
      [status, observacao, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conferência não encontrada' });
    }
    
    res.json({ conferencia: result.rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar conferência:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Apagar uma conferência (DELETE)
app.delete('/api/conferencias/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM conferencias WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conferência não encontrada' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar conferência:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
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

// Middleware para verificar se o usuário é admin
const authenticateAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Token não fornecido' });
    }
    
    // Logar o valor do segredo JWT para depuração
    //console.log('JWT_SECRET em uso:', process.env.JWT_SECRET);
    // Verificar e decodificar o token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Por enquanto, assumir que qualquer token válido tem acesso de admin
    // Aqui você pode adicionar verificações mais específicas conforme necessário
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Erro na autenticação:', error);
    res.status(401).json({ message: 'Token inválido' });
  }
};

// GET /admin/render/services
app.get('/api/admin/render/services', authenticateAdmin, async (req, res) => {
  try {
    const response = await fetch('https://api.render.com/v1/services', {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.RENDER_API_KEY}`
      }
    });
    if (response.ok) {
      const data = await response.json();
      console.log('[RENDER][GET /services] Resposta:', JSON.stringify(data, null, 2));
      // Filtrar apenas serviços PostgreSQL
      const dbServices = data.filter(service => 
        service.type === 'postgresql' || service.type === 'database'
      );
      res.json({ services: dbServices });
    } else {
      let rawBody = await response.text();
      console.log('[RENDER][GET /services] Erro resposta:', rawBody);
      let errorData;
      try {
        errorData = JSON.parse(rawBody);
      } catch (e) {
        errorData = { raw: rawBody };
      }
      res.status(response.status).json({ 
        message: 'Erro ao buscar serviços do Render', 
        error: errorData 
      });
    }
  } catch (error) {
    console.error('Erro ao buscar serviços:', error);
    res.status(500).json({ message: 'Erro interno do servidor', error: error.message });
  }
});

// POST /admin/render/services/:serviceId/backup
app.post('/api/admin/render/services/:serviceId/backup', authenticateAdmin, async (req, res) => {
  try {
    const { serviceId } = req.params;
    
    const response = await fetch(`https://api.render.com/v1/services/${serviceId}/backups`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.RENDER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('[RENDER][POST /services/:serviceId/backup] Resposta:', JSON.stringify(data, null, 2));
      res.json({ message: 'Backup criado com sucesso', data });
    } else {
      const errorData = await response.json();
      console.log('[RENDER][POST /services/:serviceId/backup] Erro resposta:', JSON.stringify(errorData, null, 2));
      res.status(response.status).json({ 
        message: 'Erro ao criar backup', 
        error: errorData 
      });
    }
  } catch (error) {
    console.error('Erro ao criar backup:', error);
    res.status(500).json({ message: 'Erro interno do servidor', error: error.message });
  }
});

app.get('/api/admin/render/postgres', authenticateAdmin, async (req, res) => {
  try {
    const response = await fetch('https://api.render.com/v1/postgres', {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${RENDER_API_KEY}`
      }
    });
    if (response.ok) {
      const data = await response.json();
      res.json({ bancos: data }); // data é um array de bancos postgres
    } else {
      let rawBody = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(rawBody);
      } catch (e) {
        errorData = { raw: rawBody };
      }
      res.status(response.status).json({ 
        message: 'Erro ao buscar bancos postgres do Render', 
        error: errorData 
      });
    }
  } catch (error) {
    console.error('Erro ao buscar bancos postgres:', error);
    res.status(500).json({ message: 'Erro interno do servidor', error: error.message });
  }
});

app.get('/api/admin/render/postgres/:postgresId/recovery', authenticateAdmin, async (req, res) => {
  const { postgresId } = req.params;
  try {
    const response = await fetch(`https://api.render.com/v1/postgres/${postgresId}/recovery`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.RENDER_API_KEY}`
      }
    });
    if (response.ok) {
      const data = await response.json();
      res.json(data);
    } else {
      let rawBody = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(rawBody);
      } catch (e) {
        errorData = { raw: rawBody };
      }
      res.status(response.status).json({ 
        message: 'Erro ao buscar recovery info do banco Postgres', 
        error: errorData 
      });
    }
  } catch (error) {
    console.error('Erro ao buscar recovery info:', error);
    res.status(500).json({ message: 'Erro interno do servidor', error: error.message });
  }
});

app.get('/api/admin/render/postgres/:postgresId/exports', authenticateAdmin, async (req, res) => {
  const { postgresId } = req.params;
  try {
    const response = await fetch(`https://api.render.com/v1/postgres/${postgresId}/export`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.RENDER_API_KEY}`
      }
    });
    if (response.ok) {
      const data = await response.json();
      res.json({ exports: data });
    } else {
      let rawBody = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(rawBody);
      } catch (e) {
        errorData = { raw: rawBody };
      }
      res.status(response.status).json({ 
        message: 'Erro ao buscar exports do banco Postgres', 
        error: errorData 
      });
    }
  } catch (error) {
    console.error('Erro ao buscar exports:', error);
    res.status(500).json({ message: 'Erro interno do servidor', error: error.message });
  }
});

//rota para disparaar backup automatico
app.post('/admin/render/postgres/:postgresId/recovery', authenticateAdmin, async (req, res) => {
  const { postgresId } = req.params;
  const { restoreTime } = req.body;
  console.log('[RECOVERY][POSTGRES] Iniciando backup automático para postgresId:', postgresId, 'restoreTime:', restoreTime);
  if (!restoreTime) {
    console.warn('[RECOVERY][POSTGRES] restoreTime não informado');
    return res.status(400).json({ error: 'restoreTime é obrigatório' });
  }
  try {
    const response = await fetch(`${RENDER_API_URL}/postgres/${postgresId}/recovery`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RENDER_API_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ restoreTime })
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = { raw: text };
    }
    console.log('[RECOVERY][POSTGRES] Status:', response.status);
    console.log('[RECOVERY][POSTGRES] Resposta:', data);
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    return res.json(data);
  } catch (err) {
    console.error('[RECOVERY][POSTGRES] Erro ao disparar recovery:', err);
    return res.status(500).json({ error: 'Erro ao disparar recovery', details: err.message });
  }
});

// POST /admin/render/postgres/:postgresId/export
app.post('/api/admin/render/postgres/:postgresId/export', authenticateAdmin, async (req, res) => {
  const { postgresId } = req.params;
  const RENDER_API_KEY = process.env.RENDER_API_KEY;
  if (!RENDER_API_KEY) {
    return res.status(500).json({ error: 'RENDER_API_KEY não configurado no backend.' });
  }
  try {
    console.log('[EXPORT][POSTGRES] Iniciando exportação para postgresId:', postgresId);
    const response = await fetch(`https://api.render.com/v1/postgres/${postgresId}/export`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RENDER_API_KEY}`,
        'Accept': 'application/json'
      }
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = { raw: text };
    }
    console.log('[EXPORT][POSTGRES] Status:', response.status);
    console.log('[EXPORT][POSTGRES] Resposta:', data);
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    return res.json(data);
  } catch (err) {
    console.error('[EXPORT][POSTGRES] Erro ao solicitar exportação:', err);
    return res.status(500).json({ message: 'internal server error', details: err.message });
  }
});

module.exports = router;

// Rotas para entrega-servico
app.post('/api/entrega-servico', authenticateAdmin, async (req, res) => {
  const { protocolo, data, hora, retiradoPor, usuario } = req.body;
  console.log('REQ BODY ENTREGA:', req.body);
  try {
    const result = await pool.query(
      `INSERT INTO entrega_servico (protocolo, data, hora, retirado_por, usuario)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [protocolo, data, hora, retiradoPor, usuario]
    );
    res.json({ entrega: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar entrega', details: err.message });
  }
});

// Rota GET para buscar entrega_servico por id
app.get('/api/entrega-servico/:protocolo', authenticateAdmin, async (req, res) => {
  const { protocolo } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM entrega_servico WHERE protocolo = $1',
      [protocolo]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Entrega não encontrada' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar entrega', details: err.message });
  }
});

app.put('/api/entrega-servico/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { data, hora, retiradoPor, usuario } = req.body;
  try {
    const result = await pool.query(
      `UPDATE entrega_servico SET data=$1, hora=$2, retirado_por=$3, usuario=$4 WHERE id=$5 RETURNING *`,
      [data, hora, retiradoPor, usuario, id]
    );
    res.json({ entrega: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar entrega', details: err.message });
  }
});

app.delete('/api/entrega-servico/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM entrega_servico WHERE id=$1 RETURNING *`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Entrega não encontrada' });
    }
    res.json({ message: 'Entrega removida com sucesso', entrega: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover entrega', details: err.message });
  }
});

// Remover execução de serviço por ID
app.delete('/api/execucao-servico/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    // Remove selos vinculados primeiro (se houver restrição de FK)
    await pool.query('DELETE FROM selos_execucao_servico WHERE execucao_servico_id = $1', [id]);
    // Remove a execução de serviço
    const result = await pool.query('DELETE FROM execucao_servico WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Execução de serviço não encontrada' });
    }
    res.json({ message: 'Execução de serviço removida com sucesso', execucao: result.rows[0] });
  } catch (err) {
    console.error('Erro ao remover execução de serviço:', err);
    res.status(500).json({ error: 'Erro ao remover execução de serviço', details: err.message });
  }
});

// Criar execução de serviço
app.post('/api/execucao-servico', authenticateAdmin, async (req, res) => {
  const { protocolo, usuario, data, observacoes } = req.body;

  if (!protocolo || !usuario) {
    return res.status(400).json({ error: 'protocolo e usuario são obrigatórios' });
  }

  try {
    // Insere no banco
    const result = await pool.query(
      `INSERT INTO execucao_servico (protocolo, usuario, data, observacoes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [protocolo, usuario, data || new Date(), observacoes || null]
    );
    return res.status(201).json({ execucaoId: result.rows[0].id });
  } catch (err) {
    console.error('Erro ao criar execução de serviço:', err);
    return res.status(500).json({ error: 'Erro ao criar execução de serviço', details: err.message });
  }
});

// Buscar execução de serviço por protocolo
app.get('/api/execucao-servico/:protocolo', authenticateAdmin, async (req, res) => {
  const { protocolo } = req.params;

  try {
    // Busca a execução de serviço pelo protocolo
    const execucaoResult = await pool.query(
      'SELECT * FROM execucao_servico WHERE protocolo = $1',
      [protocolo]
    );
    if (execucaoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Execução de serviço não encontrada' });
    }
    const execucao = execucaoResult.rows[0];

    // Busca os selos vinculados a esta execução
    const selosResult = await pool.query(
      'SELECT * FROM selos_execucao_servico WHERE execucao_servico_id = $1 ORDER BY id ASC',
      [execucao.id]
    );
    execucao.selos = selosResult.rows;

    return res.json(execucao);
  } catch (err) {
    console.error('Erro ao buscar execução de serviço:', err);
    return res.status(500).json({ error: 'Erro ao buscar execução de serviço', details: err.message });
  }
});

// Atualizar execução de serviço
app.put('/api/execucao-servico/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { data, observacoes, status } = req.body;

  try {
    // Atualiza os campos permitidos
    const result = await pool.query(
      `UPDATE execucao_servico
       SET data = $1, observacoes = $2, status = $3
       WHERE id = $4
       RETURNING *`,
      [data, observacoes, status, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Execução não encontrada' });
    }

    res.json({ execucao: result.rows[0] });
  } catch (err) {
    console.error('Erro ao atualizar execução:', err);
    res.status(500).json({ error: 'Erro ao atualizar execução' });
  }
});

app.get('/api/selos-execucao-servico/:protocolo', async (req, res) => {
  const { protocolo } = req.params;
  const result = await pool.query('SELECT * FROM selos_execucao_servico WHERE execucao_servico_id = $1 ORDER BY criado_em DESC', [protocolo]);
  res.json({ selos: result.rows });
});

app.post('/api/execucaoservico/:execucaoId/selo', authenticateAdmin, upload.single('imagem'), async (req, res) => {
  const { execucaoId } = req.params;
  if (!execucaoId || execucaoId === 'undefined' || execucaoId === '') {
    console.error('[BACKEND] execucaoId inválido:', execucaoId);
    return res.status(400).json({ error: 'execucaoId inválido' });
  }

  const { originalname, path } = req.file || {};
  console.log('[BACKEND] Recebido POST /admin/execucao-servico/:execucaoId/selo');
  console.log('[BACKEND] execucaoId:', execucaoId);
  console.log('[BACKEND] req.file:', req.file);
  console.log('[BACKEND] req.body:', req.body);

  try {
    if (!req.file) {
      console.error('[BACKEND] Nenhum arquivo enviado!');
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    // 1. Realize o OCR na imagem usando tesseract.js
    const ocrResult = await Tesseract.recognize(path, 'por', {
      logger: m => console.log('[OCR Progress]', m),
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789áéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ:.,- ()',
    });
    const textoOCR = ocrResult.data.text;
    console.log('[BACKEND] Texto extraído do OCR:', textoOCR);

    // 2. Extraia os dados do texto OCR
    const dadosExtraidos = extrairDadosSeloMelhorado(textoOCR);
    console.log('[BACKEND] Dados extraídos do OCR:', dadosExtraidos);

    // 3. Salve apenas os dados extraídos do OCR no banco (sem imagem_url)
    const result = await pool.query(
      `INSERT INTO selos_execucao_servico
        (execucao_servico_id, selo_consulta, codigo_seguranca, qtd_atos, atos_praticados_por, valores)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        execucaoId,
        dadosExtraidos.seloConsulta,
        dadosExtraidos.codigoSeguranca,
        dadosExtraidos.qtdAtos,
        dadosExtraidos.atosPraticadosPor,
        dadosExtraidos.valores
      ]
    );

    console.log('[BACKEND] Selo salvo:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[BACKEND] Erro ao processar selo:', err);
    res.status(500).json({ error: 'Erro ao processar selo' });
  }
});

// Listar selos de uma execução
app.get('/api/execucao-servico/:execucaoId/selos', authenticateAdmin, async (req, res) => {
  const { execucaoId } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, imagem_url AS "imagemUrl", selo_consulta AS "seloConsulta", codigo_seguranca AS "codigoSeguranca",
              qtd_atos AS "qtdAtos", atos_praticados_por AS "atosPraticadosPor", valores
         FROM selos_execucao_servico
  WHERE execucao_servico_id = $1
        ORDER BY id ASC`,
      [execucaoId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar selos:', err);
    res.status(500).json({ error: 'Erro ao buscar selos eletrônicos' });
  }
});

// Remover selo
app.delete('/api/execucao-servico/:execucaoId/selo/:seloId', authenticateAdmin, async (req, res) => {
  const { execucaoId, seloId } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM selos_execucao_servico
        WHERE id = $1 AND execucao_servico_id = $2
        RETURNING *`,
      [seloId, execucaoId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Selo não encontrado' });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    console.error('Erro ao deletar selo:', err);
    res.status(500).json({ error: 'Erro ao deletar selo eletrônico' });
  }
});

// Rota de teste para OCR melhorado
app.post('/api/teste-ocr', upload.single('imagem'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const { path } = req.file;
    console.log('[TESTE OCR] Processando arquivo:', path);

    // Realizar OCR melhorado
    const ocrResult = await Tesseract.recognize(path, 'por', {
      logger: m => console.log('[OCR Progress]', m),
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789áéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ:.,- ()',
    });
    
    const textoOCR = ocrResult.data.text;
    console.log('[TESTE OCR] Texto bruto extraído:', textoOCR);

    // Extrair dados com algoritmo melhorado
    const dadosExtraidos = extrairDadosSeloMelhorado(textoOCR);
    
    res.json({
      success: true,
      textoOcr: textoOCR,
      dadosExtraidos: dadosExtraidos,
      qualidade: {
        confidence: ocrResult.data.confidence,
        lines: ocrResult.data.lines?.length || 0,
        words: ocrResult.data.words?.length || 0
      }
    });

  } catch (error) {
    console.error('[TESTE OCR] Erro:', error);
    res.status(500).json({ 
      error: 'Erro no processamento OCR', 
      details: error.message 
    });
  }
});

// Rota para buscar histórico de status de um pedido
app.get('/api/pedidoshistoricostatus/:protocolo/historico-status', async (req, res) => {
  const { protocolo } = req.params;
  try {
    const result = await pool.query(
      `SELECT status, usuario AS responsavel, data_hora AS data_alteracao
         FROM pedido_status
        WHERE protocolo = $1
        ORDER BY data_hora ASC`,
      [protocolo]
    );
    // Adiciona campo observacoes vazio para compatibilidade com o frontend
    const historico = result.rows.map(row => ({
      ...row,
      observacoes: ''
    }));
    res.json({ historico });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar histórico de status', details: err.message });
  }
});

// Exemplo de rota para retornar dados completos da serventia
app.get('/api/serventias/:nome_abreviado', async (req, res) => {
  const { nome_abreviado } = req.params;
  console.log(`[API][serventias] Requisição recebida para nome_abreviado: ${nome_abreviado}`);
  try {
    const result = await pool.query(
      `SELECT nome_completo, endereco, cnpj, telefone, email FROM serventia WHERE LOWER(nome_abreviado) = LOWER($1)`,
      [nome_abreviado]
    );
    console.log(`[API][serventias] Resultado da consulta:`, result.rows);
    if (result.rows.length === 0) {
      console.warn(`[API][serventias] Nenhuma serventia encontrada para nome_abreviado: ${nome_abreviado}`);
      return res.status(404).json({ error: 'Não encontrada' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(`[API][serventias] Erro ao buscar serventia para nome_abreviado ${nome_abreviado}:`, err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Buscar config de backup agendado
app.get('/api/:postgresId/backup-agendado', async (req, res) => {
  const { postgresId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT horario, ativo FROM backup_agendado WHERE postgres_id = $1',
      [postgresId]
    );
    if (rows.length === 0) return res.json({ horario: '02:00', ativo: false });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar configuração', details: err.message });
  }
});

// Criar/atualizar config de backup agendado
app.post('/api/:postgresId/backup-agendado', async (req, res) => {
  const { postgresId } = req.params;
  const { horario, ativo } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO backup_agendado (postgres_id, horario, ativo, atualizado_em)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (postgres_id)
       DO UPDATE SET horario = $2, ativo = $3, atualizado_em = NOW()
       RETURNING horario, ativo`,
      [postgresId, horario, ativo]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar configuração', details: err.message });
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

// Middleware global para erros não tratados
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Erro interno do servidor', details: err && err.message ? err.message : String(err) });
  }
});

module.exports = router;