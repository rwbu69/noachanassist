import fs from 'fs';
import path from 'path';
import os from 'os';

const POINTER_FILE = path.join(os.homedir(), '.noa-chan', 'config.json');

export function getDataDir() {
    const defaultDir = path.join(os.homedir(), '.noa-chan');
    try {
        if (fs.existsSync(POINTER_FILE)) {
            const config = JSON.parse(fs.readFileSync(POINTER_FILE, 'utf8'));
            if (config.dataDir) {
                return config.dataDir;
            }
        }
    } catch (e) {
        console.error("Failed to read config pointer:", e.message);
    }
    return defaultDir;
}

export function setDataDir(newDataDir) {
    const pointerDir = path.join(os.homedir(), '.noa-chan');
    if (!fs.existsSync(pointerDir)) {
        fs.mkdirSync(pointerDir, { recursive: true });
    }
    const config = { dataDir: newDataDir };
    fs.writeFileSync(POINTER_FILE, JSON.stringify(config, null, 2), 'utf8');
}

let cachedAudioDir = null;

export function getAudioDir() {
    if (cachedAudioDir) return cachedAudioDir;
    
    if (process.env.NOA_RESOURCE_DIR) {
        const possiblePaths = [
            path.join(process.env.NOA_RESOURCE_DIR, 'assets', 'audio'),
            path.join(process.env.NOA_RESOURCE_DIR, '_up_', '_up_', 'assets', 'audio'),
            path.join(process.env.NOA_RESOURCE_DIR, '..', '..', 'assets', 'audio')
        ];
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                cachedAudioDir = p;
                return cachedAudioDir;
            }
        }
    }
    
    // Dev Mode: crawl up from process.cwd()
    let currentDir = process.cwd();
    if (currentDir.startsWith('\\\\?\\')) currentDir = currentDir.slice(4);
    
    while (true) {
        if (fs.existsSync(path.join(currentDir, 'assets', 'audio'))) {
            cachedAudioDir = path.join(currentDir, 'assets', 'audio');
            return cachedAudioDir;
        }
        let parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) break; // reached root
        currentDir = parentDir;
    }
    
    // Prod Mode: crawl up from executable
    let execDir = path.dirname(process.execPath);
    if (execDir.startsWith('\\\\?\\')) execDir = execDir.slice(4);
    
    while (true) {
        if (fs.existsSync(path.join(execDir, 'assets', 'audio'))) {
            cachedAudioDir = path.join(execDir, 'assets', 'audio');
            return cachedAudioDir;
        }
        let parentDir = path.dirname(execDir);
        if (parentDir === execDir) break; // reached root
        execDir = parentDir;
    }
    
    // Fallback
    cachedAudioDir = path.join(process.cwd(), 'assets', 'audio');
    return cachedAudioDir;
}
