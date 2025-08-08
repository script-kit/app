#!/usr/bin/env zsh
set -euo pipefail

# Configuration
STOP_FILE="${STOP_FILE:-stop.txt}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-20}"
SLEEP_SECONDS="${SLEEP_SECONDS:-5}"

# Allow customizing the continue message via env; provide a clear default.
CONTINUE_MESSAGE=${CONTINUE_MESSAGE:-"Please continue. Remember: when you're absolutely done with every step in the plan, create a file named 'stop.txt' in the current working directory."}

# Flags
CONTINUE_ONLY=false

print_usage() {
  echo "Usage:" >&2
  echo "  # Start new run (reads prompt from stdin):" >&2
  echo "  zsh ./until_done.zsh < prompt.txt" >&2
  echo "  echo 'Your prompt' | zsh ./until_done.zsh" >&2
  echo "" >&2
  echo "Options:" >&2
  echo "  -c, --continue    Skip initial request; immediately send continuation messages" >&2
  echo "  -h, --help        Show this help and exit" >&2
}

# Parse CLI arguments
while (( $# > 0 )); do
  case "$1" in
    -c|--continue)
      CONTINUE_ONLY=true
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "Unknown option: $1" >&2
      print_usage
      exit 64
      ;;
    *)
      echo "Unexpected argument: $1" >&2
      print_usage
      exit 64
      ;;
  esac
done

# Read prompt from stdin only when NOT in continue-only mode
if [[ "$CONTINUE_ONLY" != true ]]; then
  # Read prompt from stdin only (supports file redirection and pipes).
  if [[ -t 0 ]]; then
    print_usage
    exit 64
  fi

  PROMPT_CONTENT=$(cat)

  # Append instructions about the stop file so the model knows how to signal completion.
  read -r -d '' STOP_INSTRUCTIONS <<'EOF' || true

Completion instruction:
- When you are absolutely finished with all required work listed in the steps, create a file named "stop.txt" in the current working directory.
- Only create "stop.txt" when the _entire plan_ is complete. The "stop.txt" indicates that the _entire plan_ is complete and ready to ship to users.
EOF

  FULL_PROMPT="$PROMPT_CONTENT\n\n$STOP_INSTRUCTIONS"

  is_done() {
    [[ -f "$STOP_FILE" ]]
  }

  echo "Starting initial request from stdin..."
  ca -f --print "$FULL_PROMPT" || true
else
  # Define is_done even in continue-only mode
  is_done() {
    [[ -f "$STOP_FILE" ]]
  }
  echo "Continue mode enabled: skipping initial request. Will send continuation messages until '$STOP_FILE' exists."
fi

attempt=1
until is_done || (( attempt > MAX_ATTEMPTS )); do
  echo "'$STOP_FILE' not present yet (attempt $attempt/$MAX_ATTEMPTS). Requesting continuation..."
  echo "$CONTINUE_MESSAGE" | ca resume -f --print || true
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


