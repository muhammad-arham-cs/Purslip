import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config();
const require = createRequire(import.meta.url);
const { pool } = require('../config/db.js');

async function migrateProfile() {
  const migrationPath = path.join(__dirname, '..', 'db', 'migrations', '001_user_profile.sql');
  await pool.query(fs.readFileSync(migrationPath, 'utf8'));
  console.log('User profile migration applied successfully.');
  await pool.end();
}

migrateProfile().catch((err) => {
  console.error('Profile migration failed:', err.message);
  process.exit(1);
});
