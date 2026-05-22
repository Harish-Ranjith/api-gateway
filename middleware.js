const fs = require('fs');
const path = require('path');

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 10000;
const LOG_FILE = path.join(__dirname, 'gateway-access.log');
const WAF_RULES = [/(<([^>]+)>)/ig, /UNION\s+SELECT/ig, /OR\s+1=1/ig, /DROP\s+TABLE/ig];

const rateLimitMap = new Map();
let currentServerIndex = 0;

// Checks the request URL against known attack patterns.
function passesWAF(req) {
    return !WAF_RULES.some(rule => rule.test(decodeURIComponent(req.url)));
}

// Sliding-window rate limiter. Tracks per-IP request counts.
function passesRateLimit(ip) {
    const now = Date.now();
    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return true;
    }
    const data = rateLimitMap.get(ip);
    if (now > data.resetTime) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return true;
    }
    if (data.count >= RATE_LIMIT_MAX) return false;
    data.count++;
    return true;
}

// Round-robin across healthy servers only.
function getNextHealthyServer(servers) {
    const healthy = servers.filter(s => s.isHealthy);
    if (healthy.length === 0) return null;
    currentServerIndex = (currentServerIndex + 1) % healthy.length;
    return healthy[currentServerIndex];
}

// Push an SSE event to every connected dashboard client.
function broadcastToAdmins(clients, event, data) {
    clients.forEach(c => c.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

// Append a structured log line to the access log.
function logToFile(entry) {
    const line = `[${new Date().toISOString()}] [Trace: ${entry.traceId}] ${entry.method} ${entry.url} | Target: ${entry.target} | Status: ${entry.status} | Latency: ${entry.latency}ms\n`;
    fs.appendFile(LOG_FILE, line, () => {});
}

module.exports = { passesWAF, passesRateLimit, getNextHealthyServer, broadcastToAdmins, logToFile };
