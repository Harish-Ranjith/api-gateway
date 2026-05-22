const http = require('http');

const PORT = process.argv[2] || 8001;

http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200);
        return res.end('OK');
    }

    console.log(`[Target ${PORT}] ${req.method} ${req.url}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: `Served from port ${PORT}` }));
}).listen(PORT, () => console.log(`Target server running on port ${PORT}`));