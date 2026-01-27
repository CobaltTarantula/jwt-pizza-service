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

beforeAll(async () => {
  const adminUser = await createAdminUser();
  adminToken = await login(adminUser);

  const diner = {
    name: randomName(),
    email: `${randomName()}@test.com`,
    password: 'a',
  };
  const dinerRes = await request(app).post('/api/auth').send(diner);
  dinerToken = dinerRes.body.token;
});

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

/* ===================== MENU ===================== */

test('get menu is public', async () => {
  const res = await request(app).get('/api/order/menu');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('add menu item requires auth', async () => {
  const res = await request(app).put('/api/order/menu');
  expect(res.status).toBe(401);
});

test('non-admin cannot add menu item', async () => {
  const res = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${dinerToken}`)
    .send({
      title: 'Sad Pizza',
      description: 'No joy',
      image: 'sad.png',
      price: 1,
    });

  expect(res.status).toBe(403);
});

test('admin can add menu item', async () => {
  const res = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title: 'Student',
      description: 'No toppings',
      image: 'pizza9.png',
      price: 0.0001,
    });

  expect(res.status).toBe(200);
  expect(res.body.some((i) => i.title === 'Student')).toBe(true);
});

/* ===================== ORDERS ===================== */

test('get orders requires auth', async () => {
  const res = await request(app).get('/api/order');
  expect(res.status).toBe(401);
});

test('get orders returns orders object', async () => {
  const res = await request(app)
    .get('/api/order')
    .set('Authorization', `Bearer ${dinerToken}`);

  expect(res.status).toBe(200);
  expect(res.body.orders).toBeDefined();
});

/* ===================== CREATE ORDER ===================== */

test('create order succeeds when factory ok', async () => {
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      jwt: 'factory-jwt',
      reportUrl: 'https://chaos',
    }),
  });

  const res = await request(app)
    .post('/api/order')
    .set('Authorization', `Bearer ${dinerToken}`)
    .send({
      franchiseId: 1,
      storeId: 1,
      items: [{ menuId: 1, description: 'Veggie', price: 0.05 }],
    });

  expect(res.status).toBe(200);
  expect(res.body.order).toBeDefined();
  expect(res.body.jwt).toBeDefined();
  expect(res.body.followLinkToEndChaos).toBeDefined();
});

test('create order fails when factory fails', async () => {
  fetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({
      reportUrl: 'https://chaos',
    }),
  });

  const res = await request(app)
    .post('/api/order')
    .set('Authorization', `Bearer ${dinerToken}`)
    .send({
      franchiseId: 1,
      storeId: 1,
      items: [{ menuId: 1, description: 'Veggie', price: 0.05 }],
    });

  expect(res.status).toBe(500);
  expect(res.body.message).toMatch(/failed to fulfill/i);
});

test('create order requires auth', async () => {
  const res = await request(app).post('/api/order');
  expect(res.status).toBe(401);
});