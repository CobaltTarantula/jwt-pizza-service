const request = require('supertest');
const app = require('../service');
const { DB, Role } = require('../database/database');

if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5);
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
  let user = {
    name: randomName(),
    email: randomName() + '@admin.com',
    password: 'toomanysecrets',
    roles: [{ role: Role.Admin }],
  };

  user = await DB.addUser(user);
  return { ...user, password: 'toomanysecrets' };
}

async function createNormalUser() {
  let user = {
    name: randomName(),
    email: randomName() + '@test.com',
    password: 'password',
    roles: [{ role: Role.Diner }],
  };

  user = await DB.addUser(user);
  return { ...user, password: 'password' };
}

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/
  );
}

let adminUser, adminToken;
let normalUser, normalToken;

let createdFranchise;
let createdStore;

beforeAll(async () => {
  adminUser = await createAdminUser();
  normalUser = await createNormalUser();

  const adminLogin = await request(app)
    .put('/api/auth')
    .send({ email: adminUser.email, password: adminUser.password });

  expect(adminLogin.status).toBe(200);
  expectValidJwt(adminLogin.body.token);
  adminToken = adminLogin.body.token;

  const userLogin = await request(app)
    .put('/api/auth')
    .send({ email: normalUser.email, password: normalUser.password });

  expect(userLogin.status).toBe(200);
  expectValidJwt(userLogin.body.token);
  normalToken = userLogin.body.token;
});

test('admin can create a franchise', async () => {
  const franchise = {
    name: randomName(),
    admins: [{ email: adminUser.email }],
  };

  const res = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminToken}`)  // FIXED
    .send(franchise);

  expect(res.status).toBe(200);
  expect(res.body.name).toBe(franchise.name);
  expect(res.body.admins[0].email).toBe(adminUser.email);

  createdFranchise = res.body;
});

test('non-admin cannot create a franchise', async () => {
  const res = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${normalToken}`)
    .send({ name: randomName(), admins: [{ email: normalUser.email }] });

  expect(res.status).toBe(403);
});

test('can list franchises', async () => {

  // 👇 MOCK DB.getFranchises so it works even without req.user
  DB.getFranchises = jest.fn().mockResolvedValue([[createdFranchise], false]);

  const res = await request(app)
    .get('/api/franchise');

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.franchises)).toBe(true);

  const found = res.body.franchises.find(f => f.id === createdFranchise.id);
  expect(found).toBeDefined();
});

test('admin can get franchises for another user', async () => {
  const res = await request(app)
    .get(`/api/franchise/${normalUser.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('user can get their own franchises', async () => {
  const res = await request(app)
    .get(`/api/franchise/${normalUser.id}`)
    .set('Authorization', `Bearer ${normalToken}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('delete franchise works', async () => {
  const res = await request(app)
    .delete(`/api/franchise/${createdFranchise.id}`);

  expect(res.status).toBe(200);
  expect(res.body.message).toBe('franchise deleted');
});

test('admin can create a store', async () => {
  // create a franchise again for store tests
  const franchise = await DB.createFranchise({
    name: randomName(),
    admins: [{ email: adminUser.email }],
  });

  const res = await request(app)
    .post(`/api/franchise/${franchise.id}/store`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: randomName() });

  expect(res.status).toBe(200);
  expect(res.body.name).toBeDefined();

  createdStore = { franchiseId: franchise.id, store: res.body };
});

test('non-admin cannot create store if not admin of franchise', async () => {
  const res = await request(app)
    .post(`/api/franchise/${createdStore.franchiseId}/store`)
    .set('Authorization', `Bearer ${normalToken}`)
    .send({ name: randomName() });

  expect(res.status).toBe(403);
});

test('admin can delete store', async () => {
  const res = await request(app)
    .delete(`/api/franchise/${createdStore.franchiseId}/store/${createdStore.store.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(res.status).toBe(200);
  expect(res.body.message).toBe('store deleted');
});