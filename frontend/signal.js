const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 8080;

app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

wss.on('connection', ws => {
    ws.id = uuidv4(); // Assign a unique ID to each client
    console.log(`Client connected: ${ws.id}`);

    ws.on('message', message => {
        // Broadcast every message to every other client
        wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    });

    ws.on('close', () => {
        console.log(`Client disconnected: ${ws.id}`);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${ws.id}:`, error);
    });
});

server.listen(PORT, () => {
    console.log(`Server is listening on http://localhost:${PORT}`);
});