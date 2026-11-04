const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ADMIN_URL =
  process.env.TEST_ADMIN_DATABASE_URL || 'postgresql://purslip:purslip@localhost:5433/purslip';
const TEST_DB_NAME = 'purslip_test';

module.exports = async () => {
  const adminClient = new Client({ connectionString: ADMIN_URL });
  await adminClient.connect();
  const { rows } = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB_NAME]);
  if (rows.length === 0) {
    await adminClient.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  }
  await adminClient.end();

  const testUrl = ADMIN_URL.replace(/\/[^/]+$/, `/${TEST_DB_NAME}`);
  const testClient = new Client({ connectionString: testUrl });
  await testClient.connect();
  await testClient.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await testClient.query(schema);
  await testClient.end();
};
