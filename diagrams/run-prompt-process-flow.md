# Run Prompt Process Flow

This diagram illustrates how Script Kit's run prompt process works, from event emission through script execution.

```mermaid
flowchart TD
    Start([Event Triggers RunPromptProcess]) --> EmitEvent[emitter.emit KitEvent.RunPromptProcess]
    
    EmitEvent --> Listener[kit.ts Event Listener]
    
    Listener --> RunPrompt[runPromptProcess Function]
    
    RunPrompt --> CheckReady{Kit Ready?}
    CheckReady -->|No| ReturnNull[Return null]
    CheckReady -->|Yes| CheckSponsor
    
    CheckSponsor{Check Sponsor<br/>if > 3 prompts}
    CheckSponsor -->|Not Sponsor| Block[Block & Return null]
    CheckSponsor -->|OK| CheckMain
    
    CheckMain{Is Main Script?}
    CheckMain --> FindIdle[processes.findIdlePromptProcess]
    
    FindIdle --> GetPrompt[Get Idle Prompt & Process]
    
    GetPrompt --> ConfigurePrompt{Configure by Trigger Type}
    
    ConfigurePrompt -->|Main| MainFlow[prompt.initMainBounds<br/>prompt.initShowPrompt]
    ConfigurePrompt -->|Snippet| SnippetFlow[prompt.initBounds<br/>Wait for script]
    ConfigurePrompt -->|Other| MouseFlow[prompt.attemptPreload<br/>prompt.moveToMouseScreen]
    
    MainFlow --> FindScript
    SnippetFlow --> FindScript
    MouseFlow --> FindScript
    
    FindScript[Find Script in DB/Cache]
    FindScript --> CheckScript{Script Found?}
    CheckScript -->|No| ErrorReturn[Log Error & Return null]
    CheckScript -->|Yes| SetScript
    
    SetScript[prompt.setScript]
    SetScript --> SendMessage[child.send START_SCRIPT]
    
    SendMessage --> ChildProcess[Child Process Executes Script]
    
    ChildProcess --> MessageHandler[Message Handler Routes]
    
    MessageHandler --> ChannelHandlers{Channel-based<br/>Message Handling}
    
    ChannelHandlers -->|SET_PROMPT_DATA| UpdateUI[Update Prompt UI]
    ChannelHandlers -->|RESPONSE| SendResponse[Send Response Back]
    ChannelHandlers -->|Other Channels| ProcessChannel[Process Channel Message]
    
    UpdateUI --> Continue[Continue Script Execution]
    SendResponse --> End([Process Complete])
    ProcessChannel --> Continue
    
    style Start fill:#e1f5e1
    style End fill:#ffe1e1
    style RunPrompt fill:#fff2cc
    style ChildProcess fill:#cce5ff
    style MessageHandler fill:#f3e5ff
```

## Key Components Explained

### 1. Event Emission
- Various parts of the app emit `KitEvent.RunPromptProcess` (error handlers, shortcuts, tray menu, watchers, etc.)
- The event includes scriptPath, args, and options (force, trigger type, cwd)

### 2. Main Process Flow (kit.ts)
- Checks if Kit is ready
- Verifies sponsor status if too many prompts open
- Finds an idle prompt process from the pool
- Configures prompt based on trigger type (Main, Snippet, or Other)

### 3. Prompt Configuration
- **Main Script**: Initializes main bounds and shows immediately
- **Snippet**: Only initializes bounds, waits for script to show UI
- **Other**: Preloads and moves to mouse screen position

### 4. Script Execution
- Finds script in database or cache
- Sets script on prompt object
- Sends START_SCRIPT message to child process
- Child process (Node.js fork) executes the actual script

### 5. Message Handling
- Child process communicates via IPC channels
- Messages update UI, handle responses, or trigger other actions
- Complex routing through message handlers in messages.ts

### 6. Process Pool Management
- Maintains pool of idle processes for quick script startup
- Reuses processes when possible
- Creates new processes when pool exhausted

## Trigger Types

The system handles different trigger types:
- **Trigger.App**: Default app trigger
- **Trigger.Main**: Main menu script
- **Trigger.Snippet**: Text snippets
- **Trigger.Shortcut**: Keyboard shortcuts
- **Trigger.Menu**: Tray menu items
- **Trigger.Schedule**: Scheduled scripts
- **Trigger.Background**: Background processes
- **Trigger.Info**: Information dialogs
- **Trigger.Kar**: Command line execution

## File References

- Event emission: Various files emit the event
  - `app/src/main/error.ts:51`
  - `app/src/main/tick.ts:497,504`
  - `app/src/main/tray.ts:655-664,900`
  - `app/src/main/watcher.ts:203,618`
- Event listener: `app/src/main/kit.ts:76-133`
- Main function: `app/src/main/kit.ts:183-380`
- Process management: `app/src/main/process.ts`
- Message handling: `app/src/main/messages.ts`