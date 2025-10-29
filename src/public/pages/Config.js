import { h } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import Button from '../components/Button.js';
import Input from '../components/Input.js';

const html = htm.bind(h);

export default function Config() {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();
      setConfig(data);
    } catch (error) {
      console.error('Failed to load config:', error);
      alert('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (response.ok) {
        alert('Configuration saved successfully!');
        loadConfig();
      } else {
        const error = await response.json();
        alert('Failed to save config: ' + (error.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key, value) => {
    setConfig({ ...config, [key]: value });
  };

  if (loading) {
    return html`<div class="text-center py-12 text-gray-500">Loading configuration...</div>`;
  }

  return html`
    <div class="space-y-6">
      <h2 class="text-2xl font-bold text-gray-900">Configuration</h2>

      <form onSubmit=${handleSubmit} class="space-y-6">
        <!-- General Settings Card -->
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">General</h3>
          <div class="space-y-4">
            <${Input}
              label="Cron Schedule"
              value=${config.schedule || ''}
              onInput=${e => updateField('schedule', e.target.value)}
              placeholder="0 9 * * * (9 AM daily)"
              required=${true}
            />
            <p class="text-sm text-gray-500">
              Cron expression format: minute hour day month weekday
              <br />
              Examples: <code class="bg-gray-100 px-1">0 9 * * *</code> (9 AM daily),
              <code class="bg-gray-100 px-1">0 */6 * * *</code> (every 6 hours)
            </p>

            <${Input}
              label="Slack Webhook URL"
              type="url"
              value=${config.slack_webhook_url || ''}
              onInput=${e => updateField('slack_webhook_url', e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
            />
            <p class="text-sm text-gray-500">
              Required for sending post digests to Slack
            </p>
          </div>
        </div>

        <!-- AI Extraction and Summarization Card -->
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">AI Extraction and Summarization</h3>
          <div class="space-y-4">
            <${Input}
              label="OpenAI API Key"
              type="password"
              value=${config.openai_api_key || ''}
              onInput=${e => updateField('openai_api_key', e.target.value)}
              placeholder="sk-..."
            />
            <p class="text-sm text-gray-500">
              Required for post summarization and LLM-based extraction
            </p>

            <${Input}
              label="OpenAI Base URL"
              type="url"
              value=${config.openai_base_url || ''}
              onInput=${e => updateField('openai_base_url', e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
            <p class="text-sm text-gray-500">
              Base URL for OpenAI-compatible API. Use http://localhost:1234/v1 for local providers like Ollama or LM Studio
            </p>

            <${Input}
              label="Model"
              value=${config.openai_model || ''}
              onInput=${e => updateField('openai_model', e.target.value)}
              placeholder="gpt-3.5-turbo"
            />
            <p class="text-sm text-gray-500">
              Model to use for summarization and extraction (e.g., gpt-3.5-turbo, gpt-4, or local model names)
            </p>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Summarization Prompt
              </label>
              <textarea
                value=${config.prompt_summarization || ''}
                onInput=${e => updateField('prompt_summarization', e.target.value)}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows="4"
                placeholder="System prompt for summarizing post content..."
              ></textarea>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                HTML Extraction Base Prompt
              </label>
              <textarea
                value=${config.prompt_html_extract_base || ''}
                onInput=${e => updateField('prompt_html_extract_base', e.target.value)}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows="6"
                placeholder="Base system prompt for extracting posts from HTML..."
              ></textarea>
            </div>
          </div>
        </div>

        <!-- Database Cleanup Card -->
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Database Cleanup</h3>
          <div class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <${Input}
                label="Clear Content After (days)"
                type="number"
                value=${config.cleanup_content_days || ''}
                onInput=${e => updateField('cleanup_content_days', e.target.value)}
                placeholder="7"
                min="1"
              />
              <${Input}
                label="Delete Posts After (days)"
                type="number"
                value=${config.cleanup_delete_days || ''}
                onInput=${e => updateField('cleanup_delete_days', e.target.value)}
                placeholder="365"
                min="1"
              />
            </div>
            <p class="text-sm text-gray-500">
              Content is cleared from old posts to save space. Posts are deleted completely after the specified period.
            </p>
          </div>
        </div>

        <!-- Submit Button -->
        <div class="flex justify-end">
          <${Button}
            type="submit"
            variant="primary"
            disabled=${saving}
          >
            ${saving ? 'Saving...' : 'Save Configuration'}
          </${Button}>
        </div>
      </form>
    </div>
  `;
}
