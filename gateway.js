const http = require('http');

const TARGET_PORT = 8001;
const TARGET_HOST = 'localhost';


const server = http.createServer((clientReq, clientRes) => {
    console.log(`Gateway - 8000 -> Routing [${clientReq.method}] request for: ${clientReq.url} to target server on port ${TARGET_PORT}`);

    const options = {
        hostname: TARGET_HOST,
        port: TARGET_PORT,
        path: clientReq.url,
        method: clientReq.method,
        headers: clientReq.headers,
    }
    const proxyReq = http.request(options, (proxyRes) => {
        clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(clientRes);
    });

    proxyReq.on('error', (err) => {
        console.error(`[Gateway Error] Failed to route request: ${err.message}`);
        clientRes.writeHead(502, { 'Content-Type': 'application/json' });
        clientRes.end(JSON.stringify({ error: "502 Bad Gateway", details: err.message }));
    });

    clientReq.pipe(proxyReq);
});

server.listen(8000, () => {
    console.log("Gateway running on http://localhost:8000");
});
