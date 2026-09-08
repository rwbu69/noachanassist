<script>
    import { onMount, onDestroy } from 'svelte';
    import { isConnected, connectWebSocket, settings, triggerNotification } from './store.js';
    import { getCurrentWindow } from '@tauri-apps/api/window';
    import Titlebar from './components/Titlebar.svelte';
    import Chat from './components/Chat/Chat.svelte';
    import TodoDrawer from './components/Drawers/TodoDrawer.svelte';
    import SettingsModal from './components/Modals/SettingsModal.svelte';
    import MemoriesModal from './components/Modals/MemoriesModal.svelte';
    import LogsModal from './components/Modals/LogsModal.svelte';

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
{/if}

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
