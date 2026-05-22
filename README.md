# Aegis API Gateway

A simple API gateway in Node.js with a React dashboard. No frameworks, no dependencies on the backend — just the `http` module doing what it does best.

It sits in front of your backend servers and handles reverse proxying, load balancing, a basic WAF, rate limiting, request tracing, and pushes everything to a live dashboard over SSE.

## Architecture

```
                        ┌───────────────────────────────────┐
                        │      React Dashboard (:5173)      │
                        │     connects via /admin/stream    │
                        └───────────────┬───────────────────┘
                                        │ SSE
                                        ▼
┌────────┐         ┌───────────────────────────────────────────┐
│ Client │──HTTP──▶│            Gateway (:8000)                │
└────────┘         │                                           │
                   │  WAF ──▶ Rate Limiter ──▶ Load Balancer   │
                   │                              │            │
                   │         Tracer ◀─────────────┘            │
                   │           │                               │
                   │     File Logger + SSE Broadcast           │
                   └───────────┬──────────┬──────────┬─────────┘
                               ▼          ▼          ▼
                          ┌────────┐ ┌────────┐ ┌────────┐
                          │ :8001  │ │ :8002  │ │ :8003  │
                          └────────┘ └────────┘ └────────┘
```

## Project Structure

```
API-Gateway/
├── gateway.js           # the gateway itself (~50 lines)
├── middleware.js         # WAF, rate limiter, load balancer, logger
├── target.js            # dummy backend server
├── gateway-access.log   # written to automatically
│
└── gateway-dashboard/   # React + Vite frontend
    └── src/
        ├── App.jsx      # dashboard UI (shadcn/ui components)
        └── index.css    # tailwind + shadcn theme
```

## How It Works

The gateway is split into two files to keep things readable.

### middleware.js

This is where all the reusable logic lives:

- **`passesWAF(req)`** — checks the URL against a few regex patterns (XSS tags, SQL injection, etc). Returns false if anything looks sketchy.
- **`passesRateLimit(ip)`** — tracks request counts per IP with a 10-second sliding window. Allows 5 requests before cutting you off.
- **`getNextHealthyServer(servers)`** — round-robins through whichever servers are currently marked healthy. Returns null if everything is down.
- **`broadcastToAdmins(clients, event, data)`** — pushes an SSE event to every connected dashboard.
- **`logToFile(entry)`** — appends a log line to `gateway-access.log`.

Configuration is at the top of the file:

```js
const RATE_LIMIT_MAX = 5;          // requests per window
const RATE_LIMIT_WINDOW = 10000;   // 10 seconds
const WAF_RULES = [                // blocked patterns
    /(<([^>]+)>)/ig,               // HTML tags (XSS)
    /UNION\s+SELECT/ig,            // SQL injection
    /OR\s+1=1/ig,                  // SQL tautology
    /DROP\s+TABLE/ig               // destructive queries
];
```

### gateway.js

This is the main server. Every request goes through these steps in order:

1. CORS headers get slapped on.
2. `OPTIONS` → 204 and done.
3. `/admin/stream` → opens an SSE connection for the dashboard.
4. `/admin/servers` → returns the server list as JSON.
5. Everything else hits the security pipeline:
   - WAF check → 403 if blocked
   - Rate limit check → 429 if exceeded
   - A trace ID gets generated and injected as `x-request-id`
   - Request is proxied to the next healthy backend
   - On success: log to file, broadcast to dashboard
   - On failure: retry once for GET/PUT/DELETE, otherwise 502

Admin routes skip the WAF and rate limiter entirely.

A health checker runs every 5 seconds in the background, pinging each target's `/health` endpoint. When a server goes down or comes back up, the dashboard gets notified immediately.

### target.js

A bare-bones backend server. Takes a port number as an argument, responds to `/health` with 200, and everything else with a JSON message saying which port served the request. That's it.

## Running It

You need Node.js v18+ (for `crypto.randomUUID`).

```bash
# start three backend servers
node target.js 8001
node target.js 8002
node target.js 8003

# start the gateway
node gateway.js

# start the dashboard
cd gateway-dashboard
npm install
npm run dev
```

Gateway runs on `http://localhost:8000`, dashboard on `http://localhost:5173`.

## Trying It Out

Proxy a request:
```bash
curl http://localhost:8000/api/test
# {"success":true,"message":"Served from port 8001"}
```

Trigger the WAF:
```bash
curl "http://localhost:8000/%3Cscript%3Ealert(1)%3C/script%3E"
# {"error":"403 Forbidden"}
```

Hit the rate limit:
```bash
for i in {1..6}; do curl -s http://localhost:8000/api/test; echo; done
# 6th request returns {"error":"429 Too Many Requests"}
```

Check server health:
```bash
curl http://localhost:8000/admin/servers
# [{"host":"localhost","port":8001,"isHealthy":true}, ...]
```

Kill one of the target servers and watch the dashboard update within 5 seconds.

## SSE Events

The dashboard connects to `GET /admin/stream` and listens for two event types:

**`health`** — sent when a server's status changes, and on first connect:
```json
[
  { "host": "localhost", "port": 8001, "isHealthy": true },
  { "host": "localhost", "port": 8002, "isHealthy": false }
]
```

**`log`** — sent after each proxied request completes:
```json
{
  "traceId": "a1b2c3d4-...",
  "method": "GET",
  "url": "/api/users",
  "target": 8001,
  "status": 200,
  "latency": 12
}
```

## License

MIT
