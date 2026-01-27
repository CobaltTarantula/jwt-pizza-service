const request = require('supertest');
const app = require('../service');

// test get user route
test('get user requires auth', async () => {
  const res = await request(app).get('/api/user/me');
  expect(res.status).toBe(401);
});

test('get user with auth', async () => {
  // first create user
  const user = {
    name: 'testuser',
    email: `testuser${Date.now()}@test.com`,
    password: 'a'
  };
  const createRes = await request(app).post('/api/auth').send(user);
  const token = createRes.body.token;
    // now get user info
    const res = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(user.email);
});

// test update user route
test('update user requires auth', async () => {
  const res = await request(app)
    .put('/api/user/1')
    .send({ name: 'newname' });
  expect(res.status).toBe(401);
});

test('user can update own info', async () => {
  // first create user
  const user = {
    name: 'testuser',
    email: `testuser${Date.now()}@test.com`,
    password: 'a'
    };
    const createRes = await request(app).post('/api/auth').send(user);
    const token = createRes.body.token;
    const userId = createRes.body.user.id;
    // now update user info
    const res = await request(app)
        .put(`/api/user/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'updatedname' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('updatedname');
});

// test delete user route
test('delete user requires auth', async () => {
  const res = await request(app).delete('/api/user/1');
  expect(res.status).toBe(401);
});

test('user can delete own account', async () => {
  // first create user
  const user = {
    name: 'testuser',
    email: `testuser${Date.now()}@test.com`,
    password: 'a'
    };
    const createRes = await request(app).post('/api/auth').send(user);
    const token = createRes.body.token;
    const userId = createRes.body.user.id;
    // now delete user account
    const res = await request(app)
        .delete(`/api/user/${userId}`)
        .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
});

// test list users route
test('list users requires admin auth', async () => {
  // first create normal user
  const user = {
    name: 'testuser',
    email: `testuser${Date.now()}@test.com`,
    password: 'a'
    };
    await request(app).post('/api/auth').send(user);
    // now try to list users without admin rights
    const res = await request(app)
        .get('/api/user');
    expect(res.status).toBe(401);
});

test('admin can list users', async () => {
    // first create admin user
    const admin = {
      name: 'adminuser',
      email: `adminuser${Date.now()}@test.com`,
        password: 'a',
        role: 'admin'
    };
    const createRes = await request(app).post('/api/auth').send(admin);
    const adminToken = createRes.body.token;
    // now list users with admin rights
    const res = await request(app)
        .get('/api/user')
        .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
});