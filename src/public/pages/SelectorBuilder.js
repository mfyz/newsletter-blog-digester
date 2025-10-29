import { h } from 'https://esm.sh/preact@10.19.3';
import { useState } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import Button from '../components/Button.js';
import Input from '../components/Input.js';

const html = htm.bind(h);

export default function SelectorBuilder() {
  const [url, setUrl] = useState('');
  const [rules, setRules] = useState({
    postContainer: '.post',
    title: '.post-title',
    link: '.post-title a',
    date: '.post-date',
    content: '.post-content'
  });
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleTest = async () => {
    if (!url) {
      setError('URL is required');
      return;
    }

    setTesting(true);
    setError(null);
    setResults(null);

    try {
      const response = await fetch('/api/sites/test-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, extraction_rules: rules })
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

  const updateRule = (key, value) => {
    setRules({ ...rules, [key]: value });
  };

  const resetRules = () => {
    setRules({
      postContainer: '.post',
      title: '.post-title',
      link: '.post-title a',
      date: '.post-date',
      content: '.post-content'
    });
  };

  return html`
    <div class="space-y-6">
      <!-- Header -->
      <div>
        <h2 class="text-2xl font-bold text-gray-900">HTML Selector Builder</h2>
        <p class="text-sm text-gray-500 mt-1">
          Test CSS selectors to extract posts from HTML pages
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

        <div class="border-t pt-4">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">CSS Selectors</h3>
          <div class="space-y-3">
            <${Input}
              label="Post Container (finds each post)"
              placeholder=".post, article, .entry"
              value=${rules.postContainer}
              onInput=${e => updateRule('postContainer', e.target.value)}
              helpText="CSS selector that matches each post/article on the page"
            />

            <${Input}
              label="Title Selector (within each post)"
              placeholder=".title, h2, .post-title"
              value=${rules.title}
              onInput=${e => updateRule('title', e.target.value)}
              helpText="Selector for the post title"
            />

            <${Input}
              label="Link Selector (within each post)"
              placeholder="a, .title a, .permalink"
              value=${rules.link}
              onInput=${e => updateRule('link', e.target.value)}
              helpText="Selector for the post URL (href attribute)"
            />

            <${Input}
              label="Date Selector (optional)"
              placeholder=".date, time, .published"
              value=${rules.date}
              onInput=${e => updateRule('date', e.target.value)}
              helpText="Selector for the publication date"
            />

            <${Input}
              label="Content Selector (optional)"
              placeholder=".content, .excerpt, .summary"
              value=${rules.content}
              onInput=${e => updateRule('content', e.target.value)}
              helpText="Selector for the post content/excerpt"
            />
          </div>
        </div>

        <div class="flex gap-3 pt-4">
          <${Button} onClick=${handleTest} variant="primary" disabled=${testing}>
            ${testing ? 'Testing...' : 'Test Selectors'}
          </${Button}>
          <${Button} onClick=${resetRules} variant="secondary">
            Reset to Defaults
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
              ✓ Found ${results.total} posts
            </h3>
          </div>

          <div class="p-6 space-y-6">
            <!-- Preview -->
            <div>
              <h4 class="text-sm font-medium text-gray-500 uppercase mb-3">Preview (First 10 posts)</h4>
              <div class="space-y-4">
                ${results.posts.map((post, idx) => html`
                  <div key=${idx} class="border border-gray-200 rounded p-4">
                    <div class="font-medium text-gray-900">${post.title || '(No title)'}</div>
                    <div class="text-sm text-blue-600 mt-1 break-all">${post.url || '(No URL)'}</div>
                    ${post.date && html`
                      <div class="text-xs text-gray-500 mt-1">Date: ${post.date}</div>
                    `}
                    ${post.content && html`
                      <div class="text-sm text-gray-600 mt-2 line-clamp-2">${post.content}</div>
                    `}
                  </div>
                `)}
              </div>
            </div>

            <!-- Copy JSON -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <h4 class="text-sm font-medium text-gray-500 uppercase">Extraction Rules JSON</h4>
                <${Button}
                  variant="secondary"
                  onClick=${() => {
                    navigator.clipboard.writeText(JSON.stringify(rules, null, 2));
                    alert('Rules copied to clipboard!');
                  }}
                >
                  Copy JSON
                </${Button}>
              </div>
              <pre class="bg-gray-50 border border-gray-200 rounded p-4 text-xs overflow-x-auto">
${JSON.stringify(rules, null, 2)}
              </pre>
            </div>

            <!-- Usage Instructions -->
            <div class="bg-blue-50 border border-blue-200 rounded p-4">
              <h4 class="text-sm font-medium text-blue-900 mb-2">How to use these rules:</h4>
              <ol class="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Copy the JSON rules above</li>
                <li>Go to the Sites tab</li>
                <li>Add or edit a site with type "HTML with CSS Rules"</li>
                <li>Paste the rules in the extraction_rules field</li>
              </ol>
            </div>
          </div>
        </div>
      `}
    </div>
  `;
}
