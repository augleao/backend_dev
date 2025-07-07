const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const { authenticate, requireRegistrador } = require('../middlewares/auth');
const { extrairAtos } = require('../utils/pdfUtils'); // Ajuste o caminho se necessário

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

router.post('/', authenticate, requireRegistrador, uploadAtos.fields([
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

module.exports = router;