// app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

const allowedOrigins = [
  'https://frontend-0f8x.onrender.com',
  'https://www.bibliofilia.com.br',
  'https://frontend-dev-e7yt.onrender.com'
];

app.use(cors({
  origin: function(origin, callback) {
    console.log('[CORS] Origin:', origin);
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      console.log('[CORS] Bloqueado:', origin);
      return callback(new Error('O CORS não permite acesso deste domínio.'), false);
    }
    console.log('[CORS] Liberado:', origin);
    return callback(null, true);
  },
  optionsSuccessStatus: 200
}));

app.use(express.json());

console.log('[BOOT] Registrando rotas...');

// Importar rotas
const atosRoutes = require('./routes/atos');
const caixaDiarioRoutes = require('./routes/CaixaDiario');
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const relatoriosRoutes = require('./routes/relatorios');
const adminRoutes = require('./routes/admin');
const importarAtosRoutes = require('./routes/importarAtos');
const fechamentosRoutes = require('./routes/fechamentos');
const atosTabelaRouter = require('./routes/atos-tabela');
console.log('[ROUTE] /api/atos-tabela');
app.use('/api/atos-tabela', atosTabelaRouter);

const atosPraticadosRouter = require('./routes/atosPraticados');
console.log('[ROUTE] /api/atos-praticados');
app.use('/api/atos-praticados', atosPraticadosRouter);

console.log('[ROUTE] /api/atos');
app.use('/api/atos', atosRoutes);

console.log('[ROUTE] /api/codigos-gratuitos');
app.use('/api/codigos-gratuitos', require('./routes/codigosGratuitos'));

console.log('[ROUTE] /api/caixa-diario');
app.use('/api/caixa-diario', caixaDiarioRoutes);

console.log('[ROUTE] /api/auth');
app.use('/api/auth', authRoutes);

console.log('[ROUTE] /api/upload');
app.use('/api/upload', uploadRoutes);

console.log('[ROUTE] /api (relatorios)');
app.use('/api', relatoriosRoutes); // Rotas de relatórios

console.log('[ROUTE] /api/admin');
app.use('/api/admin', adminRoutes); // Rotas de administração

console.log('[ROUTE] /api/importar-atos');
app.use('/api/importar-atos', importarAtosRoutes); // Rota de importação de atos

console.log('[ROUTE] /api (fechamentos)');
app.use('/api', fechamentosRoutes); // Rota de RELATORIO DE FECHAMENTO DE CAIXA

// Rota de teste
app.get('/api/test', (req, res) => {
  console.log('[ROUTE] /api/test chamada');
  res.json({ message: 'API funcionando!', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
  console.log('Ambiente:', process.env.NODE_ENV || 'development');
});

