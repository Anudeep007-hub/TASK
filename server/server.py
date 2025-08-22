import asyncio
import json
import logging
import uuid
import time
import numpy as np
import onnxruntime
from PIL import Image
import os
from aiohttp import web
from aiortc import MediaStreamTrack, RTCPeerConnection, RTCSessionDescription

# --- Logging ---
logging.basicConfig(level=logging.INFO)
ROOT = os.path.dirname(__file__)

# --- ONNX Model Initialization ---
MODEL_PATH = "models/yolov8n.onnx"
session = onnxruntime.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
model_inputs = session.get_inputs()
input_name = model_inputs[0].name
model_outputs = session.get_outputs()
output_names = [o.name for o in model_outputs]

COCO_CLASSES = [
    'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
    'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
    'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
    'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard',
    'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
    'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
    'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard',
    'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase',
    'scissors', 'teddy bear', 'hair drier', 'toothbrush'
]

pcs = set()

class VideoTransformTrack(MediaStreamTrack):
    kind = "video"
    is_processing = False

    def __init__(self, track, data_channel):
        super().__init__()
        self.track = track
        self.data_channel = data_channel

    async def recv(self):
        frame = await self.track.recv()
        
        if self.is_processing:
            return frame

        self.is_processing = True
        try:
            capture_ts = int(time.time() * 1000)
            img = frame.to_ndarray(format="bgr24")
            
            img_pil = Image.fromarray(img)
            img_resized = img_pil.resize((640, 640))
            img_np = np.array(img_resized).astype(np.float32) / 255.0
            img_np = np.transpose(img_np, (2, 0, 1))
            input_tensor = np.expand_dims(img_np, axis=0)
            
            outputs = session.run(output_names, {input_name: input_tensor})
            
            recv_ts = int(time.time() * 1000)
            detections = self.process_output(outputs[0])
            inference_ts = int(time.time() * 1000)

            result = {
                "frame_id": str(uuid.uuid4()),
                "capture_ts": capture_ts,
                "recv_ts": recv_ts,
                "inference_ts": inference_ts,
                "detections": detections,
            }
            if self.data_channel and self.data_channel.readyState == "open":
                self.data_channel.send(json.dumps(result))

        except Exception as e:
            logging.error(f"Error processing frame: {e}")
        finally:
            self.is_processing = False
        
        return frame
    
    def process_output(self, data):
        data = data[0].T
        boxes = []
        for row in data:
            prob = row[4:].max()
            if prob < 0.5:
                continue
            class_id = row[4:].argmax()
            label = COCO_CLASSES[class_id]
            xc, yc, w, h = row[:4]
            
            boxes.append({
                "label": label,
                "score": float(prob),
                "xmin": (xc - w / 2) / 640,
                "ymin": (yc - h / 2) / 640,
                "xmax": (xc + w / 2) / 640,
                "ymax": (yc + h / 2) / 640,
            })
        return boxes

async def offer(request):
    params = await request.json()
    offer = RTCSessionDescription(sdp=params["sdp"], type=params["type"])
    
    pc = RTCPeerConnection()
    pcs.add(pc)
    
    data_channel = None

    @pc.on("datachannel")
    def on_datachannel(channel):
        nonlocal data_channel
        data_channel = channel
        logging.info(f"DataChannel '{channel.label}' created")

    @pc.on("iceconnectionstatechange")
    async def on_iceconnectionstatechange():
        logging.info(f"ICE connection state is {pc.iceConnectionState}")
        if pc.iceConnectionState == "failed":
            await pc.close()
            pcs.discard(pc)

    @pc.on("track")
    def on_track(track):
        logging.info(f"Track {track.kind} received")
        if track.kind == "video":
            pc.addTrack(VideoTransformTrack(track, data_channel))

    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return web.Response(
        content_type="application/json",
        text=json.dumps({"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}),
    )

async def on_shutdown(app):
    coros = [pc.close() for pc in pcs]
    await asyncio.gather(*coros)
    pcs.clear()

app = web.Application()
app.on_shutdown.append(on_shutdown)
app.router.add_post("/offer", offer)
app.router.add_static('/', path='frontend/public', name='static')

if __name__ == "__main__":
    web.run_app(app, access_log=None, host="0.0.0.0", port=8080)