import { h } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import Sites from './Sites.js';
import Posts from './Posts.js';
import Config from './Config.js';
import Logs from './Logs.js';
import SiteEdit from './SiteEdit.js';
import Button from '../components/Button.js';
import { toast } from '../utils/toast.js';
import { modal } from '../utils/modal.js';

const html = htm.bind(h);

export default function App() {
  // Get initial tab from URL hash or default to 'posts'
  const getInitialTab = () => {
    const hash = window.location.hash.slice(1); // Remove '#' prefix
    const [tab] = hash.split('?'); // Extract tab name without query params
    return tab || 'posts';
  };

  const [currentTab, setCurrentTab] = useState(getInitialTab());
  const [cronRunning, setCronRunning] = useState(false);

  // Update URL hash when tab changes, optionally with query params
  const navigateToTab = (tab, queryString = '') => {
    setCurrentTab(tab);
    window.location.hash = queryString ? `${tab}?${queryString}` : tab;
  };

  // Listen for hash changes (back/forward navigation)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash) {
        const [tab] = hash.split('?'); // Extract tab name without query params
        setCurrentTab(tab);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const runCronNow = async () => {
    setCronRunning(true);
    try {
      const response = await fetch('/api/cron/run', { method: 'POST' });
      const result = await response.json();
      toast.success(result.message || 'Cron check started successfully!');
    } catch (error) {
      toast.error('Failed to run cron: ' + error.message);
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
            ${[
              { id: 'posts', label: '📰 Posts' },
              { id: 'sites', label: '🌐 Sites' },
              { id: 'config', label: '⚙️ Settings' },
              { id: 'logs', label: '📋 Logs' }
            ].map(tab => html`
              <${Button}
                key=${tab.id}
                onClick=${() => navigateToTab(tab.id)}
                variant=${currentTab === tab.id ? 'primary' : 'secondary'}
              >
                ${tab.label}
              </${Button}>
            `)}
          </nav>
        </div>
      </header>

      <main class="max-w-7xl mx-auto px-4 py-8">
        ${currentTab === 'sites' && html`<${Sites} onNavigate=${navigateToTab} />`}
        ${currentTab === 'posts' && html`<${Posts} />`}
        ${currentTab === 'site-edit' && html`<${SiteEdit} key=${window.location.hash} onNavigate=${navigateToTab} />`}
        ${currentTab === 'config' && html`<${Config} />`}
        ${currentTab === 'logs' && html`<${Logs} />`}
      </main>
    </div>
  `;
}
