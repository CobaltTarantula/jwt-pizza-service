const request = require('supertest');
const app = require('../service');
const { Role, DB } = require('../database/database.js');

function randomName() {
  return 'user_' + Math.random().toString(36).substring(2, 10);
}

async function createAdminUser() {
  let user = {
    password: 'toomanysecrets',
    roles: [{ role: Role.Admin }],
  };
  user.name = randomName();
  user.email = `${user.name}@admin.com`;
  user = await DB.addUser(user);
  return { ...user, password: 'toomanysecrets' };
}

async function login(user) {
  const res = await request(app)
    .put('/api/auth')
    .send({ email: user.email, password: user.password });
  return res.body.token;
}

let adminToken;
let dinerToken;
let adminUser;
let franchiseId;
let storeId;

beforeAll(async () => {
  adminUser = await createAdminUser();
  adminToken = await login(adminUser);

  const diner = {
    name: randomName(),
    email: `${randomName()}@test.com`,
    password: 'a',
  };

  const dinerRes = await request(app).post('/api/auth').send(diner);
  dinerToken = dinerRes.body.token;
});

test('list franchises (public)', async () => {
  const res = await request(app).get('/api/franchise');
  expect(res.status).toBe(200);
});

test('non-admin cannot create franchise', async () => {
  const res = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${dinerToken}`)
    .send({ name: 'Bad Franchise' });

  expect(res.status).toBe(403);
});

test('admin can create franchise', async () => {
  const res = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Pizza Palace', admins: [] });

  expect(res.status).toBe(200);
  franchiseId = res.body.id;
});

test('admin can create store', async () => {
  const res = await request(app)
    .post(`/api/franchise/${franchiseId}/store`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'SLC' });

  expect(res.status).toBe(200);
  storeId = res.body.id;
});

test('non-admin cannot delete store', async () => {
  const res = await request(app)
    .delete(`/api/franchise/${franchiseId}/store/${storeId}`)
    .set('Authorization', `Bearer ${dinerToken}`);

  expect(res.status).toBe(403);
});

test('admin can delete store', async () => {
  const res = await request(app)
    .delete(`/api/franchise/${franchiseId}/store/${storeId}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(res.status).toBe(200);
});

test('delete franchise does NOT require auth (bug)', async () => {
  const res = await request(app).delete(`/api/franchise/${franchiseId}`);
  expect(res.status).toBe(200);
});