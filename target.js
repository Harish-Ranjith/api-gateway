const http = require('http');

const server = http.createServer((req, res) => {
    console.log('Request received - 8001');
    console.log(`Received ${req.method} request for: ${req.url}`);

    res.writeHead(200, {
        "content-type": "application/json"
    });
    res.end(JSON.stringify({
        success: true,
        message: "Data fetched successfully from backend on port 8001",
        pathRequested: req.url
    }));
});

server.listen(8001, () => {
    console.log('Target Server is running on port http://localhost:8001');
});
