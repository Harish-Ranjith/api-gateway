const http = require('http');

// Either get the port from the command line, or default to 8001
const PORT = process.argv[2] || 8001;

const server = http.createServer((req, res) => {
    // The Health Check Endpoint (for the Gateway, not the user)
    if (req.url === '/health') {
        res.writeHead(200);
        return res.end('OK');
    }

    // Managing API traffic
    console.log(`[Target ${PORT}] Processed ${req.method} request for ${req.url}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        success: true,
        message: `Data served from backend server running on port ${PORT}`,
    }));
});

server.listen(PORT, () => {
    console.log(`Backend Target Server running on port ${PORT}`);
});