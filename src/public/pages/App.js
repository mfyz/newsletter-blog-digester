import { h } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect, useRef, useCallback } from 'https://esm.sh/preact@10.19.3/hooks';
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
  const [cronStatus, setCronStatus] = useState(null);
  const pollingIntervalRef = useRef(null);

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

  // Stop polling function
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Fetch cron status
  const fetchCronStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/cron/status');
      const status = await response.json();
      setCronStatus(status);

      // Stop polling when job is complete or idle (and not running)
      if (!status.running && (status.phase === 'complete' || status.phase === 'idle')) {
        stopPolling();
        setCronRunning(false);

        // Show completion toast if we just finished
        if (status.phase === 'complete' && status.completedAt) {
          const newPosts = status.newPosts || 0;
          const summarized = status.summaries.processed || 0;
          if (newPosts > 0) {
            const summaryInfo = status.summaries.total > 0
              ? ` (${summarized} summarized)`
              : '';
            toast.success(`Check complete! Found ${newPosts} new post${newPosts === 1 ? '' : 's'}${summaryInfo}.`);
          } else {
            toast.success('Check complete! No new posts found.');
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch cron status:', error);
    }
  }, [stopPolling]);

  // Start polling for status
  const startPolling = useCallback(() => {
    // Clear any existing interval
    stopPolling();

    // Fetch immediately
    fetchCronStatus();

    // Then poll every 2 seconds
    pollingIntervalRef.current = setInterval(fetchCronStatus, 2000);
  }, [fetchCronStatus, stopPolling]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const runCronNow = async () => {
    setCronRunning(true);
    setCronStatus(null); // Reset status display
    try {
      const response = await fetch('/api/cron/run', { method: 'POST' });
      const result = await response.json();

      if (result.success) {
        // Start polling for status updates
        startPolling();
      } else {
        toast.error('Failed to start cron job');
        setCronRunning(false);
      }
    } catch (error) {
      toast.error('Failed to run cron: ' + error.message);
      setCronRunning(false);
    }
  };

  return html`
    <div class="min-h-screen bg-gray-50">
      <header class="bg-white shadow fixed top-0 left-0 right-0 z-50">
        <div class="max-w-7xl mx-auto px-4 py-3">
          <div class="flex items-center justify-between gap-6">
            <h1 class="text-3xl font-bold text-gray-900 whitespace-nowrap">
              Newsletter & Blog Digester
            </h1>

            <div class="flex items-center gap-4">
              <nav class="flex space-x-2">
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

              <${Button}
                onClick=${runCronNow}
                disabled=${cronRunning}
                variant="success"
              >
                ${cronRunning ? '⏳ Checking...' : '⚡ Check Now'}
              </${Button}>
            </div>
          </div>

          <!-- Progress Indicator -->
          ${cronRunning && cronStatus && html`
            <div class="mt-3 pt-3 border-t border-gray-200">
              <div class="flex items-center gap-6">
                <!-- Phase indicator -->
                <div class="flex items-center gap-2 text-sm text-gray-600">
                  <span class="font-medium">
                    ${cronStatus.phase === 'fetching' ? '📥 Fetching sites...' : ''}
                    ${cronStatus.phase === 'summarizing' ? '🤖 Summarizing...' : ''}
                    ${cronStatus.phase === 'complete' ? '✅ Complete!' : ''}
                  </span>
                </div>

                <!-- Sites progress -->
                <div class="flex-1 max-w-xs">
                  <div class="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Sites</span>
                    <span>${cronStatus.sites.processed}/${cronStatus.sites.total}</span>
                  </div>
                  <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      class="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style="width: ${cronStatus.sites.total > 0 ? (cronStatus.sites.processed / cronStatus.sites.total * 100) : 0}%"
                    />
                  </div>
                </div>

                <!-- New posts found -->
                <div class="text-sm text-gray-600">
                  <span class="font-medium text-green-600">${cronStatus.newPosts || 0}</span>
                  <span class="text-xs ml-1">new posts</span>
                </div>

                <!-- Summaries progress -->
                <div class="flex-1 max-w-xs">
                  <div class="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Summaries</span>
                    <span>${cronStatus.summaries.processed}/${cronStatus.summaries.total}</span>
                  </div>
                  <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      class="h-full bg-purple-500 rounded-full transition-all duration-300"
                      style="width: ${cronStatus.summaries.total > 0 ? (cronStatus.summaries.processed / cronStatus.summaries.total * 100) : 0}%"
                    />
                  </div>
                </div>
              </div>
            </div>
          `}
        </div>
      </header>

      <main class="max-w-7xl mx-auto px-4 py-8 pt-24">
        ${currentTab === 'sites' && html`<${Sites} onNavigate=${navigateToTab} />`}
        ${currentTab === 'posts' && html`<${Posts} />`}
        ${currentTab === 'site-edit' && html`<${SiteEdit} key=${window.location.hash} onNavigate=${navigateToTab} />`}
        ${currentTab === 'config' && html`<${Config} />`}
        ${currentTab === 'logs' && html`<${Logs} />`}
      </main>
    </div>
  `;
}
