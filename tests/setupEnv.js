process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://purslip:purslip@localhost:5433/purslip_test';
process.env.PGSSL = 'false';
process.env.SESSION_SECRET = 'test-secret-not-for-production';
