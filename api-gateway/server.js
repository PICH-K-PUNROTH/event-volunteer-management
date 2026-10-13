require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// NOTE: express.json() is intentionally NOT used here, the raw body is streamed to the services.

// ---------- JWT check done once at the gateway ----------
const gatewayAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Gateway: token missing' });
  }
  try {
    req.user = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Gateway: invalid or expired token' });
  }
};

// ---------- Round-robin load balancer ----------
// Give a comma separated list of URLs and requests are spread evenly between them.
const roundRobin = (urls) => {
  const targets = urls.split(',').map((u) => u.trim()).filter(Boolean);
  let index = 0;
  return () => {
    const target = targets[index];
    index = (index + 1) % targets.length;
    return target;
  };
};
const nextEventTarget = roundRobin(process.env.EVENT_SERVICE_URLS || '');

// ---------- Proxy helper ----------
const proxyTo = (prefix, target) =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
    pathFilter: prefix,
    pathRewrite: { '^/api': '' }, // /api/events -> /events
    on: {
      error: (err, req, res) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: `Gateway: ${prefix} service is unreachable` }));
      },
    },
  });

// ---------- Gateway info ----------
app.get('/health', (req, res) => res.json({ service: 'api-gateway', status: 'UP', port: PORT }));

// ---------- Public routes (no token) ----------
app.use(proxyTo('/api/register', process.env.REGISTRATION_SERVICE_URL));
app.use(proxyTo('/api/login', process.env.LOGIN_SERVICE_URL));

// ---------- Protected routes (valid JWT required, roles are checked by each service) ----------
app.use(['/api/events', '/api/assignments'], gatewayAuth);

app.use(
  createProxyMiddleware({
    router: nextEventTarget, // load balanced
    changeOrigin: true,
    pathFilter: '/api/events',
    pathRewrite: { '^/api': '' },
    on: {
      error: (err, req, res) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Gateway: /api/events service is unreachable' }));
      },
    },
  })
);
app.use(proxyTo('/api/assignments', process.env.ASSIGNMENT_SERVICE_URL));

app.use((req, res) => res.status(404).json({ message: 'Gateway: route not found' }));

app.listen(PORT, '0.0.0.0', () => console.log(`API Gateway running on port ${PORT}`));
