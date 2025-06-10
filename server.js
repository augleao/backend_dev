const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

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

// Função robusta para extrair atos do texto do PDF das tabelas
function extrairAtosDoTexto(texto, origem) {
  const atos = [];
  const linhas = texto.split('\n').map(l => l.trim()).filter(l => l);

  for (let linha of linhas) {
    // 1. Tabela Markdown (começa com | e tem pelo menos 7 pipes)
    if (linha.startsWith('|') && (linha.match(/\|/g) || []).length >= 7) {
      const partes = linha.split('|').map(s => s.trim()).filter(Boolean);
      if (partes.length >= 8 && /^\d/.test(partes[0])) {
        atos.push({
          descricao: partes[0],
          emol_bruto: partes[1],
          recompe: partes[2],
          emol_liquido: partes[3],
          issqn: partes[4],
          taxa_fiscal: partes[5],
          valor_final: partes[6],
          codigo: partes[7],
          origem,
        });
      }
      continue;
    }

    // 2. Linha corrida: descrição ... vários valores R$ ... código no final
    // Exemplo: 5.1 - De assento ... R$134.63 R$ 9.42 R$ 125.21 R$ 0.00 R$ 17.28 R$ 151.91 7501
    const match = linha.match(/(.+?)\s+R\$[\d.,]+(?:\s+R\$[\d.,]+){5}\s+(\d{4})$/);
    if (match) {
      // Extrai todos os valores monetários da linha
      const valores = [...linha.matchAll(/R\$ ?([\d.,]+)/g)].map(v => v[1].replace('.', '').replace(',', '.'));
      atos.push({
        descricao: match[1].trim(),
        emol_bruto: valores[0] || null,
        recompe: valores[1] || null,
        emol_liquido: valores[2] || null,
        issqn: valores[3] || null,
        taxa_fiscal: valores[4] || null,
        valor_final: valores[5] || null,
        codigo: match[2],
        origem,
      });
    }
  }
  return atos;
}

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
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ message: 'Email e senha são obrigatórios.' });
  }

  try {
    const result = await pool.query('SELECT * FROM public.users WHERE email = $1', [email]);
    
    if (!result.rowCount) {
      return res.status(401).json({ message: 'Credenciais inválidas.' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Credenciais inválidas.' });
    }

    // Inclui cargo no token!
    const token = jwt.sign(
      { id: user.id, email: user.email, cargo: user.cargo }, 
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
      const dataBuffer = fs.readFileSync(req.file.path);
      const pdfData = await pdfParse(dataBuffer);

      const textoExtraido = pdfData.text;

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
      return res.status(400).json({ message: 'Envie os dois arquivos PDF.' });
    }

    // Lê e extrai texto dos dois arquivos
    const buffer07 = fs.readFileSync(req.files.tabela07[0].path);
    const buffer08 = fs.readFileSync(req.files.tabela08[0].path);

    const texto07 = (await pdfParse(buffer07)).text;
    const texto08 = (await pdfParse(buffer08)).text;

    // Logs para debug
    console.log('=== TEXTO EXTRAÍDO DA TABELA 07 ===');
    console.log(texto07.substring(0, 2000));
    console.log('=== FIM TABELA 07 ===');
    console.log('=== TEXTO EXTRAÍDO DA TABELA 08 ===');
    console.log(texto08.substring(0, 2000));
    console.log('=== FIM TABELA 08 ===');

    // Extrai os atos de cada tabela
    const atos07 = extrairAtosDoTexto(texto07, 'Tabela 07');
    const atos08 = extrairAtosDoTexto(texto08, 'Tabela 08');
    console.log('Atos extraídos da Tabela 07:', atos07);
    console.log('Atos extraídos da Tabela 08:', atos08);
    const atos = [...atos07, ...atos08];

    // Remove arquivos temporários
    fs.unlink(req.files.tabela07[0].path, () => {});
    fs.unlink(req.files.tabela08[0].path, () => {});

    return res.json({ atos });
  } catch (err) {
    console.error('Erro ao importar atos:', err);
    return res.status(500).json({ message: 'Erro ao processar os arquivos.' });
  }
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
    const result = await pool.query(
      `SELECT id, email, cargo, serventia, data_geracao, dados_relatorio 
       FROM relatorios 
       WHERE user_id = $1 
       ORDER BY data_geracao DESC`,
      [req.user.id]
    );
    
    res.json({ relatorios: result.rows });
    
  } catch (err) {
    console.error('Erro ao buscar relatórios:', err);
    return res.status(500).json({ message: 'Erro interno do servidor.' });
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