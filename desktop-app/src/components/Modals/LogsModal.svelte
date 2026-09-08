<script>
    import { terminalLogs } from '../../store.js';
    import { onMount, afterUpdate } from 'svelte';

    export let isOpen = false;
    export let onClose;

    let logContainer;

    onMount(() => {
        if (window.__TAURI__ && window.__TAURI__.event) {
            window.__TAURI__.event.listen('backend-log', (event) => {
                if ($terminalLogs === 'Waiting for backend connection...\n') {
                    terminalLogs.set('');
                }
                const cleanText = event.payload.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r?\n$/, '');
                terminalLogs.update(logs => logs + cleanText + '\n');
            });
        }
    });

    afterUpdate(() => {
        if (logContainer && isOpen) {
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    });
</script>

{#if isOpen}
    <div class="overlay" style="display: flex;">
        <div id="terminal-content">
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div style="text-align:right;">
                <span style="cursor:pointer; color:#fff; margin: 10px;" on:click={onClose}>[X]</span>
            </div>
            <h2>Backend Terminal</h2>
            <div id="terminal-log" bind:this={logContainer}>
                {$terminalLogs}
            </div>
        </div>
    </div>
{/if}
