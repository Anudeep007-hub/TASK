#!/bin/bash
# This script downloads a quantized YOLOv8n model suitable for CPU and WASM inference.
echo "Creating models directory..."
mkdir -p models

echo "Downloading yolov8n.onnx model..."
# Credit to dylanebert for the web-friendly exported model
wget -O models/yolov8n.onnx https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt

echo "Download complete. Model is at models/yolov8n.onnx"