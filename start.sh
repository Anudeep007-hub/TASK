#!/bin/bash
# Convenience script to start the demo

# Default mode
MODE="wasm"

# Parse arguments
for arg in "$@"
do
    case $arg in
        --mode=*)
        MODE="${arg#*=}"
        shift # Remove --mode= from the list of arguments
        ;;
    esac
done

# Stop any previous instances
docker-compose down 2>/dev/null

if [ "$MODE" = "server" ]; then
    echo "Starting in SERVER mode..."
    # In server mode, the python server handles signaling and serves files.
    # We will use a different compose override for this.
    # For simplicity, this example will just launch the server container.
    # A more robust script would use docker-compose -f docker-compose.yml -f docker-compose.server.yml up
    echo "Server mode is advanced. This script defaults to running docker-compose up and you can select the mode via URL query param `?mode=server`"
    echo "For a true server-only setup, you would adjust the compose file."
    docker-compose up --build -d server
    # The python server serves the frontend files, so we'll access it directly.
    echo "Open http://localhost:8081"

elif [ "$MODE" = "wasm" ]; then
    echo "Starting in WASM mode..."
    docker-compose up --build -d frontend
    echo "WASM Mode: Open http://localhost:3000"

else
    echo "Invalid mode specified. Use --mode=wasm or --mode=server"
    exit 1
fi

echo "To stop, run: docker-compose down"