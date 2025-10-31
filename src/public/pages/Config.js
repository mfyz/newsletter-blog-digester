import { h } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect, useRef } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import Button from '../components/Button.js';
import Input from '../components/Input.js';
import { toast } from '../utils/toast.js';
import { modal } from '../utils/modal.js';

const html = htm.bind(h);

export default function Config() {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const summarizationTextareaRef = useRef(null);
  const htmlExtractTextareaRef = useRef(null);

  // Auto-resize textarea function
  const autoResizeTextarea = (textarea) => {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  };

  useEffect(() => {
    loadConfig();
  }, []);

  // Auto-resize textareas when config is loaded
  useEffect(() => {
    if (!loading) {
      autoResizeTextarea(summarizationTextareaRef.current);
      autoResizeTextarea(htmlExtractTextareaRef.current);
    }
  }, [loading, config.prompt_summarization, config.prompt_html_extract_base]);

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();
      setConfig(data);
    } catch (error) {
      console.error('Failed to load config:', error);
      toast.error('Failed to load configuration');
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
        toast.success('Configuration saved successfully!');
        loadConfig();
      } else {
        const error = await response.json();
        toast.error('Failed to save config: ' + (error.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key, value) => {
    setConfig({ ...config, [key]: value });
  };

  const testAIConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/config/test-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openai_api_key: config.openai_api_key,
          openai_base_url: config.openai_base_url,
          openai_model: config.openai_model
        })
      });

      const data = await response.json();

      if (response.ok) {
        setTestResult({ success: true, message: data.response });
      } else {
        setTestResult({ success: false, message: data.error || 'Test failed' });
      }
    } catch (error) {
      console.error('AI test failed:', error);
      setTestResult({ success: false, message: 'Failed to connect to server' });
    } finally {
      setTesting(false);
    }
  };

  const handleTruncatePosts = async () => {
    const confirmed = await modal.confirm(
      '⚠️ WARNING: This will permanently delete ALL posts from the database. This action cannot be undone. Are you sure you want to continue?',
      {
        title: 'Truncate All Posts',
        confirmText: 'Delete All Posts',
        cancelText: 'Cancel',
        confirmClass: 'modal__btn-danger'
      }
    );

    if (!confirmed) return;

    try {
      const response = await fetch('/api/posts/truncate', {
        method: 'POST'
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(`Successfully deleted ${data.deletedCount || 'all'} posts from the database.`);
      } else {
        toast.error('Failed to truncate posts: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Failed to truncate posts:', error);
      toast.error('Failed to truncate posts');
    }
  };

  if (loading) {
    return html`<div class="text-center py-12 text-gray-500">Loading configuration...</div>`;
  }

  return html`
    <div class="space-y-6">
      <h2 class="text-2xl font-bold text-gray-900">⚙️ Settings</h2>

      <form onSubmit=${handleSubmit} class="space-y-6">
        <!-- Schedule Settings Card -->
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Schedule</h3>
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
          </div>
        </div>

        <!-- Slack Notifications Card -->
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Slack Notifications</h3>
          <div class="space-y-4">
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

            <${Input}
              label="Slack Channels"
              value=${config.slack_channels || ''}
              onInput=${e => updateField('slack_channels', e.target.value)}
              placeholder="general, tech-news, weekly-digest"
            />
            <p class="text-sm text-gray-500">
              Comma-separated list of channel names. The first channel is the default.
              <br />
              Example: <code class="bg-gray-100 px-1">general, tech-news, weekly-digest</code>
            </p>

            <div class="flex items-start gap-3 pt-2">
              <input
                type="checkbox"
                id="enable_cron_slack_digest"
                checked=${config.enable_cron_slack_digest === '1'}
                onChange=${e => updateField('enable_cron_slack_digest', e.target.checked ? '1' : '0')}
                class="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <div class="flex-1">
                <label for="enable_cron_slack_digest" class="text-sm font-medium text-gray-900 cursor-pointer">
                  Enable automatic Slack digest from cron job
                </label>
                <p class="text-sm text-gray-500 mt-1">
                  When enabled, new posts found during cron checks will be automatically sent to Slack as a digest.
                  When disabled, you can manually send individual posts using the "Send to Slack" button.
                </p>
              </div>
            </div>
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
              Base URL for OpenAI-compatible API. Leave empty to use OpenAI API. Use http://host.docker.internal:1234/v1 for local providers like Ollama or LM Studio running on your host machine
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

            <!-- Test Connection Button -->
            <div class="pt-4 border-t">
              <${Button}
                type="button"
                variant="secondary"
                onClick=${testAIConnection}
                disabled=${testing || !config.openai_api_key || !config.openai_base_url}
              >
                ${testing ? 'Testing...' : 'Test AI Connection'}
              </${Button}>

              ${testResult ? html`
                <div class="${testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border rounded-md p-3 mt-3">
                  <p class="${testResult.success ? 'text-green-800' : 'text-red-800'} text-sm">
                    ${testResult.success ? '✓ Success: ' : '✗ Error: '}${testResult.message}
                  </p>
                </div>
              ` : null}
            </div>
          </div>
        </div>

        <!-- AI Prompts Card -->
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">AI Prompts</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Summarization Prompt
              </label>
              <textarea
                ref=${summarizationTextareaRef}
                value=${config.prompt_summarization || ''}
                onInput=${e => {
                  updateField('prompt_summarization', e.target.value);
                  autoResizeTextarea(e.target);
                }}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none overflow-hidden"
                rows="1"
                placeholder="System prompt for summarizing post content..."
              ></textarea>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                HTML Extraction Base Prompt
              </label>
              <textarea
                ref=${htmlExtractTextareaRef}
                value=${config.prompt_html_extract_base || ''}
                onInput=${e => {
                  updateField('prompt_html_extract_base', e.target.value);
                  autoResizeTextarea(e.target);
                }}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none overflow-hidden"
                rows="1"
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
            ${saving ? '⏳ Saving...' : '💾 Save Configuration'}
          </${Button}>
        </div>
      </form>

      <!-- Danger Zone Card -->
      <div class="bg-white rounded-lg shadow p-6 border-2 border-red-500 mt-12">
        <h3 class="text-lg font-semibold text-red-600 mb-4">⚠️ Danger Zone</h3>
        <div class="space-y-4">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h4 class="font-medium text-gray-900">Truncate All Posts</h4>
              <p class="text-sm text-gray-600 mt-1">
                Permanently delete all posts from the database. This is useful for testing AI prompts or starting fresh. This action cannot be undone.
              </p>
            </div>
            <${Button}
              type="button"
              onClick=${handleTruncatePosts}
              class="ml-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
            >
              🗑️ Truncate Posts
            </${Button}>
          </div>
        </div>
      </div>
    </div>
  `;
}
