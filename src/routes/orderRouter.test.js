const request = require('supertest');
const app = require('../service');

let adminToken;
let dinerToken;

beforeAll(async () => {
  // create admin
  const admin = {
    name: 'admin',
    email: `admin${Date.now()}@test.com`,
    password: 'a'
  };
  const adminRes = await request(app).post('/api/auth').send(admin);
  adminToken = adminRes.body.token;

  // create diner
  const diner = {
    name: 'diner',
    email: `diner${Date.now()}@test.com`,
    password: 'a'
  };
  const dinerRes = await request(app).post('/api/auth').send(diner);
  dinerToken = dinerRes.body.token;
});

// test get menu route
test('get menu is public', async () => {
  const res = await request(app).get('/api/order/menu');

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

// test add menu item route
test('add menu item requires auth', async () => {
  const res = await request(app)
    .put('/api/order/menu')
    .send({ title: 'Bad Pizza' });

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
      price: 1
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
      price: 0.0001
    });

  expect(res.status).toBe(200);
  expect(res.body.some(item => item.title === 'Student')).toBe(true);
});

// test get orders route
test('get orders requires auth', async () => {
  const res = await request(app).get('/api/order');
  expect(res.status).toBe(401);
});

test('get orders returns array', async () => {
  const res = await request(app)
    .get('/api/order')
    .set('Authorization', `Bearer ${dinerToken}`);

  expect(res.status).toBe(200);
  expect(res.body.orders).toBeDefined();
});

// test create order route
beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        jwt: 'factory-jwt',
        reportUrl: 'https://chaos'
      })
    })
  );
});

test('create order succeeds when factory ok', async () => {
  const res = await request(app)
    .post('/api/order')
    .set('Authorization', `Bearer ${dinerToken}`)
    .send({
      franchiseId: 1,
      storeId: 1,
      items: [{ menuId: 1, description: 'Veggie', price: 0.05 }]
    });

  expect(res.status).toBe(200);
  expect(res.body.order).toBeDefined();
  expect(res.body.jwt).toBeDefined();
  expect(res.body.followLinkToEndChaos).toBeDefined();
});

test('create order fails when factory fails', async () => {
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: false,
      json: () => Promise.resolve({
        reportUrl: 'https://chaos'
      })
    })
  );

  const res = await request(app)
    .post('/api/order')
    .set('Authorization', `Bearer ${dinerToken}`)
    .send({
      franchiseId: 1,
      storeId: 1,
      items: [{ menuId: 1, description: 'Veggie', price: 0.05 }]
    });

  expect(res.status).toBe(500);
  expect(res.body.message).toMatch(/failed to fulfill/i);
});

test('create order requires auth', async () => {
  const res = await request(app)
    .post('/api/order')
    .send({});

  expect(res.status).toBe(401);
});