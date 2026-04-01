const express = require('express');
const config = require('../config.js');
const { Role, DB } = require('../database/database.js');
const { authRouter } = require('./authRouter.js');
const { asyncHandler, StatusCodeError } = require('../endpointHelper.js');

const orderRouter = express.Router();
const metrics = require('../metrics.js');
orderRouter.use(metrics.requestTracker);

const logger = require('../logger');

orderRouter.docs = [
  {
    method: 'GET',
    path: '/api/order/menu',
    description: 'Get the pizza menu',
    example: `curl localhost:3000/api/order/menu`,
    response: [{ id: 1, title: 'Veggie', image: 'pizza1.png', price: 0.0038, description: 'A garden of delight' }],
  },
  {
    method: 'PUT',
    path: '/api/order/menu',
    requiresAuth: true,
    description: 'Add an item to the menu',
    example: `curl -X PUT localhost:3000/api/order/menu -H 'Content-Type: application/json' -d '{ "title":"Student", "description": "No topping, no sauce, just carbs", "image":"pizza9.png", "price": 0.0001 }'  -H 'Authorization: Bearer tttttt'`,
    response: [{ id: 1, title: 'Student', description: 'No topping, no sauce, just carbs', image: 'pizza9.png', price: 0.0001 }],
  },
  {
    method: 'GET',
    path: '/api/order',
    requiresAuth: true,
    description: 'Get the orders for the authenticated user',
    example: `curl -X GET localhost:3000/api/order  -H 'Authorization: Bearer tttttt'`,
    response: { dinerId: 4, orders: [{ id: 1, franchiseId: 1, storeId: 1, date: '2024-06-05T05:14:40.000Z', items: [{ id: 1, menuId: 1, description: 'Veggie', price: 0.05 }] }], page: 1 },
  },
  {
    method: 'POST',
    path: '/api/order',
    requiresAuth: true,
    description: 'Create a order for the authenticated user',
    example: `curl -X POST localhost:3000/api/order -H 'Content-Type: application/json' -d '{"franchiseId": 1, "storeId":1, "items":[{ "menuId": 1, "description": "Veggie", "price": 0.05 }]}'  -H 'Authorization: Bearer tttttt'`,
    response: { order: { franchiseId: 1, storeId: 1, items: [{ menuId: 1, description: 'Veggie', price: 0.05 }], id: 1 }, jwt: '1111111111' },
  },
];

// getMenu
orderRouter.get(
  '/menu',
  asyncHandler(async (req, res) => {
    res.send(await DB.getMenu());
  })
);

// addMenuItem
orderRouter.put(
  '/menu',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    if (!req.user.isRole(Role.Admin)) {
      throw new StatusCodeError('unable to add menu item', 403);
    }

    const addMenuItemReq = req.body;
    await DB.addMenuItem(addMenuItemReq);
    res.send(await DB.getMenu());
  })
);

// getOrders
orderRouter.get(
  '/',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    res.json(await DB.getOrders(req.user, req.query.page));
  })
);

let enableChaos = false;
orderRouter.put(
  '/chaos/:state',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    if (req.user.isRole(Role.Admin)) {
      enableChaos = req.params.state === 'true';
    }

    res.json({ chaos: enableChaos });
  })
);

orderRouter.post('/', (req, res, next) => {
  if (enableChaos && Math.random() < 0.5) {
    const latency = 0;
    const price = 0;
    const count = 0;
    metrics.pizzaPurchase(false, latency, price, count); // log failure
    throw new StatusCodeError('Chaos monkey', 500);
  }
  next();
});

// createOrder
orderRouter.post(
  '/',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const start = Date.now();

    const orderReq = req.body;
    const order = await DB.addDinerOrder(req.user, orderReq);

    const factoryReqBody = {
      diner: { id: req.user.id, name: req.user.name, email: req.user.email },
      order,
    };

    const r = await fetch(`${config.factory.url}/api/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${config.factory.apiKey}`,
      },
      body: JSON.stringify(factoryReqBody),
    });

    const factoryResBody = await r.json();

    logger.log('info', 'factory', {
      url: `${config.factory.url}/api/order`,
      requestBody: JSON.stringify(factoryReqBody),
      responseBody: JSON.stringify(factoryResBody),
      statusCode: r.status,
      durationMs: Date.now() - start,
    });

    const latency = Date.now() - start;
    const pizzaCount = order.items.length;
    const price = order.items.reduce((sum, item) => sum + item.price, 0);

    if (r.ok) {
      metrics.pizzaPurchase(true, latency, price, pizzaCount);
      res.send({ order, followLinkToEndChaos: factoryResBody.reportUrl, jwt: factoryResBody.jwt });
    } else {
      metrics.pizzaPurchase(false, latency, 0, 0);
      res.status(500).send({ message: 'Failed to fulfill order at factory', followLinkToEndChaos: factoryResBody.reportUrl });
    }
  })
);

module.exports = orderRouter;

// run in dev, and connect in Grafana for pizza failures. place breakpoints
