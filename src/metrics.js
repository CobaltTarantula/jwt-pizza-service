const config = require('./config');

let pizzaSuccess = 0;
let pizzaFailure = 0;
let pizzasMade = 0;
let pizzaLatency = 0;
let pizzaRevenue = 0;

function pizzaPurchase(success, latency, price, count) {
  if (success) {
    pizzaSuccess++;
    pizzaRevenue += price;
    pizzasMade += count;
  } else {
    pizzaFailure++;
  }

  pizzaLatency += latency;
}

// Metrics stored in memory
const requests = {};
let greetingChangedCount = 0;

// Function to track when the greeting is changed
function greetingChanged() {
  greetingChangedCount++;
}

// Middleware to track requests
function requestTracker(req, res, next) {
  const endpoint = `[${req.method}] ${req.path}`;
  requests[endpoint] = (requests[endpoint] || 0) + 1;
  next();
}

// This will periodically send metrics to Grafana
setInterval(() => {
  const metrics = [];

  Object.keys(requests).forEach((endpoint) => {
    metrics.push(createMetric('requests', requests[endpoint], '1', 'sum', 'asInt', { endpoint }));
  });

  metrics.push(createMetric('greetingChange', greetingChangedCount, '1', 'sum', 'asInt', {}));

  // System metrics
  metrics.push(createMetric('cpu', getCpuUsagePercentage(), '%', 'gauge', 'asDouble', {}));
  metrics.push(createMetric('memory', getMemoryUsagePercentage(), '%', 'gauge', 'asDouble', {}));

  metrics.push(createMetric('pizza_success', pizzaSuccess, '1', 'sum', 'asInt', {}));
  metrics.push(createMetric('pizza_failure', pizzaFailure, '1', 'sum', 'asInt', {}));
  metrics.push(createMetric('pizzas_made', pizzasMade, '1', 'sum', 'asInt', {}));
  metrics.push(createMetric('pizza_latency', pizzaLatency, 'ms', 'sum', 'asDouble', {}));
  metrics.push(createMetric('pizza_revenue', pizzaRevenue, 'usd', 'sum', 'asDouble', {}));

  sendMetricToGrafana(metrics);
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

module.exports = { requestTracker, greetingChanged, pizzaPurchase };