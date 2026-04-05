const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const setupWSConnection = require('./node_modules/y-websocket/bin/utils.js').setupWSConnection;

const port = process.env.PORT || 1234;
const host = process.env.HOST || '0.0.0.0';

// Simple Static File Server
const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') filePath = './crdt.html';

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File Not Found');
            } else {
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Integrated WebSocket Server
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws, req) => {
    console.log('[Sync] New Peer Connected');
    setupWSConnection(ws, req);
});

// Handle Upgrade
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

server.listen(port, host, () => {
    console.log(`\n🚀 Ukrainian National Consilium Editor for Court Systems`);
    console.log(`📂 Serving: ${path.resolve('.')}`);
    console.log(`🌐 URL: http://localhost:${port}/crdt.html`);
    console.log(`📡 WebSocket: ws://localhost:${port}\n`);
});
