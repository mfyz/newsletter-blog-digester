import { h } from 'https://esm.sh/preact@10.19.3';
import { useState } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import Sites from './Sites.js';
import Posts from './Posts.js';
import Config from './Config.js';
import Logs from './Logs.js';
import Button from '../components/Button.js';

const html = htm.bind(h);

export default function App() {
  const [currentTab, setCurrentTab] = useState('posts');
  const [cronRunning, setCronRunning] = useState(false);

  const runCronNow = async () => {
    setCronRunning(true);
    try {
      const response = await fetch('/api/cron/run', { method: 'POST' });
      const result = await response.json();
      alert(result.message || 'Cron check started successfully!');
    } catch (error) {
      alert('Failed to run cron: ' + error.message);
    } finally {
      setCronRunning(false);
    }
  };

  return html`
    <div class="min-h-screen bg-gray-50">
      <header class="bg-white shadow">
        <div class="max-w-7xl mx-auto px-4 py-6">
          <div class="flex items-center justify-between">
            <h1 class="text-3xl font-bold text-gray-900">
              Newsletter Blog Digester
            </h1>
            <${Button}
              onClick=${runCronNow}
              disabled=${cronRunning}
              variant="primary"
            >
              ${cronRunning ? '⏳ Checking...' : '⚡ Check Now'}
            </${Button}>
          </div>

          <nav class="mt-4 flex space-x-4">
            ${['posts', 'sites', 'config', 'logs'].map(tab => html`
              <${Button}
                key=${tab}
                onClick=${() => setCurrentTab(tab)}
                variant=${currentTab === tab ? 'primary' : 'secondary'}
              >
                ${tab.charAt(0).toUpperCase() + tab.slice(1)}
              </${Button}>
            `)}
          </nav>
        </div>
      </header>

      <main class="max-w-7xl mx-auto px-4 py-8">
        ${currentTab === 'sites' && html`<${Sites} />`}
        ${currentTab === 'posts' && html`<${Posts} />`}
        ${currentTab === 'config' && html`<${Config} />`}
        ${currentTab === 'logs' && html`<${Logs} />`}
      </main>
    </div>
  `;
}
