import { h } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import Sites from './Sites.js';
import Posts from './Posts.js';
import Config from './Config.js';
import Logs from './Logs.js';
import SelectorBuilder from './SelectorBuilder.js';
import PromptEditor from './PromptEditor.js';
import Button from '../components/Button.js';

const html = htm.bind(h);

export default function App() {
  // Get initial tab from URL hash or default to 'posts'
  const getInitialTab = () => {
    const hash = window.location.hash.slice(1); // Remove '#' prefix
    return hash || 'posts';
  };

  const [currentTab, setCurrentTab] = useState(getInitialTab());
  const [cronRunning, setCronRunning] = useState(false);

  // Update URL hash when tab changes
  const navigateToTab = (tab) => {
    setCurrentTab(tab);
    window.location.hash = tab;
  };

  // Listen for hash changes (back/forward navigation)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash) {
        setCurrentTab(hash);
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
            ${['posts', 'sites', 'tools', 'config', 'logs'].map(tab => html`
              <${Button}
                key=${tab}
                onClick=${() => navigateToTab(tab)}
                variant=${currentTab === tab ? 'primary' : 'secondary'}
              >
                ${tab.charAt(0).toUpperCase() + tab.slice(1)}
              </${Button}>
            `)}
          </nav>
        </div>
      </header>

      <main class="max-w-7xl mx-auto px-4 py-8">
        ${currentTab === 'sites' && html`<${Sites} onNavigate=${navigateToTab} />`}
        ${currentTab === 'posts' && html`<${Posts} />`}
        ${currentTab === 'tools' && html`
          <div class="space-y-6">
            <div>
              <h2 class="text-2xl font-bold text-gray-900 mb-4">Extraction Tools</h2>
              <p class="text-gray-600 mb-6">Test and configure different extraction methods for your sites</p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- HTML Selector Card -->
              <div class="bg-white rounded-lg shadow p-6">
                <h3 class="text-xl font-semibold text-gray-900 mb-2">HTML Selector Builder</h3>
                <p class="text-sm text-gray-600 mb-4">
                  Test CSS selectors to extract posts from HTML pages. Best for sites with consistent structure.
                </p>
                <${Button}
                  variant="primary"
                  onClick=${() => navigateToTab('selector-builder')}
                >
                  Open Selector Builder
                </${Button}>
              </div>

              <!-- LLM Extraction Card -->
              <div class="bg-white rounded-lg shadow p-6">
                <h3 class="text-xl font-semibold text-gray-900 mb-2">LLM Extraction Tester</h3>
                <p class="text-sm text-gray-600 mb-4">
                  Use AI to intelligently extract content. Best for complex or changing layouts.
                </p>
                <${Button}
                  variant="primary"
                  onClick=${() => navigateToTab('prompt-editor')}
                >
                  Open LLM Tester
                </${Button}>
              </div>
            </div>
          </div>
        `}
        ${currentTab === 'selector-builder' && html`<${SelectorBuilder} />`}
        ${currentTab === 'prompt-editor' && html`<${PromptEditor} />`}
        ${currentTab === 'config' && html`<${Config} />`}
        ${currentTab === 'logs' && html`<${Logs} />`}
      </main>
    </div>
  `;
}
