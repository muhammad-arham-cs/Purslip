const request = require('supertest');
const app = require('../server');
const { pool } = require('../config/db');

afterAll(async () => {
  await pool.end();
});

describe('GET /healthz', () => {
  it('reports ok status', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /', () => {
  it('renders the home page', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Purslip');
  });
});

describe('GET /does-not-exist', () => {
  it('renders a 404 page', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
  });
});
