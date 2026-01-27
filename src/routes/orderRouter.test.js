const request = require('supertest');
const app = require('../service');
const { DB, Role } = require('../database/database');

if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5);
}

/* ------------------ helpers ------------------ */

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

function expectValidJwt(jwt) {
  expect(jwt).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
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

async function createDinerUser() {
  const user = {
    name: randomName(),
    email: randomName() + '@test.com',
    password: 'a',
  };

  const res = await request(app).post('/api/auth').send(user);
  expectValidJwt(res.body.token);

  return { user, token: res.body.token };
}

/* ------------------ mock factory fetch ------------------ */

global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        jwt: 'factory-jwt',
        reportUrl: 'http://factory/report',
      }),
  })
);

/* ------------------ shared state ------------------ */

let adminToken;
let dinerToken;
let menuItem;

/* ------------------ setup ------------------ */

beforeAll(async () => {
  // admin
  const admin = await createAdminUser();
  const adminLogin = await request(app)
    .put('/api/auth')
    .send({ email: admin.email, password: admin.password });

  adminToken = adminLogin.body.token;

  // diner
  const diner = await createDinerUser();
  dinerToken = diner.token;
});

/* ------------------ tests ------------------ */

test('can get menu', async () => {
  const res = await request(app).get('/api/order/menu');

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('admin can add menu item', async () => {
  const newItem = {
    title: randomName(),
    description: 'test pizza',
    image: 'pizza.png',
    price: 0.01,
  };

  const res = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(newItem);

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);

  menuItem = res.body.find(m => m.title === newItem.title);
  expect(menuItem).toBeDefined();
});

test('diner can get their orders', async () => {
  const res = await request(app)
    .get('/api/order')
    .set('Authorization', `Bearer ${dinerToken}`);

  expect(res.status).toBe(200);
  expect(res.body.orders).toBeDefined();
  expect(Array.isArray(res.body.orders)).toBe(true);
});

test('diner can create an order', async () => {
  const order = {
    franchiseId: 1,
    storeId: 1,
    items: [
      {
        menuId: menuItem.id,
        description: menuItem.title,
        price: menuItem.price,
      },
    ],
  };

  const res = await request(app)
    .post('/api/order')
    .set('Authorization', `Bearer ${dinerToken}`)
    .send(order);

  expect(res.status).toBe(200);
  expect(res.body.order).toBeDefined();
  expect(res.body.jwt).toBeDefined();
});