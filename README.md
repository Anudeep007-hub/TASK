

# Real-time WebRTC Multi-Object Detection

This project demonstrates real-time object detection on a video stream from a phone's camera, which is then displayed with bounding box overlays in a laptop's web browser. The entire application is containerized with Docker for easy and reproducible setup.

## \#\# Prerequisites

Before you begin, ensure you have the following installed on your system:

  * **Docker**: [Get Docker](https://www.docker.com/get-started)
  * **Docker Compose**: (Usually included with Docker Desktop)
  * A webcam and a modern smartphone (Android/iOS)

-----

## \#\# Quick Start

From your project's root directory, you can get the entire application running with just 1 commands.

1.  **Build and Run with Docker Compose:**

    ```bash
    docker-compose up --build
    ```

    This command will build the Docker images for the frontend and server, and then start both services. Keep this terminal open to see live logs.

-----

## \#\# Step-by-Step Usage Instructions

Because modern browsers require a secure `https` connection to access a device's camera, you must use a tunneling service like `ngrok` to create a secure URL for your local server.

### \#\#\# 1. Start the Application

Make sure the application is running by using the `docker-compose` command from the Quick Start section.

### \#\#\# 2. Start the Secure Tunnel (ngrok)

1.  Open a **new, separate terminal window** (do not close the Docker terminal).
2.  Run the following command to create a secure tunnel to the running frontend container on port `3000`:
    ```bash
    ngrok http 3000
    ```
3.  `ngrok` will display a "Forwarding" address. Copy the **`https`** URL. It will look something like this: `https://<random-string>.ngrok-free.app`

### \#\#\# 3. Run the Demo

1.  On your **laptop's browser**, open the secure `https` URL you copied from ngrok.
2.  The web application will load and display a **QR code**.
3.  On your **phone**, open your camera app and scan the QR code. This will open the same URL in your phone's browser.
4.  Your phone's browser will ask for **permission to access the camera**. You must tap **"Allow"**.
5.  You should now see the video from your phone's camera streaming live on your laptop's browser, with object detection overlays appearing in real-time.

-----

## \#\# Troubleshooting

  * **QR Code Not Appearing**: This can happen if the `qrcode.min.js` file is missing. Run the following command to download it and then restart the application:
    ```bash
    wget -O frontend/public/qrcode.min.js https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs/qrcode.min.js
    ```
  * **Phone Cannot Connect**: Ensure both your laptop and phone are on the same network. If the connection still fails, it is likely a firewall on your laptop blocking the connection. Temporarily disable your firewall to test this.
  * **Black Screen on Laptop**: This means the WebRTC peer-to-peer connection failed. Ensure you are using the `https` ngrok URL and have granted camera permissions on your phone. The STUN/TURN servers in the code should handle most network issues, but a highly restrictive network can still be a problem.

### \#\# How to Stop the Application

To stop both the frontend and server containers, go to the terminal where `docker-compose` is running and press `Ctrl + C`. To clean up and remove the containers and network, run:

```bash
docker-compose down
```