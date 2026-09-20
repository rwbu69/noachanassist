import { writable } from 'svelte/store';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'; // Left for future reference, currently using Rust bypass
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const messages = writable([]);
export const todos = writable([]);
export const userLevel = writable(1);
export const userExp = writable(0);
export const isConnected = writable(false);
export const coreMemories = writable("");
export const terminalLogs = writable("Waiting for backend connection...\n");
export const isRpsMode = writable(false);

export const isGenerating = writable(false);
export const activeRequestId = writable(null);
export const activeToast = writable(null);

const getBool = (key, defaultVal) => {
    const v = localStorage.getItem(key);
    return v === null ? defaultVal : v === 'true';
};

export const settings = writable({
    apiKey: localStorage.getItem('noa_apiKey') || '',
    userName: localStorage.getItem('noa_userName') || '',
    city: localStorage.getItem('noa_city') || '',
    theme: localStorage.getItem('noa_theme') || 'light',
    storageDir: localStorage.getItem('noa_storageDir') || '',
    autostart: getBool('noa_autostart', false),
    hideTray: getBool('noa_hideTray', false),
    proactiveMode: getBool('noa_proactive', true),
    proactiveInterval: parseInt(localStorage.getItem('noa_proactiveInterval')) || 5,
    notificationSound: getBool('noa_notificationSound', true),
    elevenLabsApiKey: localStorage.getItem('noa_elevenLabsApiKey') || '',
    elevenLabsVoiceId: localStorage.getItem('noa_elevenLabsVoiceId') || '',
    enableVoice: getBool('noa_enableVoice', false)
});

export const ws = writable(null);
let wsInstance = null;
let reconnectTimer = null;
let hasSentSettings = false;
let toastTimeout = null;

export function showToast(msg) {
    activeToast.set(msg);
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        activeToast.set(null);
        toastTimeout = null;
    }, 3000);
}

let backendPort = null;
let backendToken = null;

listen('backend-ready', (event) => {
    backendPort = event.payload.port;
    backendToken = event.payload.token;
});

function getFormattedTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${hours}:${minutes} | ${day}-${month}-${year}`;
}

export function addMessage(role, content) {
    const time = getFormattedTime();
    messages.update(m => {
        if (m.length > 0 && (role === 'user' || role === 'noa') && m[m.length - 1].role === role) {
            const last = m[m.length - 1];
            return [...m.slice(0, -1), { role, texts: [...last.texts, { text: content, time }] }];
        } else {
            return [...m, { role, texts: [{ text: content, time }] }];
        }
    });
}

const WS_HANDLERS = {
    'request_cancelled': (data) => {
        let currentId;
        activeRequestId.subscribe(id => currentId = id)();
        if (data.requestId && currentId !== data.requestId) return;
        isGenerating.set(false);
        activeRequestId.set(null);
    },
    'message': async (data) => {
        const isAssistantMessage = data.role === 'noa' || data.role === 'assistant';
        if (isAssistantMessage && data.requestId) {
            let currentId;
            activeRequestId.subscribe(id => currentId = id)();

            // A cancelled request may finish after the UI has already moved on.
            // Never display its stale response or let it alter a newer request.
            if (currentId !== data.requestId) return;

            isGenerating.set(false);
            activeRequestId.set(null);
        }

        addMessage(data.role, data.content);
        if (isAssistantMessage) {
            triggerNotification("Noa sent you a message");
            if (data.audio) {
                const audio = new Audio(`http://127.0.0.1:${backendPort}/${data.audio}?token=${backendToken}`);
                audio.play().catch(e => console.error("Audio play failed:", e));
            }
        }
    },
    'approval_request': async (data) => {
        const argsStr = JSON.stringify(data.args, null, 2);
        const approved = await ask(`SECURITY ALERT: Noa-chan is requesting permission to execute a dangerous tool.\n\nTool: ${data.tool}\n\nArguments:\n${argsStr}\n\nDo you want to allow this action?`, { title: 'Action Required', kind: 'warning' });
        
        wsInstance.send(JSON.stringify({
            type: 'approval_response',
            id: data.id,
            approved: approved
        }));
    },
    'login_greeting': async (data) => {
        addMessage('noa', data.text);
        triggerNotification(data.text);
        if (data.audio) {
            const audio = new Audio(`http://127.0.0.1:${backendPort}/${data.audio}?token=${backendToken}`);
            audio.play().catch(e => console.error("Audio play failed:", e));
        }
    },
    'system': async (data) => {
        addMessage('system', data.message);
    },
    'toast': (data) => {
        showToast(data.message || data.content);
    },
    'clear': () => messages.set([]),
    'core_memory_data': (data) => coreMemories.set(data.content),
    'sync_todos': (data) => {
        todos.set(data.todos);
        if (data.level !== undefined) userLevel.set(data.level);
        if (data.exp !== undefined) userExp.set(data.exp);
        settings.update(s => ({
            ...s, 
            ...(data.proxies !== undefined && { proxies: data.proxies })
        }));
    },
    'start_rps': () => isRpsMode.set(true),
    'rps_reveal': (data) => {
        const getEmoji = (c) => c === 'rock' ? '🪨' : c === 'paper' ? '📄' : '✂️';
        const resultText = `[ RPS MATCH ]\nSensei: ${getEmoji(data.user)} ${data.user}\nNoa: ${getEmoji(data.noa)} ${data.noa}\nResult: ${data.winner === 'draw' ? 'Draw!' : data.winner === 'noa' ? 'Noa Wins!' : 'Sensei Wins!'}`;
        addMessage('system', resultText);
    }
};

export async function triggerNotification(text, forceNotification = false) {
    let settingsVal;
    settings.subscribe(s => settingsVal = s)();
    if (settingsVal.notificationSound || forceNotification) {
        const audio = new Audio(`http://127.0.0.1:${backendPort}/audio/noa_notification.mp3?token=${backendToken}`);
        audio.play().catch(e => console.error("Notification audio play failed:", e));
    }

    try {
        const appWindow = getCurrentWindow();
        const focused = await appWindow.isFocused();
        
        if (!focused || forceNotification) {
            if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
                wsInstance.send(JSON.stringify({ type: 'trigger_notification', title: 'Noa-chan', message: text }));
            } else {
                await invoke('send_rust_notification', { title: 'Noa-chan', body: text });
            }
        }
    } catch (e) {
        console.error("Failed to send notification via Rust:", e);
    }
}

export async function connectWebSocket() {
    if (wsInstance && (wsInstance.readyState === WebSocket.OPEN || wsInstance.readyState === WebSocket.CONNECTING)) {
        return;
    }
    
    if (!backendPort || !backendToken) {
        try {
            const info = await invoke('get_backend_info');
            if (info && info.port) {
                backendPort = info.port;
                backendToken = info.token;
            }
        } catch (err) {
            console.error("Failed to fetch backend info:", err);
        }
    }

    if (!backendPort || !backendToken) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectWebSocket, 1000);
        return;
    }
    
    wsInstance = new WebSocket(`ws://127.0.0.1:${backendPort}/ws?token=${backendToken}`);
    
    wsInstance.onopen = () => {
        isConnected.set(true);
        ws.set(wsInstance);
        
        showToast('Connected to Noa-chan Backend Server.');
        
        settings.subscribe(s => {
            if (wsInstance && wsInstance.readyState === WebSocket.OPEN && !hasSentSettings) {
                wsInstance.send(JSON.stringify({ type: 'init', ...s }));
                hasSentSettings = true;
            }
        })();
    };
    
    wsInstance.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            const handler = WS_HANDLERS[data.type];
            if (handler) handler(data);
            else console.warn(`[ System ] Unknown message type: ${data.type}`);
        } catch (e) {
            console.error("WebSocket message error:", e);
        }
    };
    
    wsInstance.onclose = () => {
        isConnected.set(false);
        ws.set(null);
        hasSentSettings = false;
        
        activeToast.set('Waiting for backend connection...');
        
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectWebSocket, 1000);
    };
}
