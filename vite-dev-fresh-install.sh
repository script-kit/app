#!/bin/bash

# Declare environment variables
export KIT=~/.kit-fresh
export KENV=~/.kenv-fresh
export KNODE=~/.knode-fresh
export VITE_LOG_LEVEL=debug

# Check if directories exist and prompt for deletion only if they do
dirsToDelete=()
if [ -d "$KIT" ]; then
  echo "$KIT exists."
  dirsToDelete+=("$KIT")
fi
if [ -d "$KENV" ]; then
  echo "$KENV exists."
  dirsToDelete+=("$KENV")
fi
if [ -d "$KNODE" ]; then
  echo "$KNODE exists."
  dirsToDelete+=("$KNODE")
fi

if [ ${#dirsToDelete[@]} -gt 0 ]; then
  echo "You are about to delete the following directories:"
  for dir in "${dirsToDelete[@]}"; do
    echo "$dir"
  done

  read -r -n 1 -p "This action cannot be undone. Are you sure? (y/n) " confirmation
  echo # Move to a new line
  if [[ "$confirmation" == "y" ]]; then
      for dir in "${dirsToDelete[@]}"; do
        echo "Deleting $dir..."
        rm -rf "$dir"
      done
      echo "Directories deleted."
  else
      echo "Operation cancelled."
  fi
else
  echo "No directories to delete."
fi

# Use npm view to get the version of @johnlindquist/kit tagged as 'next'
KIT_VERSION=$(npm view @johnlindquist/kit@next version)

# Construct the URL for the tarball from the npm registry
KIT_SDK_URL="https://registry.npmjs.org/@johnlindquist/kit/-/kit-$KIT_VERSION.tgz"

echo "Found Kit SDK from $KIT_SDK_URL"

export KIT_SDK_URL


# Start electron-vite dev and keep track of its process ID
./node_modules/.bin/electron-vite dev &
pid=$!

# Create a process group
set -m
trap "echo 'Stopping electron-vite...'; pkill -x 'Electron'; pkill -f 'Electron'; wait $pid;" SIGINT

wait $pid;

