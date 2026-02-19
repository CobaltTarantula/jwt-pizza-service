const request = require('supertest');
const app = require('../service');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
  expectValidJwt(testUserAuthToken);
});

test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expectValidJwt(loginRes.body.token);

  const expectedUser = { ...testUser, roles: [{ role: 'diner' }] };
  delete expectedUser.password;
  expect(loginRes.body.user).toMatchObject(expectedUser);
});

test('logout', async () => {
  const logoutRes = await request(app)
    .delete('/api/auth')
    .set('Authorization', `Bearer ${testUserAuthToken}`);
  expect(logoutRes.status).toBe(200);
});

test('register', async () => {
  const newUser = {
    name: 'new user',
    email: Math.random().toString(36).substring(2, 12) + '@test.com',
    password: 'a',
  };
  const registerRes = await request(app).post('/api/auth').send(newUser);
  expect(registerRes.status).toBe(200);
  expectValidJwt(registerRes.body.token);
  const expectedUser = { ...newUser, roles: [{ role: 'diner' }] };
  delete expectedUser.password;
  expect(registerRes.body.user).toMatchObject(expectedUser);
});

describe('Auth negative tests', () => {
  test('register fails with missing fields', async () => {
    // Missing password
    const res1 = await request(app).post('/api/auth').send({
      name: 'NoPass User',
      email: 'nopass@test.com',
    });
    expect(res1.status).toBe(400);
    expect(res1.body.message).toMatch(/name, email, and password are required/i);

    // Missing email
    const res2 = await request(app).post('/api/auth').send({
      name: 'NoEmail User',
      password: 'abc',
    });
    expect(res2.status).toBe(400);
    expect(res2.body.message).toMatch(/name, email, and password are required/i);
  });

  test('login fails with invalid credentials', async () => {
    // Nonexistent user
    const res1 = await request(app).put('/api/auth').send({
      email: 'fakeuser@test.com',
      password: 'abc',
    });
    expect(res1.status).toBe(401);
    expect(res1.body.message).toMatch(/invalid credentials/i);

    // Wrong password
    const res2 = await request(app).put('/api/auth').send({
      email: testUser.email,
      password: 'wrongpassword',
    });
    expect(res2.status).toBe(401);
    expect(res2.body.message).toMatch(/invalid credentials/i);
  });

  test('logout fails without token', async () => {
    const res = await request(app).delete('/api/auth');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/unauthorized/i);
  });

  test('logout fails with invalid token', async () => {
    const res = await request(app)
      .delete('/api/auth')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/unauthorized/i);
  });
});