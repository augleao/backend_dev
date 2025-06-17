// db.js
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // outras configs se necessário
});
module.exports = pool;