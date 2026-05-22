const http = require('http');
const crypto = require('crypto');
const { passesWAF, passesRateLimit, getNextHealthyServer, broadcastToAdmins, logToFile } = require('./middleware');

let servers = [
    { host: 'localhost', port: 8001, isHealthy: true },
    { host: 'localhost', port: 8002, isHealthy: true },
    { host: 'localhost', port: 8003, isHealthy: true },
];

const adminClients = [];

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-request-id'
};

// Ping each target every 5s and update the dashboard on status changes.
setInterval(() => {
    servers.forEach(s => {
        http.get(`http://${s.host}:${s.port}/health`, r => {
            const was = s.isHealthy;
            s.isHealthy = r.statusCode === 200;
            if (was !== s.isHealthy) broadcastToAdmins(adminClients, 'health', servers);
        }).on('error', () => {
            if (s.isHealthy) {
                s.isHealthy = false;
                broadcastToAdmins(adminClients, 'health', servers);
            }
        });
    });
}, 5000);

http.createServer((req, res) => {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

    // Admin routes — these bypass WAF and rate limiting
    if (req.url === '/admin/stream') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
        adminClients.push(res);
        return res.write(`event: health\ndata: ${JSON.stringify(servers)}\n\n`);
    }
    if (req.url === '/admin/servers' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(servers));
    }

    // Security checks
    const start = Date.now();
    const traceId = crypto.randomUUID();
    const ip = req.socket.remoteAddress;
    req.headers['x-request-id'] = traceId;

    if (!passesWAF(req))       { res.writeHead(403, CORS); return res.end(JSON.stringify({ error: '403 Forbidden' })); }
    if (!passesRateLimit(ip))  { res.writeHead(429, CORS); return res.end(JSON.stringify({ error: '429 Too Many Requests' })); }

    // Proxy the request, retry once for idempotent methods
    (function attempt(retries) {
        const target = getNextHealthyServer(servers);
        if (!target) { res.writeHead(503); return res.end(JSON.stringify({ error: '503 Service Unavailable' })); }

        const proxy = http.request({
            hostname: target.host, port: target.port,
            path: req.url, method: req.method, headers: req.headers
        }, pRes => {
            res.writeHead(pRes.statusCode, pRes.headers);
            pRes.pipe(res);
            res.on('finish', () => {
                const entry = { traceId, method: req.method, url: req.url, ip, target: target.port, status: pRes.statusCode, latency: Date.now() - start };
                logToFile(entry);
                broadcastToAdmins(adminClients, 'log', entry);
            });
        });

        proxy.on('error', () => {
            if (['GET', 'PUT', 'DELETE'].includes(req.method) && retries > 0) {
                target.isHealthy = false;
                broadcastToAdmins(adminClients, 'health', servers);
                attempt(retries - 1);
            } else {
                res.writeHead(502);
                res.end(JSON.stringify({ error: '502 Bad Gateway' }));
            }
        });

        req.pipe(proxy);
    })(1);

}).listen(8000, () => console.log('Gateway running on http://localhost:8000'));