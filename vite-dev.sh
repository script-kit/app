#!/bin/bash
# Start electron-vite dev and keep track of its process ID
MAIN_SKIP_SETUP=true VITE_LOG_LEVEL=info ./node_modules/.bin/electron-vite dev &
pid=$!

# Create a process group
set -m
trap "echo 'Stopping electron-vite...'; pkill -x 'Electron'; pkill -f 'Electron'; wait $pid; echo 'Restarting script...'; exec $0" SIGINT

# Wait for the electron-vite process to finish
wait $pid
