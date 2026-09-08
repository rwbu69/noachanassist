import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import cron from 'node-cron';
import pc from 'picocolors';
import open from 'open';
import figlet from 'figlet';
import notifier from 'node-notifier';
import si from 'systeminformation';
import * as cheerio from 'cheerio';
import { search } from 'duck-duck-scrape';
import { hexColor, NOA_BLUE, clearThinking, printThinking } from '../system/ui.js';
import { EventEmitter } from 'events';
import { getDataDir } from '../system/config.js';
import { loadSettings, saveSettings } from '../memory/memory.js';

export const toolEvents = new EventEmitter();

export const TOOL_CONFIG = {
    execute_command: { timeout: 300000 },
    run_sandbox_code: { timeout: 300000 }
};

const execAsync = promisify(exec);

const timeoutPromise = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('TOOL_TIMEOUT')), ms));
export async function executeWithTimeout(promise, ms = 60000) {
  try {
    return await Promise.race([promise, timeoutPromise(ms)]);
  } catch (err) {
    if (err.message === 'TOOL_TIMEOUT') return `Tool execution aborted: It took longer than ${ms/1000} seconds and was killed to prevent freezing.`;
    throw err;
  }
}

export function get_system_time() {
  return new Date().toLocaleString();
}

export async function get_weather({ city }) {
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=3`);
    if (res.ok) return await res.text();
    return `Could not fetch weather for ${city}`;
  } catch (error) {
    return `Error fetching weather: ${error.message}`;
  }
}

export async function control_media({ query }) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    await open(url);
    return `Successfully opened YouTube search for: ${query}`;
  } catch (error) {
    return `Failed to open media: ${error.message}`;
  }
}

export function read_file({ filepath }) {
  try { return fs.readFileSync(filepath, 'utf8'); } catch (error) { return `Failed to read file: ${error.message}`; }
}

export function write_file({ filepath, content }) {
  try {
    fs.writeFileSync(filepath, content, 'utf8');
    return `Successfully wrote to ${filepath}`;
  } catch (error) {
    return `Failed to write file: ${error.message}`;
  }
}

export async function execute_command({ command, cwd }) {
  if (command.toLowerCase().includes('c:\\') || (cwd && cwd.toLowerCase().includes('c:\\'))) {
    return "Error: Sensei has strictly forbidden access to the C:\\ drive. Access Denied.";
  }
  clearThinking();
  console.log(pc.cyanBright(`\n[ Tool ] Noa-chan is running a command: `) + pc.whiteBright(command));
  if (cwd) console.log(pc.dim(pc.gray(`In directory: ${cwd}`)));

  console.log(pc.dim(pc.gray('Executing autonomously...')));

  try {
    const options = cwd ? { cwd } : {};
    const { stdout, stderr } = await execAsync(command, options);
    let output = stdout;
    if (stderr) output += `\nErrors:\n${stderr}`;
    const finalOutput = output.trim() || "Command executed successfully with no output.";
    
    console.log(hexColor(NOA_BLUE, '\n[Command Output]'));
    console.log(pc.white(finalOutput));
    console.log(hexColor(NOA_BLUE, '────────────────\n'));
    
    printThinking();
    return finalOutput;
  } catch (error) {
    console.log(pc.redBright('\n[Command Error]'));
    console.log(pc.white(error.message));
    console.log(hexColor(NOA_BLUE, '───────────────\n'));
    printThinking();
    return `Failed to run command: ${error.message}`;
  }
}

export async function generate_ascii_art({ text, font }) {
  return new Promise((resolve) => {
    figlet.text(text, { font: font || 'Standard' }, (err, data) => {
      if (err) return resolve(`Failed to generate ASCII art: ${err.message}`);
      clearThinking();
      console.log(hexColor(NOA_BLUE, '\n[ASCII Art Generated]'));
      console.log(pc.cyanBright(data));
      console.log();
      printThinking();
      resolve(`ASCII art generated successfully and drawn on Sensei's terminal.\n\n${data}`);
    });
  });
}

export function send_notification({ title, message }) {
  notifier.notify({ 
    title: title || 'Seminar Secretary Noa', 
    message: message, 
    sound: true,
    icon: path.join(process.cwd(), 'icon', 'noa.png'),
    appID: 'Noa-chan'
  });
  return `Notification successfully sent to Sensei's desktop: [${title}] ${message}`;
}

export async function get_system_stats() {
  try {
    const cpu = await si.cpu();
    const mem = await si.mem();
    const os = await si.osInfo();
    return `CPU: ${cpu.manufacturer} ${cpu.brand} (${Math.round(cpu.speed)} GHz)
RAM: ${Math.round(mem.active / 1024 / 1024 / 1024)}GB / ${Math.round(mem.total / 1024 / 1024 / 1024)}GB In Use
OS: ${os.distro} ${os.release}`;
  } catch (error) {
    return `Failed to fetch system stats: ${error.message}`;
  }
}

// --- PHASE 3 TOOLS ---

export async function search_web({ query }) {
  try {
    const results = await search(query);
    if (!results.results || results.results.length === 0) return "No results found.";
    return results.results.slice(0, 5).map((r, i) => `${i+1}. ${r.title} - ${r.url}\n${r.description}`).join('\n\n');
  } catch (error) {
    return `Search failed: ${error.message}`;
  }
}

export async function fetch_url({ url }) {
  try {
    const res = await fetch(url);
    if (!res.ok) return `HTTP Error: ${res.status}`;
    const html = await res.text();
    const $ = cheerio.load(html);
    $('script, style, nav, footer, iframe, img').remove();
    let text = $('body').text().replace(/\s+/g, ' ').trim();
    if (text.length > 3000) text = text.substring(0, 3000) + '... [CONTENT TRUNCATED TO SAVE MEMORY]';
    return text || "No readable content found.";
  } catch (error) {
    return `Fetch failed: ${error.message}`;
  }
}

export function analyze_directory({ dir_path }) {
  try {
    const targetPath = dir_path || process.cwd();
    if (targetPath.toLowerCase().startsWith('c:\\')) return "Error: Sensei has strictly forbidden access to the C:\\ drive. Access Denied.";
    if (!fs.existsSync(targetPath)) return `Path does not exist: ${targetPath}`;
    
    let result = `Contents of ${targetPath}:\n`;
    const files = fs.readdirSync(targetPath);
    let count = 0;
    for (const file of files) {
      if (file === 'node_modules' || file === '.git' || file === '.env') continue;
      const stat = fs.statSync(path.join(targetPath, file));
      result += `- ${file}${stat.isDirectory() ? '/' : ''}\n`;
      count++;
      if (count > 50) {
        result += "...[TRUNCATED FOR SAFETY]";
        break;
      }
    }
    return result;
  } catch (e) {
    return `Failed to read dir: ${e.message}`;
  }
}

export async function run_sandbox_code({ language, code }) {
  try {
    const sandboxDir = path.join(process.cwd(), 'sandbox');
    if (!fs.existsSync(sandboxDir)) fs.mkdirSync(sandboxDir);
    
    if (language === 'javascript') {
      const filepath = path.join(sandboxDir, 'temp.js');
      fs.writeFileSync(filepath, code, 'utf8');
      const { stdout, stderr } = await execAsync(`node temp.js`, { cwd: sandboxDir });
      return (stdout + (stderr ? `\nErrors:\n${stderr}` : '')).trim() || "Executed successfully with no output.";
    } else if (language === 'python') {
      const filepath = path.join(sandboxDir, 'temp.py');
      fs.writeFileSync(filepath, code, 'utf8');
      const { stdout, stderr } = await execAsync(`python temp.py`, { cwd: sandboxDir });
      return (stdout + (stderr ? `\nErrors:\n${stderr}` : '')).trim() || "Executed successfully with no output.";
    }
    return `Unsupported language: ${language}`;
  } catch (e) {
    return `Sandbox Execution Error: ${e.message}`;
  }
}

export async function git_manager({ action, message }) {
  try {
    if (action === 'status') {
      const { stdout } = await execAsync('git status');
      return stdout;
    } else if (action === 'commit') {
      if (!message) return "Error: Commit message required.";
      await execAsync('git add .');
      const { stdout } = await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`);
      return stdout;
    }
    return "Unknown action.";
  } catch (e) {
    return `Git Error: ${e.message}`;
  }
}

const TODOS_FILE = path.join(getDataDir(), 'todos.json');
function loadTodos() {
  if (fs.existsSync(TODOS_FILE)) return JSON.parse(fs.readFileSync(TODOS_FILE, 'utf8'));
  return [];
}
function saveTodos(todos) {
  fs.writeFileSync(TODOS_FILE, JSON.stringify(todos, null, 2), 'utf8');
}

export function get_all_todos_raw() {
  return loadTodos();
}

export function add_todo({ task, due_time }) {
  const todos = loadTodos();
  const newTodo = { 
    id: Date.now(), 
    task, 
    completed: false, 
    due_time: due_time || null, 
    reminders_sent: [] 
  };
  todos.push(newTodo);
  saveTodos(todos);
  toolEvents.emit('sync_todos');
  return `Added task: "${task}". Todo ID is ${newTodo.id}.`;
}

export function read_todos() {
  const todos = loadTodos();
  if (todos.length === 0) return "Todo list is empty.";
  return todos.map((t, i) => `${i+1}. [${t.completed ? 'x' : ' '}] ${t.task} (ID: ${t.id})`).join('\n');
}

export async function complete_todo({ id }) {
  const todos = loadTodos();
  const todo = todos.find(t => t.id === id);
  if (!todo) return `Todo with ID ${id} not found.`;
  todo.completed = true;
  saveTodos(todos);
  
  const settings = await loadSettings();
  settings.exp += 50;
  const levelUpThreshold = settings.level * 100;
  
  let eventText = `[SYSTEM EVENT: Sensei gained 50 EXP!]`;
  if (settings.exp >= levelUpThreshold) {
      settings.level += 1;
      settings.exp = 0;
      eventText = `[SYSTEM EVENT: Sensei gained 50 EXP and LEVELED UP to Level ${settings.level}! Congratulate them enthusiastically on their hard work!]`;
  }
  await saveSettings(settings);
  toolEvents.emit('sync_todos');
  
  return `Marked task as completed: "${todo.task}". ${eventText}`;
}

export function save_core_memory({ fact }) {
  try {
    const noaDir = getDataDir();
    const LONG_TERM_MEMORY_FILE = path.join(noaDir, 'long_term_memory.txt');
    if (!fs.existsSync(noaDir)) {
      fs.mkdirSync(noaDir, { recursive: true });
    }
    fs.appendFileSync(LONG_TERM_MEMORY_FILE, `\n${fact}`, 'utf8');
    return `Successfully saved to core memory: "${fact}"`;
  } catch (error) {
    return `Failed to save core memory: ${error.message}`;
  }
}

export function set_timer({ duration_minutes, message }) {
  setTimeout(() => {
    toolEvents.emit('timer_finished', message);
  }, duration_minutes * 60 * 1000);
  return `Timer set for ${duration_minutes} minutes. I will alert you when it finishes.`;
}

export async function get_active_window() {
  try {
    const { stdout } = await execAsync(`powershell -command "(Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Sort-Object id -Descending | Select-Object -First 1).MainWindowTitle"`);
    return stdout.trim() || "Desktop";
  } catch (e) {
    return "Could not determine active window.";
  }
}

export async function capture_screen() {
  try {
    const noaDir = getDataDir();
    const screenshotPath = path.join(noaDir, 'screenshot.jpg');
    
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.width, $bounds.height
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.size)
$bmp.Save("${screenshotPath.replace(/\\/g, '\\\\')}", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$graphics.Dispose()
$bmp.Dispose()
`;
    const psPath = path.join(noaDir, 'capture.ps1');
    fs.writeFileSync(psPath, psScript, 'utf8');
    
    await execAsync(`powershell -ExecutionPolicy Bypass -File "${psPath}"`);
    
    const base64Data = fs.readFileSync(screenshotPath, 'base64');
    
    return JSON.stringify({
        __is_image: true,
        base64: `data:image/jpeg;base64,${base64Data}`
    });
  } catch (err) {
    return `Failed to capture screen: ${err.message}`;
  }
}

// Cron Job for automated To-Do reminders
cron.schedule('* * * * *', () => {
  try {
    const todos = loadTodos();
    let modified = false;
    const now = Date.now();

    todos.forEach(todo => {
      if (!todo.completed && todo.due_time) {
        const due = new Date(todo.due_time).getTime();
        const timeLeft = due - now;

        if (timeLeft > 0 && timeLeft <= 60 * 60 * 1000) {
          // Check intervals: 60m, 45m, 30m, 15m
          const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
          let threshold = null;
          const rounded = Math.ceil(minutesLeft / 15) * 15;
          if (rounded > 0 && rounded <= 60) threshold = rounded;

          if (threshold !== null && (!todo.reminders_sent || !todo.reminders_sent.includes(threshold))) {
            if (!todo.reminders_sent) todo.reminders_sent = [];
            todo.reminders_sent.push(threshold);
            modified = true;
            
            const prompt = `*[SYSTEM EVENT] Sensei's task '${todo.task}' is due in ${threshold} minutes! Please warmly remind them immediately using your send_notification tool!*`;
            toolEvents.emit('trigger_ai', prompt);
          }
        }
      }
    });

    if (modified) saveTodos(todos);
  } catch (e) {
    console.error("Error in reminder cron:", e);
  }
});

export function start_rps_game() {
  toolEvents.emit('start_rps');
  return "Game initiated! The UI has been updated to wait for Sensei's choice. Do not reply yet until Sensei makes a choice.";
}

// End of file
