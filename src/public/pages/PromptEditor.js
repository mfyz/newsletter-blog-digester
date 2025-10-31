import { h } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import Button from '../components/Button.js';
import Input from '../components/Input.js';
import { toast } from '../utils/toast.js';
import { modal } from '../utils/modal.js';

const html = htm.bind(h);

export default function PromptEditor() {
  // Get query params from URL hash
  const getQueryParams = () => {
    const hash = window.location.hash.slice(1); // Remove '#' prefix
    const [, queryString] = hash.split('?');
    if (!queryString) return {};

    const params = new URLSearchParams(queryString);
    return {
      url: params.get('url') || '',
      instructions: params.get('instructions') || 'Extract all blog posts, including their titles, URLs, publication dates, and content summaries.'
    };
  };

  const initialParams = getQueryParams();
  const [url, setUrl] = useState(initialParams.url);
  const [instructions, setInstructions] = useState(initialParams.instructions);
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [basePrompt, setBasePrompt] = useState('');
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Fetch base prompt from config
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/config');
        const config = await response.json();
        setBasePrompt(config.prompt_html_extract_base || '');
      } catch (err) {
        console.error('Failed to load config:', err);
      } finally {
        setLoadingConfig(false);
      }
    };
    fetchConfig();
  }, []);

  // Listen for hash changes to update form fields
  useEffect(() => {
    const handleHashChange = () => {
      const params = getQueryParams();
      if (params.url) setUrl(params.url);
      if (params.instructions) setInstructions(params.instructions);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTest = async () => {
    if (!url) {
      setError('URL is required');
      return;
    }

    setTesting(true);
    setError(null);
    setResults(null);

    try {
      const response = await fetch('/api/sites/test-llm-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, extraction_instructions: instructions })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Test failed');
      }

      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  return html`
    <div class="space-y-6">
      <!-- Header -->
      <div>
        <h2 class="text-2xl font-bold text-gray-900">LLM Extraction Tester</h2>
        <p class="text-sm text-gray-500 mt-1">
          Test AI-powered extraction using OpenAI to parse complex HTML
        </p>
      </div>

      <!-- Configuration Form -->
      <div class="bg-white rounded-lg shadow p-6 space-y-4">
        <${Input}
          label="Page URL"
          type="url"
          placeholder="https://example.com/blog"
          value=${url}
          onInput=${e => setUrl(e.target.value)}
          required=${true}
        />

        <!-- Base Prompt Display -->
        ${!loadingConfig && basePrompt && html`
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Base Prompt (from Settings)
            </label>
            <div class="bg-gray-50 border border-gray-200 rounded-md p-4 text-sm text-gray-700 whitespace-pre-wrap">
              ${basePrompt}
            </div>
            <p class="text-xs text-gray-500 mt-1">
              This base prompt is always included. It ensures the LLM returns properly formatted JSON. You can modify it in the Settings tab.
            </p>
          </div>
        `}

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Site-Specific Instructions (Optional)
          </label>
          <textarea
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows="4"
            placeholder="Additional instructions specific to this site... (e.g., 'Focus on articles in the Featured section. Ignore sponsored posts.')"
            value=${instructions}
            onInput=${e => setInstructions(e.target.value)}
          ></textarea>
          <p class="text-xs text-gray-500 mt-1">
            These instructions are appended to the base prompt above. Use them to provide site-specific context or filtering rules.
          </p>
        </div>

        <div class="bg-yellow-50 border border-yellow-200 rounded p-4">
          <div class="flex">
            <div class="flex-shrink-0">
              <span>⚠️</span>
            </div>
            <div class="ml-3 text-sm text-yellow-800">
              <strong>Note:</strong> LLM extraction uses OpenAI API and incurs costs (~$0.01-0.05 per test).
              Make sure you have configured your OpenAI API key in the Config tab.
            </div>
          </div>
        </div>

        <div class="flex gap-3 pt-4">
          <${Button} onClick=${handleTest} variant="primary" disabled=${testing}>
            ${testing ? 'Testing... (this may take 10-30 seconds)' : 'Test LLM Extraction'}
          </${Button}>
        </div>
      </div>

      <!-- Error Display -->
      ${error && html`
        <div class="bg-red-50 border border-red-200 rounded-lg p-4">
          <div class="flex">
            <div class="flex-shrink-0">
              <span class="text-red-600">❌</span>
            </div>
            <div class="ml-3">
              <h3 class="text-sm font-medium text-red-800">Error</h3>
              <div class="mt-2 text-sm text-red-700">${error}</div>
            </div>
          </div>
        </div>
      `}

      <!-- Results Display -->
      ${results && html`
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="px-6 py-4 bg-green-50 border-b border-green-200">
            <h3 class="text-lg font-semibold text-green-900">
              ✓ Successfully extracted ${results.count} posts
            </h3>
            <div class="text-sm text-green-700 mt-1">
              Estimated cost: $${results.estimated_cost.toFixed(3)} |
              Tokens used: ~${results.tokens_used}
            </div>
          </div>

          <div class="p-6 space-y-6">
            <!-- Preview -->
            <div>
              <h4 class="text-sm font-medium text-gray-500 uppercase mb-3">
                Extracted Posts (First 10)
              </h4>
              <div class="space-y-4">
                ${results.posts.map((post, idx) => html`
                  <div key=${idx} class="border border-gray-200 rounded p-4">
                    <div class="font-medium text-gray-900">${post.title || '(No title)'}</div>
                    <div class="text-sm text-blue-600 mt-1 break-all">${post.url || '(No URL)'}</div>
                    ${post.date && html`
                      <div class="text-xs text-gray-500 mt-1">Date: ${post.date}</div>
                    `}
                    ${post.content && html`
                      <div class="text-sm text-gray-600 mt-2 line-clamp-3">${post.content}</div>
                    `}
                  </div>
                `)}
              </div>
            </div>

            <!-- Usage Instructions -->
            <div class="bg-blue-50 border border-blue-200 rounded p-4">
              <h4 class="text-sm font-medium text-blue-900 mb-2">How to use these instructions:</h4>
              <ol class="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Copy the extraction instructions you tested</li>
                <li>Go to the Sites tab</li>
                <li>Add or edit a site with type "HTML with LLM"</li>
                <li>Paste the instructions in the extraction_instructions field</li>
              </ol>
            </div>

            <!-- Instructions Copy -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <h4 class="text-sm font-medium text-gray-500 uppercase">Your Instructions</h4>
                <${Button}
                  variant="secondary"
                  onClick=${() => {
                    navigator.clipboard.writeText(instructions);
                    toast.success('Instructions copied to clipboard!');
                  }}
                >
                  Copy Instructions
                </${Button}>
              </div>
              <pre class="bg-gray-50 border border-gray-200 rounded p-4 text-sm">${instructions}</pre>
            </div>
          </div>
        </div>
      `}
    </div>
  `;
}
