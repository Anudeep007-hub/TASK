# Real-time WebRTC Multi-Object Detection Demo

[cite_start]This project demonstrates real-time object detection on a video stream from a phone, processed and displayed in a browser with bounding box overlays. [cite: 1]

## One-Command Start

**Prerequisites**: Docker and Docker Compose must be installed.

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd webrtc-object-detection
    ```
    
2.  **Download the AI Model:**
    ```bash
    bash models/get_model.sh
    ```

3.  **Run the application:**
    The `start.sh` script launches the application using Docker Compose. [cite: 4, 13]
    ```bash
    ./start.sh --mode=wasm 
    ```
    This defaults to the low-resource WASM mode. [cite: 50]

## How to Use

1.  [cite_start]**Open the Laptop Browser**: After running `start.sh`, open **`http://localhost:3000`** on your laptop. [cite: 86]
2.  [cite_start]**Connect Your Phone**: Scan the QR code displayed on the laptop screen with your phone's camera. [cite: 86] This will open the sender page in your phone's browser.
3.  [cite_start]**Allow Camera Access**: Grant camera permissions on your phone when prompted. [cite: 87]
4.  [cite_start]**See the Magic**: You should now see the video from your phone mirrored on your laptop, with object detection overlays appearing in near real-time. [cite: 87]

## Mode Switching

You can run the application in two different modes:

* **WASM Mode (Low-resource)**: Inference runs directly in your browser using WebAssembly. [cite_start]This is ideal for devices without a powerful GPU. [cite: 10, 11]
    ```bash
    ./start.sh --mode=wasm
    ```

* **Server Mode**: Inference is offloaded to a Python backend server. This can handle more complex models but introduces network latency.
    ```bash
    ./start.sh --mode=server
    ```
    Then open **`http://localhost:8081`**. The URL in the browser controls the mode the client requests.

## Benchmarking

[cite_start]A script is provided to formalize metric collection. [cite: 44]
```bash
./bench/run_bench.sh