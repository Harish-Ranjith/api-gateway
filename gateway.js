const http = require('http');

// The Server Pool
const servers = [
    { host: 'localhost', port: 8001, isHealthy: true },
    { host: 'localhost', port: 8002, isHealthy: true },
    { host: 'localhost', port: 8003, isHealthy: true },
];

let currentServerIndex = 0;

// Implementing the Round-Robin Algorithm to get the next healthy server
function getNextHealthyServer() {
    const healthyServers = servers.filter(s => s.isHealthy);
    if (healthyServers.length === 0) return null; // then total system failure

    // Try the next server, and loop back to 0 if we reach the end of the array
    currentServerIndex = (currentServerIndex + 1) % healthyServers.length;
    return healthyServers[currentServerIndex];
}

// Server Active Health Checker (Runs every 5 seconds)
setInterval(() => {
    servers.forEach(server => {
        const req = http.get(`http://${server.host}:${server.port}/health`, (res) => {
            if (res.statusCode === 200) {
                if (!server.isHealthy) console.log(`[Health Check:] Server ${server.port} recovered. Status: UP.`);
                server.isHealthy = true;
            } else {
                if (server.isHealthy) console.log(`[Health Check:] Server ${server.port} returned ${res.statusCode}. Status: DOWN.`);
                server.isHealthy = false;
            }
        });

        // If the server is completely offline (crashed/killed)
        req.on('error', () => {
            if (server.isHealthy) console.log(`[Health Check:] Server ${server.port} is unreachable. Status: DOWN.`);
            server.isHealthy = false;
        });
    });
}, 5000);

// The Proxy Server
const server = http.createServer((clientReq, clientRes) => {
    const targetServer = getNextHealthyServer();

    if (!targetServer) {
        clientRes.writeHead(503, { 'Content-Type': 'application/json' });
        return clientRes.end(JSON.stringify({ error: "503 Service Unavailable", message: "All backend servers are offline." }));
    }

    console.log(`[Gateway] Routing request to port ${targetServer.port}`);

    const options = {
        hostname: targetServer.host,
        port: targetServer.port,
        path: clientReq.url,
        method: clientReq.method,
        headers: clientReq.headers,
    };

    const proxyReq = http.request(options, (proxyRes) => {
        clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(clientRes);
    });

    proxyReq.on('error', (err) => {
        console.error(`[Gateway Error] Failed to reach port ${targetServer.port}`);
        clientRes.writeHead(502);
        clientRes.end("502 Bad Gateway");
    });

    clientReq.pipe(proxyReq);
});

server.listen(8000, () => {
    console.log("Gateway Load Balancer running on http://localhost:8000");
});