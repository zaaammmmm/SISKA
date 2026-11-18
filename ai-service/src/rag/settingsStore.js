import fs from 'fs';
import path from 'path';
import { SETTINGS_FILE as FILE } from '../config.js';
// Pengaturan Runtime
const defaults = () => ({
    backend: process.env.OLLAMA_BACKEND === 'colab' ? 'colab' : 'local',
    colabUrl: process.env.OLLAMA_COLAB_URL || '',
});
export function getSettings() {
    try {
        if (fs.existsSync(FILE)) {
            const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
            return { ...defaults(), ...raw };
        }
    }
    catch {
        // Fallback default
    }
    return defaults();
}
export function setSettings(next) {
    const merged = { ...getSettings(), ...next };
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
}
export function resolveBaseUrl(settings) {
    if (settings.backend === 'colab') {
        if (!settings.colabUrl)
            throw new Error('Mode Colab dipilih tapi URL Colab belum diisi di pengaturan.');
        return settings.colabUrl;
    }
    return process.env.OLLAMA_LOCAL_URL || 'http://localhost:11434';
}
