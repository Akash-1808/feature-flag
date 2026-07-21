import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './src/db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('🚀 Connecting to database...');
  try {
    const sqlPath = path.join(__dirname, '../../db/feature_flag_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('⏳ Running FlagCraft schema migrations...');
    await pool.query(sql);
    
    console.log('✅ Schema migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await pool.end();
  }
}

runMigration();
