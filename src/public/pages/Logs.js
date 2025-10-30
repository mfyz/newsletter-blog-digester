import { h } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import Button from '../components/Button.js';
import Select from '../components/Select.js';

const html = htm.bind(h);

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    loadLogs();
  }, [filter]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadLogs();
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh, filter]);

  const loadLogs = async () => {
    try {
      const url = filter === 'all'
        ? '/api/logs?limit=200'
        : `/api/logs?level=${filter}&limit=200`;

      const response = await fetch(url);
      const data = await response.json();

      // Ensure data is always an array
      setLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load logs:', error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const getLevelColor = (level) => {
    switch (level) {
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'warn':
        return 'bg-yellow-100 text-yellow-800';
      case 'info':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getLevelIcon = (level) => {
    switch (level) {
      case 'error':
        return '❌';
      case 'warn':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📝';
    }
  };

  const levelOptions = [
    { value: 'all', label: 'All Levels' },
    { value: 'info', label: 'Info' },
    { value: 'warn', label: 'Warning' },
    { value: 'error', label: 'Error' }
  ];

  if (loading) {
    return html`<div class="text-center py-12 text-gray-500">Loading logs...</div>`;
  }

  return html`
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">Logs</h2>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked=${autoRefresh}
              onChange=${e => setAutoRefresh(e.target.checked)}
              class="rounded"
            />
            Auto-refresh (5s)
          </label>
          <${Button} onClick=${loadLogs} variant="secondary">
            🔄 Refresh
          </${Button}>
        </div>
      </div>

      <!-- Filter -->
      <div class="bg-white rounded-lg shadow p-4">
        <div class="max-w-xs">
          <${Select}
            label="Filter by Level"
            value=${filter}
            onChange=${e => setFilter(e.target.value)}
            options=${levelOptions}
          />
        </div>
      </div>

      <!-- Logs List -->
      ${logs.length === 0 ? html`
        <div class="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          No logs found
        </div>
      ` : html`
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="divide-y divide-gray-200">
            ${logs.map((log, index) => html`
              <div key=${log.id || index} class="p-4 hover:bg-gray-50">
                <div class="flex items-start gap-3">
                  <!-- Level Badge -->
                  <span class=${'px-2 py-1 text-xs font-semibold rounded-full ' + getLevelColor(log.level)}>
                    ${getLevelIcon(log.level)} ${log.level.toUpperCase()}
                  </span>

                  <!-- Content -->
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-gray-900 font-medium">
                      ${log.message}
                    </p>
                    ${log.details && html`
                      <pre class="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded overflow-x-auto">
                        ${JSON.stringify(JSON.parse(log.details), null, 2)}
                      </pre>
                    `}
                    <p class="mt-1 text-xs text-gray-500">
                      ${new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            `)}
          </div>
        </div>
      `}

      ${logs.length >= 200 && html`
        <p class="text-center text-sm text-gray-500">
          Showing most recent 200 logs. Older logs are not displayed.
        </p>
      `}
    </div>
  `;
}
