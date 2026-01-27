const request = require('supertest');
const app = require('../service');

let adminToken;
let dinerToken;
let adminUser;
let dinerUser;
let franchiseId;
let storeId;

beforeAll(async () => {
  // register admin
  adminUser = {
    name: 'admin',
    email: `admin${Date.now()}@test.com`,
    password: 'a'
  };
  const adminRes = await request(app).post('/api/auth').send(adminUser);
  adminToken = adminRes.body.token;

  // promote to admin in DB if needed
  // (depends on your DB implementation)

  // register diner
  dinerUser = {
    name: 'diner',
    email: `diner${Date.now()}@test.com`,
    password: 'a'
  };
  const dinerRes = await request(app).post('/api/auth').send(dinerUser);
  dinerToken = dinerRes.body.token;
});

// test get franchises route
test('list franchises (public)', async () => {
  const res = await request(app).get('/api/franchise');

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.franchises)).toBe(true);
  expect(typeof res.body.more).toBe('boolean');
});

// test get user franchises route
test('get user franchises requires auth', async () => {
  const res = await request(app).get('/api/franchise/1');
  expect(res.status).toBe(401);
});

test('non-admin cannot view other user franchises', async () => {
  const res = await request(app)
    .get('/api/franchise/9999')
    .set('Authorization', `Bearer ${dinerToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toEqual([]);
});

test('admin can view user franchises', async () => {
  const res = await request(app)
    .get(`/api/franchise/${dinerUser.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

// test create franchise route
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
    .send({
      name: 'Pizza Palace',
      admins: [{ email: adminUser.email }]
    });

  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Pizza Palace');
  franchiseId = res.body.id;
});

// test delete franchise route
test('delete franchise does NOT require auth (bug)', async () => {
  const res = await request(app).delete(`/api/franchise/${franchiseId}`);
  expect(res.status).toBe(200);
});

// test create store route
test('non-admin cannot create store', async () => {
  const res = await request(app)
    .post(`/api/franchise/${franchiseId}/store`)
    .set('Authorization', `Bearer ${dinerToken}`)
    .send({ name: 'SLC' });

  expect(res.status).toBe(403);
});

test('admin can create store', async () => {
  const res = await request(app)
    .post(`/api/franchise/${franchiseId}/store`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'SLC' });

  expect(res.status).toBe(200);
  expect(res.body.name).toBe('SLC');
  storeId = res.body.id;
});

// test delete store route
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
  expect(res.body.message).toMatch(/deleted/i);
});

test('cannot create store for nonexistent franchise', async () => {
  const res = await request(app)
    .post('/api/franchise/999999/store')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Ghost Store' });

  expect(res.status).toBe(403);
});