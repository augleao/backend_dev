const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pdfParse = require('pdf-parse');

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Configuração do banco de dados
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'uma_chave_super_secreta';

// CORS
const allowedOrigins = [
  'https://frontend-0f8x.onrender.com',
  'https://www.bibliofilia.com.br',
  'https://frontend-dev-e7yt.onrender.com'
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
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos PDF são permitidos!'));
    }
  },
});

async function extractTextWithPdfParse(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  console.log('Tamanho do buffer recebido:', dataBuffer.length);
  const data = await pdfParse(dataBuffer);
  return data.text;
}

// ... (sua função extrairAtosDoTexto e middlewares permanecem iguais)

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
app.post('/api/importar-atos', authenticate, requireRegistrador, uploadAtos.fields([
  { name: 'tabela07', maxCount: 1 },
  { name: 'tabela08', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files || !req.files.tabela07 || !req.files.tabela08) {
      console.log('Arquivos PDF não enviados corretamente.');
      return res.status(400).json({ message: 'Envie os dois arquivos PDF.' });
    }

    console.log('Arquivos recebidos:');
    console.log('Tabela 07:', req.files.tabela07[0].originalname, '->', req.files.tabela07[0].path);
    console.log('Tabela 08:', req.files.tabela08[0].originalname, '->', req.files.tabela08[0].path);

    const texto07 = await extractTextWithPdfParse(req.files.tabela07[0].path);
    const texto08 = await extractTextWithPdfParse(req.files.tabela08[0].path);

    console.log('=== TEXTO EXTRAÍDO DA TABELA 07  ===');
    console.log('Texto completo Tabela 07:', texto07);
    console.log('=== FIM TABELA 07 ===');

    console.log('=== TEXTO EXTRAÍDO DA TABELA 08  ===');
    console.log('Texto completo Tabela 08:', texto08);
    console.log('=== FIM TABELA 08 ===');

    const atos07 = extrairAtosDoTexto(texto07, 'Tabela 07');
    const atos08 = extrairAtosDoTexto(texto08, 'Tabela 08');

    console.log('Atos extraídos da Tabela 07:', atos07.length);
    console.log('Atos extraídos da Tabela 08:', atos08.length);

    const atos = [...atos07, ...atos08];

    // Remove arquivos temporários
    fs.unlink(req.files.tabela07[0].path, (err) => {
      if (err) console.error('Erro ao deletar arquivo Tabela 07:', err);
      else console.log('Arquivo Tabela 07 deletado.');
    });
    fs.unlink(req.files.tabela08[0].path, (err) => {
      if (err) console.error('Erro ao deletar arquivo Tabela 08:', err);
      else console.log('Arquivo Tabela 08 deletado.');
    });

    return res.json({ atos });
  } catch (err) {
    console.error('Erro ao importar atos:', err);
    return res.status(500).json({ message: 'Erro ao processar os arquivos.' });
  }
});

// ... (restante do seu código permanece igual)

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
});