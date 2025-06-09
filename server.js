const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const pdfParse = require('pdf-parse');


dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

const allowedOrigins = [
  'https://frontend-0f8x.onrender.com',
  'https://www.bibliofilia.com.br',
  'https://frontend-dev-e7yt.onrender.com'
];

const corsOptions = {
  origin: function(origin, callback) {
    // Permite requests sem origin (ex: Postman)
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

app.post('/api/upload', (req, res) => {
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
      console.log('Arquivo recebido:', req.file);

      const dataBuffer = fs.readFileSync(req.file.path);
      const pdfData = await pdfParse(dataBuffer);

      const textoExtraido = pdfData.text;

      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) console.error('Erro ao deletar arquivo temporário:', unlinkErr);
        else console.log('Arquivo temporário deletado:', req.file.path);
      });

      return res.json({
        message: 'Upload e extração de dados do PDF concluídos',
        texto: textoExtraido,
      });

    } catch (processErr) {
      console.error('Erro ao processar o arquivo:', processErr);
      return res.status(500).json({ error: 'Erro ao processar o upload do PDF', details: processErr.message });
    }
  });
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});