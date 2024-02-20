#!/bin/bash
# Start electron-vite dev and keep track of its process ID
export KIT=~/.kit-fresh
export KENV=~/.kenv-fresh
export KNODE=~/.knode-fresh
export MAIN_SKIP_SETUP=true
export VITE_LOG_LEVEL=debug
./node_modules/.bin/electron-vite dev &
pid=$!

# Create a process group
set -m
trap "echo 'Stopping electron-vite...'; pkill -x 'Electron'; pkill -f 'Electron'; wait $pid;" SIGINT

# Wait for the electron-vite process to finish
wait $pid
