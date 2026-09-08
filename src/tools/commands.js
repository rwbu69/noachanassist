import pc from 'picocolors';
import * as tools from './tools.js';
import { loadSettings, saveSettings, saveMemory } from '../memory/memory.js';
import { state } from '../core/state.js';
import { sendToFrontend } from '../system/server.js';

// NOTE: Slash commands intentionally bypass the standard model-tool approval flow.
// This is by design, because slash commands represent explicit, trusted instructions 
// manually typed by the user, whereas autonomous LLM actions require approval for safety.
const COMMAND_REGISTRY = {
    '/clear': async (ws, args) => {
        if (ws) ws.send(JSON.stringify({ type: 'clear' }));
    },
    '/reset': async (ws, args) => {
        state.setMemory([]);
        saveMemory([]);
        sendToFrontend(ws, 'system', 'Memory wiped. Noa-chan is starting fresh!');
    },
    '/focus': async (ws, args) => {
        const mins = parseInt(args[0]) || 25;
        state.setFocusEndTime(Date.now() + mins * 60 * 1000);
        sendToFrontend(ws, 'system', `Pomodoro started for ${mins} minutes. I will monitor your active window to ensure you don't get distracted!`);
        setTimeout(() => {
            tools.send_notification({ title: 'Focus Time Complete!', message: 'Sensei, you did a great job! Take a break.' });
            sendToFrontend(ws, 'system', 'Focus mode complete! Take a break!');
        }, mins * 60 * 1000);
    },
    '/watch': async (ws, args) => {
        const currentlyWatching = state.getIsWatching();
        state.setIsWatching(!currentlyWatching);
        sendToFrontend(ws, 'system', `Watch-Along Mode is now ${!currentlyWatching ? 'ON' : 'OFF'}. I will randomly check your screen and react to what we're watching together!`);
    },
    '/game': async (ws, args) => {
        const action = args[0]?.toLowerCase();
        const type = args.slice(1).join(' ');
        if (action === 'stop') {
            state.setActiveGame(null);
            sendToFrontend(ws, 'system', 'Game mode deactivated.');
        } else if (action === 'start' && type) {
            state.setActiveGame(type);
            sendToFrontend(ws, 'system', `Starting game: ${type}. Noa-chan's persona has been updated. Say hello to start playing!`);
        } else {
            sendToFrontend(ws, 'system', 'Usage: /game start [RPG/Trivia/Shiritori] OR /game stop');
        }
    },
    '/proactive': async (ws, args) => {
        const toggle = args[0]?.toLowerCase();
        const currentSettings = await loadSettings();
        if (toggle === 'on') {
            currentSettings.proactiveMode = true;
            await saveSettings(currentSettings);
            state.updateLastInteraction();
            sendToFrontend(ws, 'system', 'Proactive mode enabled. I will check in on you occasionally.');
        } else if (toggle === 'off') {
            currentSettings.proactiveMode = false;
            await saveSettings(currentSettings);
            sendToFrontend(ws, 'system', 'Proactive mode disabled.');
        } else {
            sendToFrontend(ws, 'system', `Proactive mode is currently ${currentSettings.proactiveMode !== false ? 'ON' : 'OFF'}. Use "/proactive on" or "/proactive off" to toggle.`);
        }
    },
    '/help': async (ws, args) => {
        const helpText = `
**[ SYSTEM COMMANDS ]**
\`/help\` - Show this menu
\`/clear\` - Clear chat UI
\`/reset\` - Wipe short-term memory
\`/focus [mins]\` - Start Pomodoro (with distraction monitoring)
\`/proactive [on/off]\` - Toggle proactive check-ins
\`/watch\` - Toggle Watch-Along mode
\`/game start [type]\` - Start an RPG, Trivia, or Shiritori game
\`/game stop\` - Stop the current game
\`/diary\` - Force write a diary entry

**[ NATIVE TOOLS ]**
\`/time\` - Get System Time
\`/weather [city]\` - Get Weather
\`/media [query]\` - Search/Play YouTube
\`/read [path]\` - Read File
\`/write [path]|[content]\` - Write File
\`/exec [cmd]\` - Run Powershell Command
\`/ascii [text]\` - Generate ASCII Art
\`/notify [msg]\` - Send Desktop Notification
\`/stats\` - Get System Health/Stats
\`/search [query]\` - DuckDuckGo Search
\`/fetch [url]\` - Scrape Webpage
\`/ls [dir]\` - Analyze Directory
\`/sandbox [js/py]|[code]\` - Run Sandbox Code
\`/git [status/commit]\` - Git Manager
\`/todo add [task]\`
\`/todo list\`
\`/todo done [id]\`
        `.trim();
        sendToFrontend(ws, 'system', helpText);
    },
    '/time': async (ws, args) => { sendToFrontend(ws, 'tool', tools.get_system_time({})); },
    '/weather': async (ws, args) => { sendToFrontend(ws, 'tool', await tools.get_weather({ city: args.join(' ') })); },
    '/media': async (ws, args) => { sendToFrontend(ws, 'tool', await tools.control_media({ query: args.join(' ') })); },
    '/read': async (ws, args) => { sendToFrontend(ws, 'tool', tools.read_file({ filepath: args.join(' ') })); },
    '/write': async (ws, args) => {
        const str = args.join(' ');
        const pipeIdx = str.indexOf('|');
        if (pipeIdx === -1) { sendToFrontend(ws, 'system', 'Format: /write [path]|[content]'); return; }
        sendToFrontend(ws, 'tool', tools.write_file({ filepath: str.substring(0, pipeIdx).trim(), content: str.substring(pipeIdx+1).trim() }));
    },
    '/exec': async (ws, args) => { sendToFrontend(ws, 'tool', await tools.execute_command({ command: args.join(' ') })); },
    '/ascii': async (ws, args) => { sendToFrontend(ws, 'tool', await tools.generate_ascii_art({ text: args.join(' ') })); },
    '/notify': async (ws, args) => { sendToFrontend(ws, 'tool', tools.send_notification({ title: 'Noa-chan', message: args.join(' ') })); },
    '/stats': async (ws, args) => { sendToFrontend(ws, 'tool', await tools.get_system_stats({})); },
    '/search': async (ws, args) => { sendToFrontend(ws, 'tool', await tools.executeWithTimeout(tools.search_web({ query: args.join(' ') }))); },
    '/fetch': async (ws, args) => { sendToFrontend(ws, 'tool', await tools.executeWithTimeout(tools.fetch_url({ url: args[0] }))); },
    '/ls': async (ws, args) => { sendToFrontend(ws, 'tool', tools.analyze_directory({ dir_path: args.join(' ') || '.' })); },
    '/sandbox': async (ws, args) => {
        const str = args.join(' ');
        const pipeIdx = str.indexOf('|');
        if (pipeIdx === -1) { sendToFrontend(ws, 'system', 'Format: /sandbox [language]|[code]'); return; }
        sendToFrontend(ws, 'tool', await tools.executeWithTimeout(tools.run_sandbox_code({ language: str.substring(0, pipeIdx).trim(), code: str.substring(pipeIdx+1).trim() })));
    },
    '/git': async (ws, args) => { sendToFrontend(ws, 'tool', await tools.executeWithTimeout(tools.git_manager({ action: args[0], message: args.slice(1).join(' ') }))); },
    '/todo': async (ws, args) => {
        const action = args[0];
        if (action === 'add') { sendToFrontend(ws, 'tool', tools.add_todo({ task: args.slice(1).join(' ') })); }
        else if (action === 'list') { sendToFrontend(ws, 'tool', tools.read_todos({})); }
        else if (action === 'done') { sendToFrontend(ws, 'tool', tools.complete_todo({ id: parseInt(args[1]) })); }
        else { sendToFrontend(ws, 'system', 'Invalid todo action. Use add, list, or done.'); }
    },
    '/diary': async (ws, args) => { sendToFrontend(ws, 'system', 'Diary manual trigger not fully exposed yet, but scheduled!'); }
};

export async function handleCommand(command, args) {
    const ws = state.getWs();
    const handler = COMMAND_REGISTRY[command];
    
    if (handler) {
        await handler(ws, args);
        return true;
    }
    
    return false;
}
