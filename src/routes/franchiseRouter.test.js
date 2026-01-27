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

function expectValidJwt(jwt) {
  expect(jwt).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
}

let adminUser;
let adminAuthToken;
let createdFranchise;

beforeAll(async () => {
  adminUser = await createAdminUser();

  const loginRes = await request(app)
    .put('/api/auth')
    .send({ email: adminUser.email, password: adminUser.password });

  expect(loginRes.status).toBe(200);
  expectValidJwt(loginRes.body.token);

  adminAuthToken = loginRes.body.token;
});

test('admin can create a franchise', async () => {
  const franchise = {
    name: randomName(),
    admins: [{ email: adminUser.email }],
  };

  const res = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminAuthToken}`)
    .send(franchise);

  expect(res.status).toBe(200);

  // ✅ franchise IS the body
  expect(res.body.id).toBeDefined();
  expect(res.body.name).toBe(franchise.name);
  expect(res.body.admins[0].email).toBe(adminUser.email);

  createdFranchise = res.body;
});

test('can get list of franchises', async () => {
  const res = await request(app)
    .get('/api/franchise')
    .set('Authorization', `Bearer ${adminAuthToken}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.franchises)).toBe(true);

  const found = res.body.franchises.find(
    f => f.id === createdFranchise.id
  );

  expect(found).toBeDefined();
});

test('admin can get their franchises by user id', async () => {
  const res = await request(app)
    .get(`/api/franchise/${adminUser.id}`)
    .set('Authorization', `Bearer ${adminAuthToken}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);

  const found = res.body.find(f => f.id === createdFranchise.id);
  expect(found).toBeDefined();
});