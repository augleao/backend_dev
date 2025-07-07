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
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error('O CORS não permite acesso deste domínio.'), false);
    }
    return callback(null, true);
  },
  optionsSuccessStatus: 200
}));

app.use(express.json());

// Importar rotas
const atosRoutes = require('./routes/atos');
const caixaDiarioRoutes = require('./routes/CaixaDiario');
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const relatoriosRoutes = require('./routes/relatorios');
const adminRoutes = require('./routes/admin');
const importarAtosRoutes = require('./routes/importarAtos');
const fechamentosRoutes = require('./routes/fechamentos');


const atosPraticadosRouter = require('./routes/atosPraticados');
app.use('/api/atos-praticados', atosPraticadosRouter);

// Se precisar de autocomplete de atos:
const atosRouter = require('./routes/atos');
app.use('/api/atos', atosRouter);


app.use('/api/codigos-gratuitos', require('./routes/codigosGratuitos'));

app.use('/api/atos', atosRoutes);
app.use('/api/caixa-diario', caixaDiarioRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api', relatoriosRoutes); // Rotas de relatórios
app.use('/api/admin', adminRoutes); // Rotas de administração
app.use('/api/importar-atos', importarAtosRoutes); // Rota de importação de atos
app.use('/api', fechamentosRoutes); // Rota de RELATORIO DE FECHAMENTO DE CAIXA

// Rota de teste
app.get('/api/test', (req, res) => {
  res.json({ message: 'API funcionando!', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
  console.log('Ambiente:', process.env.NODE_ENV || 'development');
});

