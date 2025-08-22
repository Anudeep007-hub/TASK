// main.js - Client-side logic for WebRTC connection and inference
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const overlayCanvas = document.getElementById('overlayCanvas');
const ctx = overlayCanvas.getContext('2d');
const qrContainer = document.getElementById('qr-container');
const phoneView = document.getElementById('phone-view');
const modeSpan = document.getElementById('mode');
const latencySpan = document.getElementById('latency');
const fpsSpan = document.getElementById('fps');

let pc;
let dataChannel;

// Automatically determine WebSocket protocol and host
const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const SIGNALING_SERVER_URL = `${protocol}://${window.location.host}`;
console.log(`Connecting to signaling server: ${SIGNALING_SERVER_URL}`);
const ws = new WebSocket(SIGNALING_SERVER_URL);

// --- State and Metrics ---
let isReceiver = false;
let inferenceMode = 'wasm';
let frameCounter = 0;
let lastFrameTime = performance.now();
const latencyBuffer = [];
const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 240;
let isProcessing = false;
let detectionQueue = new Map();
let ortSession;

// --- Main Logic ---
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('phone')) {
        console.log("This is the PHONE client (sender)");
        qrContainer.style.display = 'none';
        phoneView.style.display = 'block';
        startAsSender();
    } else {
        console.log("This is the LAPTOP client (receiver)");
        isReceiver = true;
        document.getElementById('video-container').style.display = 'block';
        document.getElementById('stats').style.display = 'block';
        inferenceMode = urlParams.get('mode') || 'wasm';
        modeSpan.innerText = inferenceMode.toUpperCase();
        setupReceiver();
        if (inferenceMode === 'wasm') {
            await initializeOrtSession();
        }
    }
});

ws.onopen = () => {
    console.log("WebSocket connection established.");
};


let pendingCandidates = [];

// When receiving a message
ws.onmessage = async (message) => {
    let msgText;
    if (typeof message.data === "string") {
        msgText = message.data;
    } else if (message.data instanceof Blob) {
        msgText = await message.data.text();
    } else if (message.data instanceof ArrayBuffer) {
        msgText = new TextDecoder("utf-8").decode(message.data);
    } else {
        console.warn("Unknown message type:", message.data);
        return;
    }

    try {
        const data = JSON.parse(msgText);

        if (data.offer && isReceiver) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({ answer }));

            // Flush pending ICE
            for (const c of pendingCandidates) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(c));
                } catch (e) {
                    console.error("Failed to add queued ICE:", e);
                }
            }
            pendingCandidates = [];

        } else if (data.answer && !isReceiver) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));

            // Flush pending ICE
            for (const c of pendingCandidates) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(c));
                } catch (e) {
                    console.error("Failed to add queued ICE:", e);
                }
            }
            pendingCandidates = [];
} else if (data.iceCandidate) {
    console.log("Received ICE candidate:", data.iceCandidate);

    try {
        const ice = new RTCIceCandidate(data.iceCandidate);

        if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(ice);
            console.log(" ICE candidate added immediately");
        } else {
            console.log("Queueing ICE candidate until remote description is set");
            pendingCandidates.push(ice);
        }
    } catch (e) {
        console.error(" Error handling received ICE candidate:", e, data.iceCandidate);
    }
}


    } catch (err) {
        console.error("Error processing signaling message:", err);
    }

};


function createPeerConnection() {
    console.log("Creating Peer Connection...");
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            {
                urls: "turn:openrelay.metered.ca:80",
                username: "openrelayproject",
                credential: "openrelayproject",
            }
        ]
    };
    pc = new RTCPeerConnection(configuration);

    // --- DETAILED LOGGING ---
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log("Generated ICE candidate, sending...", event.candidate);
            ws.send(JSON.stringify({ iceCandidate: event.candidate }));
        } else {
            console.log("All ICE candidates have been sent.");
        }
    };

    pc.oniceconnectionstatechange = () => {
        console.log(`ICE Connection State changed: ${pc.iceConnectionState}`);
    };

    pc.onconnectionstatechange = () => {
        console.log(`Connection State changed: ${pc.connectionState}`);
        if (pc.connectionState === 'connected') {
            console.log("SUCCESS: Peers connected!");
        }
    };

    pc.ontrack = (event) => {
        
        console.log("Received remote track!");
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            console.log('Success! Received remote video stream.');
        }
    };

    pc.ondatachannel = (event) => {
        console.log("Received data channel.");
        const receiveChannel = event.channel;
        receiveChannel.onmessage = (event) => {
            const resultPacket = JSON.parse(event.data);
            detectionQueue.set(resultPacket.frame_id, resultPacket);
        };
    };
}

async function startAsSender() {
    createPeerConnection();
    try {
        console.log("Requesting camera access...");
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        localVideo.srcObject = stream;
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
        console.log("Camera access granted, tracks added.");

        dataChannel = pc.createDataChannel("detections");

        console.log("Creating OFFER...");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ offer }));
        console.log("Sent OFFER.");
    } catch (e) {
        console.error("Error starting as sender:", e);
        alert("Could not start camera. Please grant permission and reload.");
    }
}

function setupReceiver() {
    const joinUrl = `${window.location.origin}${window.location.pathname}?phone=true`;
    new QRCode(document.getElementById("qrcode"), joinUrl);
    createPeerConnection();
    remoteVideo.onloadedmetadata = () => {
        overlayCanvas.width = remoteVideo.videoWidth;
        overlayCanvas.height = remoteVideo.videoHeight;
        requestAnimationFrame(processFrame);
    };
}

// ... (The rest of the main.js file from "Inference and Overlay Logic" onward can remain exactly the same) ...

async function initializeOrtSession() {
    try {
        ortSession = await ort.InferenceSession.create('/models/yolov8n.onnx', {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        });
        console.log("ONNX Runtime session initialized for WASM.");
    } catch (e) {
        console.error("Failed to initialize ONNX session:", e);
    }
}

async function processFrame() {
    if (!isReceiver || isProcessing || remoteVideo.paused || remoteVideo.ended || remoteVideo.videoWidth === 0) {
        requestAnimationFrame(processFrame);
        return;
    }

    const frame_id = Date.now();

    if (inferenceMode === 'wasm' && ortSession) {
        isProcessing = true;
        const canvas = document.createElement('canvas');
        canvas.width = FRAME_WIDTH;
        canvas.height = FRAME_HEIGHT;
        const context = canvas.getContext('2d');
        context.drawImage(remoteVideo, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
        const imageData = context.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT);

        const [input, imgWidth, imgHeight] = preprocess(imageData);
        const tensor = new ort.Tensor('float32', input, [1, 3, FRAME_HEIGHT, FRAME_WIDTH]);

        const results = await ortSession.run({ images: tensor });
        const detections = processOutput(results.output0.data, imgWidth, imgHeight);

        const resultPacket = {
            frame_id: frame_id,
            capture_ts: frame_id, // Simplified for WASM
            detections: detections
        };
        detectionQueue.set(frame_id, resultPacket);
        isProcessing = false;

    } else if (inferenceMode === 'server') {
        // Server mode is handled by receiving data channel messages
    }

    drawOverlays();
    updateMetrics();

    requestAnimationFrame(processFrame);
}


function drawOverlays() {
    if (detectionQueue.size > 0) {
        const latestFrameId = Math.max(...detectionQueue.keys());
        const result = detectionQueue.get(latestFrameId);

        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        if (result && result.detections) {
            result.detections.forEach(det => {
                const [x1, y1, x2, y2] = [
                    det.xmin * overlayCanvas.width,
                    det.ymin * overlayCanvas.height,
                    det.xmax * overlayCanvas.width,
                    det.ymax * overlayCanvas.height
                ];
                ctx.strokeStyle = '#00FF00';
                ctx.lineWidth = 2;
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

                ctx.fillStyle = '#00FF00';
                ctx.font = '16px sans-serif';
                ctx.fillText(`${det.label} (${(det.score * 100).toFixed(1)}%)`, x1, y1 > 10 ? y1 - 5 : 15);
            });

            const latency = Date.now() - result.capture_ts;
            latencyBuffer.push(latency);
            if (latencyBuffer.length > 100) latencyBuffer.shift();
        }

        detectionQueue.forEach((value, key) => {
            if (key < latestFrameId) {
                detectionQueue.delete(key);
            }
        });
    }
}

function updateMetrics() {
    frameCounter++;
    const now = performance.now();
    const delta = now - lastFrameTime;

    if (delta >= 1000) {
        const fps = (frameCounter * 1000) / delta;
        fpsSpan.innerText = fps.toFixed(1);
        frameCounter = 0;
        lastFrameTime = now;

        if (latencyBuffer.length > 0) {
            const avgLatency = latencyBuffer.reduce((a, b) => a + b, 0) / latencyBuffer.length;
            latencySpan.innerText = avgLatency.toFixed(0);
        }
    }
}
// --- Model Pre/Post Processing (for YOLOv8) ---
function preprocess(imageData) {
    const targetSize = 640; // YOLOv8 expects 640x640
    const offscreen = document.createElement("canvas");
    offscreen.width = targetSize;
    offscreen.height = targetSize;
    const ctx = offscreen.getContext("2d");

    // Draw & resize input frame to 640x640
    ctx.drawImage(imageData, 0, 0, targetSize, targetSize);

    // Get pixel data
    const resized = ctx.getImageData(0, 0, targetSize, targetSize);
    const { data } = resized;

    const dataTensor = new Float32Array(3 * targetSize * targetSize);

    let p = 0;
    for (let i = 0; i < data.length; i += 4) {
        dataTensor[p] = data[i] / 255;          // R
        dataTensor[p + targetSize * targetSize] = data[i + 1] / 255; // G
        dataTensor[p + 2 * targetSize * targetSize] = data[i + 2] / 255; // B
        p++;
    }

    // Return in YOLO format: NCHW
    return new ort.Tensor("float32", dataTensor, [1, 3, targetSize, targetSize]);
}


function processOutput(data, imgWidth, imgHeight) {
    const boxes = [];
    // FIXED a small typo here, changed index.++ to index++
    for (let index = 0; index < 8400; index++) {
        const [class_id, prob] = [...Array(80).keys()]
            .map(col => [col, data[8400 * (col + 4) + index]])
            .reduce((a, b) => a[1] > b[1] ? a : b, [0, 0]);

        if (prob < 0.5) continue;

        const label = COCO_CLASSES[class_id];
        const xc = data[index];
        const yc = data[8400 + index];
        const w = data[2 * 8400 + index];
        const h = data[3 * 8400 + index];

        boxes.push({
            label: label,
            score: prob,
            xmin: (xc - w / 2) / FRAME_WIDTH,
            ymin: (yc - h / 2) / FRAME_HEIGHT,
            xmax: (xc + w / 2) / FRAME_WIDTH,
            ymax: (yc + h / 2) / FRAME_HEIGHT,
        });
    }
    return boxes;
}

const COCO_CLASSES = [
    'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
    'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
    'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
    'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard',
    'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
    'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
    'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard',
    'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase',
    'scissors', 'teddy bear', 'hair drier', 'toothbrush'
];