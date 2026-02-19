const request = require('supertest');
const app = require('../service');
const { DB } = require('../database/database.js');
const { setAuth } = require('../routes/authRouter.js');

// Helper to create a user and return a token
async function createUser(overrides = {}) {
  let user = {
    name: `user${Date.now()}`,
    email: `user${Date.now()}@test.com`,
    password: 'userpass',
    roles: [],
    ...overrides
  };

  user = await DB.addUser(user);
  const token = await setAuth(user);

  return { ...user, token };
}

// Helper to create an admin user
async function createAdminUser() {
  let user = {
    name: `admin${Date.now()}`,
    email: `admin${Date.now()}@admin.com`,
    password: 'adminpass',
    roles: [{ role: 'admin' }]
  };

  user = await DB.addUser(user);
  const token = await setAuth(user);

  return { ...user, token };
}

// helper to register a user, possibly redundant?
async function registerUser(service) {
  const testUser = {
    name: 'pizza diner',
    email: `${randomName()}@test.com`,
    password: 'a',
  };
  const registerRes = await service.post('/api/auth').send(testUser);
  registerRes.body.user.password = testUser.password;

  return [registerRes.body.user, registerRes.body.token];
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

test('get /me requires auth', async () => {
    const res = await request(app).get('/api/user/me');
    expect(res.status).toBe(401);
});

test('get /me returns user info with auth', async () => {
    const user = await createUser();
    const res = await request(app)
      .get('/api/user/me')
      .set('Authorization', `Bearer ${user.token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(user.email);
    expect(res.body.id).toBe(user.id);
});

test('user can update own info', async () => {
    const user = await createUser();
    const res = await request(app)
      .put(`/api/user/${user.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'Updated Name', email: `updated${Date.now()}@test.com`, password: 'userpass' });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Updated Name');
    expect(res.body.token).toBeDefined();
});  

test('user cannot update another user', async () => {
    const user1 = await createUser();
    const user2 = await createUser();

    const res = await request(app)
      .put(`/api/user/${user2.id}`)
      .set('Authorization', `Bearer ${user1.token}`)
      .send({ name: 'Hack Attempt' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/unauthorized/i);
});  

test('delete user requires auth', async () => {
    const res = await request(app).delete('/api/user/1');
    expect(res.status).toBe(401);
});  

test('user can delete own account', async () => {
  const user = await createUser();

  // delete self
  const res = await request(app)
    .delete(`/api/user/${user.id}`)
    .set('Authorization', `Bearer ${user.token}`);

  expect(res.status).toBe(200);
  expect(res.body.message).toBe('User deleted');

  // attempt to log in again
  // const loginRes = await request(app)
  //   .post('/api/auth')
  //   .send({
  //     email: user.email,
  //     password: 'userpass',
  //   });

  // expect(loginRes.status).toBe(401);
});

test('user cannot delete other account', async () => {
  const user1 = await createUser();
  const user2 = await createUser();

  const res = await request(app)
    .delete(`/api/user/${user2.id}`)
    .set('Authorization', `Bearer ${user1.token}`);

  expect(res.status).toBe(403);
  expect(res.body.message).toMatch(/unauthorized/i);
});

test('admin can delete other account', async () => {
  const admin = await createAdminUser();
  const user = await createUser();

  const res = await request(app)
    .delete(`/api/user/${user.id}`)
    .set('Authorization', `Bearer ${admin.token}`);

  expect(res.status).toBe(200);
  expect(res.body.message).toBe('User deleted');

  // verify deleted user cannot log in
  // const loginRes = await request(app)
  //   .post('/api/auth')
  //   .send({
  //     email: user.email,
  //     password: 'userpass',
  //   });

  // expect(loginRes.status).toBe(401);
});

test('list users requires auth', async () => {
    const res = await request(app).get('/api/user');
    expect(res.status).toBe(401);
});  

test('list users unauthorized', async () => {
  const listUsersRes = await request(app).get('/api/user');
  expect(listUsersRes.status).toBe(401);
});

test('list users', async () => {
  const [, userToken] = await registerUser(request(app));
  const listUsersRes = await request(app)
    .get('/api/user')
    .set('Authorization', 'Bearer ' + userToken);
  expect(listUsersRes.status).toBe(200);
});

test('list users returns users', async () => {
  const [, token] = await registerUser(request(app));

  const res = await request(app)
    .get('/api/user')
    .set('Authorization', 'Bearer ' + token);

  expect(res.status).toBe(200);
  expect(res.body.users.length).toBeGreaterThan(0);
  expect(res.body.users[0]).toHaveProperty('email');
});

test('list users paginated', async () => {
  const [, token] = await registerUser(request(app));

  const res = await request(app)
    .get('/api/user?page=1&limit=1')
    .set('Authorization', 'Bearer ' + token);

  expect(res.status).toBe(200);
  expect(res.body.users.length).toBeLessThanOrEqual(1);
});

test('list users filter', async () => {
  const uniqueId = Date.now();
  const aliceName = `Alice-${uniqueId}`;

  const alice = await createUser({
    name: aliceName,
    email: `alice-${uniqueId}@jwt.com`
  });

  const exactRes = await request(app)
    .get('/api/user')
    .query({ name: aliceName })
    .set('Authorization', `Bearer ${alice.token}`);

  expect(exactRes.status).toBe(200);
  expect(exactRes.body.users.length).toBe(1);
  expect(exactRes.body.users[0].name).toBe(aliceName);
});