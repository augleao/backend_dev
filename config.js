// config.js
module.exports = {
  frontendURL: process.env.FRONTEND_URL || 'http://localhost:3000', // URL do frontend
  port:        process.env.PORT        || 3001, // Porta do backend
  jwtSecret:   process.env.JWT_SECRET  || 'uma_chave_super_secreta', // Chave JWT
  dbURL:       process.env.DATABASE_URL, // URL do banco de dados
};