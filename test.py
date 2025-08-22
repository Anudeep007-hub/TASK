# export.py
from ultralytics import YOLO
import os

# Load your downloaded .pt model
# !!! IMPORTANT: Replace 'your_model.pt' with the actual name of your file !!!
MODEL_PATH = os.path.join("models", "yolov8n.pt")
model = YOLO(MODEL_PATH)

# Export the model to ONNX format
# This will create a new file named 'your_model.onnx'
model.export(format='onnx')

print("Model has been successfully converted to ONNX format!")