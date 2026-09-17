const { Pool } = require('pg');
require('dotenv').config();

// Pool manages multiple database connections efficiently behind the scenes
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});


module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool,
};