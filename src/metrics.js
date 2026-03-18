const config = require('./config');

/*
REQS:
  HTTP requests by method/minute
    Total requests
    GET, PUT, POST, and DELETE requests
  Active users
  Authentication attempts/minute
    Successful
    Failed
  CPU and memory usage percentage
  Pizzas
    Sold/minute
    Creation failures
    Revenue/minute
  Latency
    Service endpoint
    Pizza creation
*/

let pizzaSuccess = 0;
let pizzaFailure = 0;
let pizzasMade = 0;
let pizzaCount = 0;
let pizzaLatency = 0;
let pizzaRevenue = 0;
let authSuccess = 0;
let authFailure = 0;
let endpointCount = 0;
let endpointLatency = 0;

function pizzaPurchase(success, latency, price, count) {
  if (success) {
    pizzaSuccess++;
    pizzaRevenue += price;
    pizzasMade += count;
  } else {
    pizzaFailure++;
  }

  pizzaLatency += latency;
  pizzaCount++;
}

const methodCounts = {
  GET: 0,
  POST: 0,
  PUT: 0,
  DELETE: 0,
};

// Middleware to track requests
function requestTracker(req, res, next) {
  const start = Date.now();

  methodCounts[req.method] = (methodCounts[req.method] || 0) + 1;

  res.on('finish', () => {
    const latency = Date.now() - start;
    endpointLatency += latency;
    endpointCount++;
  });

  next();
}

// This will periodically send metrics to Grafana
setInterval(() => {
  const metrics = [];
  const totalRequests = Object.values(methodCounts).reduce((a, b) => a + b, 0);
  const avgPizzaLatency = pizzaCount ? pizzaLatency / pizzaCount : 0;
  const avgEndpointLatency = endpointCount ? endpointLatency / endpointCount : 0;

  // HTTP requests by method/minute
  Object.keys(methodCounts).forEach((method) => {
    metrics.push(createMetric('http_requests', methodCounts[method], '1', 'sum', 'asInt', { method }));
  });
  metrics.push(createMetric('http_requests_total', totalRequests, '1', 'sum', 'asInt', {}));

  // CPU and memory usage percentage
  metrics.push(createMetric('cpu', getCpuUsagePercentage(), '%', 'gauge', 'asDouble', {}));
  metrics.push(createMetric('memory', getMemoryUsagePercentage(), '%', 'gauge', 'asDouble', {}));

  // Latency
  metrics.push(createMetric('endpoint_latency', avgEndpointLatency, 'ms', 'gauge', 'asDouble', {}));
  metrics.push(createMetric('pizza_latency', avgPizzaLatency, 'ms', 'gauge', 'asDouble', {}));

  //  Authentication attempts/minute
  metrics.push(createMetric('auth_success', authSuccess, '1', 'sum', 'asInt', {}));
  metrics.push(createMetric('auth_failure', authFailure, '1', 'sum', 'asInt', {}));

  // Active users
  metrics.push(createMetric('active_users', activeUsers.size, '1', 'gauge', 'asInt', {}));

  // Pizzas
  metrics.push(createMetric('pizza_success', pizzaSuccess, '1', 'sum', 'asInt', {}));
  metrics.push(createMetric('pizza_failure', pizzaFailure, '1', 'sum', 'asInt', {}));
  metrics.push(createMetric('pizzas_made', pizzasMade, '1', 'sum', 'asInt', {}));
  metrics.push(createMetric('pizza_revenue', pizzaRevenue, 'usd', 'sum', 'asDouble', {}));

  sendMetricToGrafana(metrics);

  pizzaSuccess = 0;
  pizzaFailure = 0;
  pizzasMade = 0;
  pizzaCount = 0;
  pizzaLatency = 0;
  pizzaRevenue = 0;
  authSuccess = 0;
  authFailure = 0;
  endpointLatency = 0;
  endpointCount = 0;

  Object.keys(methodCounts).forEach((m) => (methodCounts[m] = 0));
}, 10000);

function createMetric(metricName, metricValue, metricUnit, metricType, valueType, attributes) {
  attributes = { ...attributes, source: config.source };

  const metric = {
    name: metricName,
    unit: metricUnit,
    [metricType]: {
      dataPoints: [
        {
          [valueType]: metricValue,
          timeUnixNano: Date.now() * 1000000,
          attributes: [],
        },
      ],
    },
  };

  Object.keys(attributes).forEach((key) => {
    metric[metricType].dataPoints[0].attributes.push({
      key: key,
      value: { stringValue: attributes[key] },
    });
  });

  if (metricType === 'sum') {
    metric[metricType].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric[metricType].isMonotonic = true;
  }

  return metric;
}

function sendMetricToGrafana(metrics) {
  const body = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics,
          },
        ],
      },
    ],
  };

  fetch(`${config.endpointUrl}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${config.accountId}:${config.apiKey}`, 'Content-Type': 'application/json' },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }
    })
    .catch((error) => {
      console.error('Error pushing metrics:', error);
    });
}

const os = require('os');

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return Number((cpuUsage * 100).toFixed(2));
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return Number(memoryUsage.toFixed(2));
}

function authAttempt(success) {
  if (success) {
    authSuccess++;
  } else {
    authFailure++;
  }
}

const activeUsers = new Set();

function trackUser(req, res, next) {
  if (req.user && req.user.id) {
    activeUsers.add(req.user.id);
  }
  next();
}

module.exports = { requestTracker, pizzaPurchase, authAttempt, trackUser };