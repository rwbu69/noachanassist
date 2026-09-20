<script>
    import { onMount, onDestroy } from 'svelte';
    import { isConnected, connectWebSocket, settings, triggerNotification, activeToast } from './store.js';
    import { getCurrentWindow } from '@tauri-apps/api/window';
    import Titlebar from './components/Titlebar.svelte';
    import Chat from './components/Chat/Chat.svelte';
    import TodoDrawer from './components/Drawers/TodoDrawer.svelte';
    import SettingsModal from './components/Modals/SettingsModal.svelte';
    import MemoriesModal from './components/Modals/MemoriesModal.svelte';
    import LogsModal from './components/Modals/LogsModal.svelte';
    import SetupScreen from './components/SetupScreen.svelte';

    let showSplash = true;
    let fadeOutSplash = false;

    let isTodoOpen = false;
    let isMemoriesOpen = false;
    let isLogsOpen = false;
    let isSettingsOpen = false;

    let unlistenClose = null;

    onMount(async () => {
        if ($settings.theme === 'dark') {
            document.body.classList.add('dark-theme');
        }

        const appWindow = getCurrentWindow();
        unlistenClose = await appWindow.onCloseRequested(async (event) => {
            let currentSettings;
            settings.subscribe(s => currentSettings = s)();
            if (currentSettings.hideTray) {
                event.preventDefault();
                await triggerNotification("I'll be waiting in the background, Sensei!", true);
                appWindow.hide();
            }
        });
    });

    onDestroy(() => {
        if (unlistenClose) unlistenClose();
    });

    $: if ($isConnected) {
        fadeOutSplash = true;
        setTimeout(() => { showSplash = false; }, 500);
    }

    function handleSplashClick() {
        if (!$isConnected) {
            connectWebSocket();
        }
    }
</script>

<svelte:head>
    <title>Noa-chan</title>
    <!-- Highlight.js CSS is loaded via standard link in index.html, but we can also do it here or let Vite bundle it if imported -->
</svelte:head>

{#if showSplash}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div id="splash-screen" 
         style="cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 9999; transition: opacity 0.5s ease; opacity: {fadeOutSplash ? 0 : 1};"
         on:click={handleSplashClick}>
        <img src="/assets/noa.png" alt="Noa Icon" class="splash-icon">
        <div class="splash-title">NOA-CHAN OS</div>
        <div style="margin-top: 20px; font-size: 14px; color: var(--dim-color); animation: pulse 2s infinite;">Click anywhere to initialize</div>
    </div>
{:else if !$settings.apiKey}
    <SetupScreen on:complete={() => { /* Handled reactively by store change */ }} />
{:else}
    <Titlebar 
        onToggleTodo={() => isTodoOpen = !isTodoOpen}
        onOpenMemories={() => isMemoriesOpen = true}
        onOpenLogs={() => isLogsOpen = true}
        onOpenSettings={() => isSettingsOpen = true}
    />

    <Chat />

    <TodoDrawer isOpen={isTodoOpen} onClose={() => isTodoOpen = false} />
    <SettingsModal isOpen={isSettingsOpen} onClose={() => isSettingsOpen = false} />
    <MemoriesModal isOpen={isMemoriesOpen} onClose={() => isMemoriesOpen = false} />
    <LogsModal isOpen={isLogsOpen} onClose={() => isLogsOpen = false} />
{/if}

{#if $activeToast}
    <div class="toast-notification">
        {$activeToast}
    </div>
{/if}

<style>
    .toast-notification {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        z-index: 10000;
        font-size: 13px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: fadein 0.3s ease;
    }

    @keyframes fadein {
        from { opacity: 0; transform: translate(-50%, 10px); }
        to { opacity: 1; transform: translate(-50%, 0); }
    }
</style>
