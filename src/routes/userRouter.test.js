const request = require('supertest');
const app = require('../service');

let user;
let token;

beforeAll(async () => {
  const registerRes = await request(app)
    .post('/api/auth')
    .send({
      name: 'test-user',
      email: Math.random().toString(36).substring(2, 12) + '@test.com',
      password: 'password',
    });

  token = registerRes.body.token;
  user = registerRes.body.user;
});

describe('GET /api/user/me', () => {
  test('rejects request without token', async () => {
    const res = await request(app).get('/api/user/me');
    expect(res.status).toBe(401);
  });

  test('returns authenticated user', async () => {
    const res = await request(app)
      .get('/api/user/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(res.body.id).toBe(user.id);
    expect(res.body.email).toBe(user.email);
  });
});

describe('PUT /api/user/:userId', () => {
  test('prevents updating a different user', async () => {
    const res = await request(app)
      .put('/api/user/999999')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'hacker' });

    expect(res.status).toBe(403);
  });

test('allows user to update themselves', async () => {
    const res = await request(app)
        .put(`/api/user/${user.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
        name: 'updated-name',
        email: user.email,
        password: 'password',
        });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.name).toBe('updated-name');
    expect(res.body.token).toBeDefined();
  });
});