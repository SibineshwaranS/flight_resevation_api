// db.js
require('dotenv').config(); // Loads environment variables from a .env file
const { Pool } = require('pg');

const pool = new Pool({
  // This tells the app to use the connection string from the environment variables
  connectionString: process.env.DATABASE_URL,
  // This is required for connecting to cloud databases like Supabase from Render
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool;