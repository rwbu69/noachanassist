<script>
    import { onMount } from 'svelte';
    import { invoke } from '@tauri-apps/api/core';
    import { getCurrentWindow } from '@tauri-apps/api/window';
    
    // We will bind these props from App.svelte
    export let onToggleTodo;
    export let onOpenMemories;
    export let onOpenLogs;
    export let onOpenSettings;

    let timeString = '';

    function updateClock() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        timeString = `${year}.${month}.${day} ${hours}:${minutes}`;
    }

    onMount(() => {
        updateClock();
        const interval = setInterval(updateClock, 1000);
        return () => clearInterval(interval);
    });

    const minimize = async () => {
        const appWindow = await getCurrentWindow();
        appWindow.minimize();
    };
    
    const closeWindow = async () => {
        const appWindow = await getCurrentWindow();
        appWindow.close();
    };

    const startDrag = async (e) => {
        // Prevent drag on buttons
        if (!e.target.closest('.titlebar-button')) {
            const appWindow = await getCurrentWindow();
            appWindow.startDragging();
        }
    };
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="titlebar" on:mousedown={startDrag}>
    <div class="titlebar-title">Noa-chan OS</div>
    <div class="titlebar-clock">{timeString}</div>
    <div class="titlebar-controls">
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="titlebar-button" title="Clipboard" on:click={onToggleTodo}>[ ✓ ]</div>
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="titlebar-button" title="Memories" on:click={onOpenMemories}>[ M ]</div>
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="titlebar-button" title="Logs" on:click={onOpenLogs}>[ L ]</div>
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="titlebar-button" title="Settings" on:click={onOpenSettings}>[ S ]</div>
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="titlebar-button" title="Minimize" on:click={minimize}>—</div>
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="titlebar-button" title="Close" on:click={closeWindow}>✕</div>
    </div>
</div>
