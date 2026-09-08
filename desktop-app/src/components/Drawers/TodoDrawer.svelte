<script>
    import { fly } from 'svelte/transition';
    import { todos, userLevel, userExp } from '../../store.js';

    export let isOpen = false;
    export let onClose;

    $: nextLevelExp = $userLevel * 100;
    $: expPercentage = ($userExp / nextLevelExp) * 100;

    function formatTime(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
</script>

{#if isOpen}
    <div class="drawer open" transition:fly={{ x: 350, duration: 300, opacity: 1 }}>
        <div class="drawer-header" style="flex-direction: column; align-items: flex-start; gap: 10px;">
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                <h2>[ SENSEI'S CLIPBOARD ]</h2>
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="titlebar-button" style="font-size: 20px; color: var(--text-color); cursor: pointer; border: none;" on:click={onClose}>✕</div>
            </div>
            
            <div style="width: 100%; font-size: 13px; color: var(--dim-color); display: flex; align-items: center; justify-content: space-between;">
                <span>Level <span style="color: var(--system-color); font-weight: bold;">{$userLevel}</span></span>
                <span>{$userExp} / {nextLevelExp} EXP</span>
            </div>
            <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                <div style="height: 100%; width: {expPercentage}%; background: var(--system-color); transition: width 0.3s ease;"></div>
            </div>
        </div>
        
        <div style="padding: 20px; font-size: 14px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto;">
            {#if $todos.length === 0}
                <div style="color: var(--dim-color); text-align: center;">Clipboard is empty.</div>
            {:else}
                {#each $todos as todo}
                    <div class="todo-item">
                        <div class="todo-status {todo.completed ? 'completed' : ''}">
                            {todo.completed ? '●' : '○'}
                        </div>
                        <div class="todo-text {todo.completed ? 'completed' : ''}">
                            {todo.task}
                            {#if todo.due_time && !todo.completed}
                                <div class="todo-due">Due: {formatTime(todo.due_time)}</div>
                            {/if}
                        </div>
                    </div>
                {/each}
            {/if}
        </div>
    </div>
{/if}
