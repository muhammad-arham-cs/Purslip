const request = require('supertest');
const app = require('../server');
const { pool } = require('../config/db');
const users = require('../models/users');

afterAll(async () => {
  await pool.end();
});

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

describe('signup', () => {
  it('creates an account and logs the user in', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('signup');

    const res = await agent
      .post('/auth/signup')
      .type('form')
      .send({ email, password: 'correct-horse', passwordConfirm: 'correct-horse' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');

    const dashboardRes = await agent.get('/dashboard');
    expect(dashboardRes.status).toBe(200);
    expect(dashboardRes.text).toContain('Dashboard');
  });

  it('rejects a duplicate email', async () => {
    const email = uniqueEmail('dup');
    await request(app)
      .post('/auth/signup')
      .type('form')
      .send({ email, password: 'correct-horse', passwordConfirm: 'correct-horse' });

    const res = await request(app)
      .post('/auth/signup')
      .type('form')
      .send({ email, password: 'another-pass', passwordConfirm: 'another-pass' });

    expect(res.status).toBe(400);
    expect(res.text).toContain('already exists');
  });

  it('rejects mismatched password confirmation', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .type('form')
      .send({ email: uniqueEmail('mismatch'), password: 'correct-horse', passwordConfirm: 'nope' });

    expect(res.status).toBe(400);
    expect(res.text).toContain('do not match');
  });

  it('rejects a password shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .type('form')
      .send({ email: uniqueEmail('short'), password: 'short', passwordConfirm: 'short' });

    expect(res.status).toBe(400);
    expect(res.text).toContain('at least 8 characters');
  });
});

describe('protected routes', () => {
  it('redirects anonymous visitors away from the dashboard', async () => {
    const res = await request(app).get('/dashboard');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/login');
  });
});

describe('login', () => {
  const email = uniqueEmail('login');
  const password = 'correct-horse';

  beforeAll(async () => {
    await request(app)
      .post('/auth/signup')
      .type('form')
      .send({ email, password, passwordConfirm: password });
  });

  it('rejects a wrong password without revealing whether the email exists', async () => {
    const res = await request(app)
      .post('/auth/login')
      .type('form')
      .send({ email, password: 'wrong-password' });

    expect(res.status).toBe(400);
    expect(res.text).toContain('Invalid email or password');
  });

  it('rejects login for an email that was never registered, with the same message', async () => {
    const res = await request(app)
      .post('/auth/login')
      .type('form')
      .send({ email: uniqueEmail('nobody'), password: 'whatever123' });

    expect(res.status).toBe(400);
    expect(res.text).toContain('Invalid email or password');
  });

  it('logs in with correct credentials and starts a session', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/auth/login').type('form').send({ email, password });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');

    const dashboardRes = await agent.get('/dashboard');
    expect(dashboardRes.status).toBe(200);
  });

  it('locks the account after repeated failed attempts', async () => {
    const lockEmail = uniqueEmail('lockout');
    await request(app)
      .post('/auth/signup')
      .type('form')
      .send({ email: lockEmail, password, passwordConfirm: password });

    for (let i = 0; i < users.MAX_FAILED_ATTEMPTS; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await request(app)
        .post('/auth/login')
        .type('form')
        .send({ email: lockEmail, password: 'wrong-password' });
    }

    const res = await request(app)
      .post('/auth/login')
      .type('form')
      .send({ email: lockEmail, password }); // even the correct password, now locked out

    expect(res.status).toBe(429);
    expect(res.text).toContain('temporarily locked');
  });
});

describe('logout', () => {
  it('destroys the session so the dashboard is no longer reachable', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('logout');
    const password = 'correct-horse';

    await agent.post('/auth/signup').type('form').send({ email, password, passwordConfirm: password });
    expect((await agent.get('/dashboard')).status).toBe(200);

    const logoutRes = await agent.delete('/auth/logout');
    expect(logoutRes.status).toBe(302);

    const afterLogout = await agent.get('/dashboard');
    expect(afterLogout.status).toBe(302);
    expect(afterLogout.headers.location).toBe('/auth/login');
  });
});

describe('session expiry', () => {
  it('treats a session row that has expired in the store as logged out', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('expiry');
    const password = 'correct-horse';

    await agent.post('/auth/signup').type('form').send({ email, password, passwordConfirm: password });
    expect((await agent.get('/dashboard')).status).toBe(200);

    // Simulate time passing past the cookie's maxAge by forcing the stored
    // session row to already be expired, exactly what connect-pg-simple
    // checks on lookup.
    await pool.query("UPDATE session SET expire = now() - interval '1 day'");

    const res = await agent.get('/dashboard');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/login');
  });
});

describe('password reset', () => {
  it('lets a user reset their password via a generated token and log in with the new one', async () => {
    const email = uniqueEmail('reset');
    const oldPassword = 'correct-horse';
    const newPassword = 'new-correct-horse';

    await request(app)
      .post('/auth/signup')
      .type('form')
      .send({ email, password: oldPassword, passwordConfirm: oldPassword });

    await request(app).post('/auth/forgot-password').type('form').send({ email });

    const { rows } = await pool.query(
      'SELECT reset_token FROM users WHERE email = $1',
      [email]
    );
    const token = rows[0].reset_token;
    expect(token).toBeTruthy();

    const resetRes = await request(app)
      .post(`/auth/reset-password/${token}`)
      .type('form')
      .send({ password: newPassword, passwordConfirm: newPassword });

    expect(resetRes.status).toBe(302);
    expect(resetRes.headers.location).toBe('/auth/login');

    const oldPasswordLogin = await request(app)
      .post('/auth/login')
      .type('form')
      .send({ email, password: oldPassword });
    expect(oldPasswordLogin.status).toBe(400);

    const newPasswordLogin = await request(app)
      .post('/auth/login')
      .type('form')
      .send({ email, password: newPassword });
    expect(newPasswordLogin.status).toBe(302);
    expect(newPasswordLogin.headers.location).toBe('/dashboard');
  });

  it('rejects an expired reset token', async () => {
    const email = uniqueEmail('expired-reset');
    const password = 'correct-horse';

    await request(app)
      .post('/auth/signup')
      .type('form')
      .send({ email, password, passwordConfirm: password });

    await request(app).post('/auth/forgot-password').type('form').send({ email });

    const { rows } = await pool.query(
      'SELECT reset_token FROM users WHERE email = $1',
      [email]
    );
    const token = rows[0].reset_token;

    await pool.query(
      "UPDATE users SET reset_token_expires = now() - interval '1 hour' WHERE email = $1",
      [email]
    );

    const res = await request(app)
      .post(`/auth/reset-password/${token}`)
      .type('form')
      .send({ password: 'irrelevant123', passwordConfirm: 'irrelevant123' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/forgot-password');
  });

  it('does not reveal whether an email exists', async () => {
    const res = await request(app)
      .post('/auth/forgot-password')
      .type('form')
      .send({ email: uniqueEmail('unknown') });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/login');
  });
});
