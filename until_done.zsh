#!/usr/bin/env zsh
set -euo pipefail

# Configuration
STOP_FILE="${STOP_FILE:-stop.txt}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-20}"
SLEEP_SECONDS="${SLEEP_SECONDS:-5}"

# Allow customizing the continue message via env; provide a clear default.
CONTINUE_MESSAGE=${CONTINUE_MESSAGE:-"Please continue. Remember: when you're absolutely done, create a file named 'stop.txt' in the current working directory."}

# Read prompt from stdin only (supports file redirection and pipes).
if [[ -t 0 ]]; then
  echo "Usage: Provide an initial prompt via stdin, e.g.:" >&2
  echo "  zsh ./until_done.zsh < prompt.txt" >&2
  echo "  echo 'Your prompt' | zsh ./until_done.zsh" >&2
  exit 64
fi

PROMPT_CONTENT=$(cat)

# Append instructions about the stop file so the model knows how to signal completion.
read -r -d '' STOP_INSTRUCTIONS <<'EOF' || true

Completion instruction:
- When you are absolutely finished with all required work, create a file named "stop.txt" in the current working directory.
- Only create "stop.txt" when everything is truly complete.
EOF

FULL_PROMPT="$PROMPT_CONTENT\n\n$STOP_INSTRUCTIONS"

is_done() {
  [[ -f "$STOP_FILE" ]]
}

echo "Starting initial request from stdin..."
ca -f --print "$FULL_PROMPT" || true

attempt=1
until is_done || (( attempt > MAX_ATTEMPTS )); do
  echo "'$STOP_FILE' not present yet (attempt $attempt/$MAX_ATTEMPTS). Requesting continuation..."
  ca -f continue "$CONTINUE_MESSAGE" || true
  sleep "$SLEEP_SECONDS"
  (( attempt++ ))
done

if is_done; then
  echo "All done: '$STOP_FILE' exists."
  exit 0
else
  echo "Gave up after $MAX_ATTEMPTS attempts. '$STOP_FILE' still not present." >&2
  exit 1
fi


