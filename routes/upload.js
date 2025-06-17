// routes/upload.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middlewares/auth');
const { extractTextWithPdfParse } = require('../utils/pdfUtils');
const fs = require('fs');

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Apenas arquivos PDF são permitidos!'));
  },
});

router.post('/', authenticate, (req, res) => {
  const uploadMiddleware = upload.single('file');
  uploadMiddleware(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

    try {
      const textoExtraido = await extractTextWithPdfParse(req.file.path);
      fs.unlink(req.file.path, () => {});
      res.json({ message: 'Upload e extração de dados do PDF concluídos', texto: textoExtraido });
    } catch (processErr) {
      console.error('Erro ao processar o arquivo:', processErr);
      res.status(500).json({ error: 'Erro ao processar o upload do PDF', details: processErr.message });
    }
  });
});

module.exports = router;