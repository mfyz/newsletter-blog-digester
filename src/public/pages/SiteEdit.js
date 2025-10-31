import { h } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import Button from '../components/Button.js';
import Input from '../components/Input.js';
import Select from '../components/Select.js';
import { toast } from '../utils/toast.js';

const html = htm.bind(h);

export default function SiteEdit({ onNavigate }) {
  // Get site ID from URL hash (e.g., #site-edit?id=1 or #site-edit for new)
  const getSiteId = () => {
    const hash = window.location.hash.slice(1);
    const [, queryString] = hash.split('?');
    if (!queryString) return null;
    const params = new URLSearchParams(queryString);
    return params.get('id');
  };

  const [siteId, setSiteId] = useState(getSiteId());
  const isNewSite = !siteId;

  const [loading, setLoading] = useState(!isNewSite);
  const [formData, setFormData] = useState({
    url: '',
    title: '',
    type: 'rss',
    is_active: 1,
    extraction_rules: '',
    extraction_instructions: ''
  });

  // Testing state
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [testError, setTestError] = useState(null);

  // Base prompt for LLM
  const [basePrompt, setBasePrompt] = useState('');
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Listen for hash changes and reload
  useEffect(() => {
    const handleHashChange = () => {
      const newSiteId = getSiteId();
      setSiteId(newSiteId);
      setTestResults(null);
      setTestError(null);
      if (newSiteId) {
        setLoading(true);
        loadSiteById(newSiteId);
      } else {
        // Reset form for new site
        setFormData({
          url: '',
          title: '',
          type: 'rss',
          is_active: 1,
          extraction_rules: '',
          extraction_instructions: ''
        });
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Load site data if editing
  useEffect(() => {
    if (!isNewSite) {
      loadSite();
    }
  }, []);

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

  const loadSite = async () => {
    await loadSiteById(siteId);
  };

  const loadSiteById = async (id) => {
    try {
      const response = await fetch(`/api/sites/${id}`);
      if (!response.ok) throw new Error('Failed to load site');
      const site = await response.json();
      setFormData({
        url: site.url,
        title: site.title,
        type: site.type,
        is_active: site.is_active,
        extraction_rules: site.extraction_rules || '',
        extraction_instructions: site.extraction_instructions || ''
      });
    } catch (error) {
      console.error('Failed to load site:', error);
      toast.error('Failed to load site');
      onNavigate('sites');
    } finally {
      setLoading(false);
    }
  };

  // Parse extraction rules into individual fields
  const getRules = () => {
    if (!formData.extraction_rules) return {};
    try {
      return typeof formData.extraction_rules === 'string'
        ? JSON.parse(formData.extraction_rules)
        : formData.extraction_rules;
    } catch {
      return {};
    }
  };

  const updateRule = (key, value) => {
    const rules = getRules();
    rules[key] = value;
    setFormData({ ...formData, extraction_rules: JSON.stringify(rules) });
  };

  const handleTest = async () => {
    if (!formData.url) {
      toast.warning('Please enter a URL first');
      return;
    }

    setTesting(true);
    setTestResults(null);
    setTestError(null);

    try {
      if (formData.type === 'html_rules') {
        const rules = getRules();
        if (!rules.postContainer || !rules.title || !rules.link) {
          toast.warning('Please fill in at least the Post Container, Title, and Link selectors');
          setTesting(false);
          return;
        }

        const response = await fetch('/api/sites/test-extraction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: formData.url, extraction_rules: rules })
        });

        const data = await response.json();
        if (response.ok) {
          setTestResults(data);
          toast.success(`Success! Found ${data.total} posts.`);
        } else {
          setTestError(data.error || 'Unknown error');
          toast.error('Test failed: ' + (data.error || 'Unknown error'));
        }
      } else if (formData.type === 'html_llm') {
        const response = await fetch('/api/sites/test-llm-extraction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: formData.url,
            extraction_instructions: formData.extraction_instructions || ''
          })
        });

        const data = await response.json();
        if (response.ok) {
          setTestResults(data);
          toast.success(`Success! Found ${data.count} posts.`);
        } else {
          setTestError(data.error || 'Unknown error');
          toast.error('Test failed: ' + (data.error || 'Unknown error'));
        }
      }
    } catch (error) {
      setTestError(error.message);
      toast.error('Test failed: ' + error.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const url = isNewSite ? '/api/sites' : `/api/sites/${siteId}`;
      const method = isNewSite ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast.success(isNewSite ? 'Site created successfully' : 'Site updated successfully');
        onNavigate('sites');
      } else {
        const error = await response.json();
        toast.error('Failed to save site: ' + (error.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Failed to save site:', error);
      toast.error('Failed to save site');
    }
  };

  const typeOptions = [
    { value: 'rss', label: 'RSS Feed' },
    { value: 'html_rules', label: 'HTML with CSS Rules' },
    { value: 'html_llm', label: 'HTML with LLM' }
  ];

  if (loading) {
    return html`<div class="text-center py-12 text-gray-500">Loading site...</div>`;
  }

  return html`
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <button
            onClick=${() => onNavigate('sites')}
            class="text-gray-600 hover:text-gray-900"
          >
            ← Back to Sites
          </button>
          <h2 class="text-2xl font-bold text-gray-900">
            ${isNewSite ? 'Add New Site' : 'Edit Site'}
          </h2>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Left Column: Form -->
        <div class="bg-white rounded-lg shadow p-6">
          <form onSubmit=${handleSubmit} class="space-y-4">
            <${Input}
              label="Title"
              value=${formData.title}
              onInput=${e => setFormData({ ...formData, title: e.target.value })}
              placeholder="My Blog"
              required=${true}
            />

            <${Input}
              label="URL"
              type="url"
              value=${formData.url}
              onInput=${e => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://example.com/rss"
              required=${true}
            />

            <${Select}
              label="Type"
              value=${formData.type}
              onChange=${e => setFormData({ ...formData, type: e.target.value })}
              options=${typeOptions}
            />

            ${formData.type === 'html_rules' && html`
              <div class="space-y-3 border-t pt-4">
                <h3 class="text-sm font-semibold text-gray-900">CSS Selectors</h3>

                <${Input}
                  label="Post Container *"
                  placeholder=".post, article, .entry"
                  value=${getRules().postContainer || ''}
                  onInput=${e => updateRule('postContainer', e.target.value)}
                  helpText="CSS selector that matches each post/article on the page"
                  required=${true}
                />

                <${Input}
                  label="Title Selector *"
                  placeholder=".title, h2, .post-title"
                  value=${getRules().title || ''}
                  onInput=${e => updateRule('title', e.target.value)}
                  helpText="Selector for post title (within each post)"
                  required=${true}
                />

                <${Input}
                  label="Link Selector *"
                  placeholder="a, .title a, .permalink"
                  value=${getRules().link || ''}
                  onInput=${e => updateRule('link', e.target.value)}
                  helpText="Selector for post URL (href attribute)"
                  required=${true}
                />

                <${Input}
                  label="Date Selector (optional)"
                  placeholder=".date, time, .published"
                  value=${getRules().date || ''}
                  onInput=${e => updateRule('date', e.target.value)}
                  helpText="Selector for publication date"
                />

                <${Input}
                  label="Content Selector (optional)"
                  placeholder=".content, .excerpt, p"
                  value=${getRules().content || ''}
                  onInput=${e => updateRule('content', e.target.value)}
                  helpText="Selector for post content/excerpt"
                />
              </div>
            `}

            ${formData.type === 'html_llm' && html`
              <div class="border-t pt-4 space-y-4">
                <!-- Base Prompt Display -->
                ${!loadingConfig && basePrompt && html`
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                      Base Prompt (from Settings)
                    </label>
                    <div class="bg-gray-50 border border-gray-200 rounded-md p-4 text-sm text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
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
                    value=${formData.extraction_instructions}
                    onInput=${e => setFormData({ ...formData, extraction_instructions: e.target.value })}
                  ></textarea>
                  <p class="text-xs text-gray-500 mt-2">
                    These instructions are appended to the base prompt above. Use them to provide site-specific context or filtering rules.
                  </p>
                </div>

                <div class="bg-yellow-50 border border-yellow-200 rounded p-3">
                  <p class="text-xs text-yellow-800">
                    ⚠️ <strong>Note:</strong> LLM extraction costs ~$0.01-0.05 per check. Make sure OpenAI API key is configured in Settings tab.
                  </p>
                </div>
              </div>
            `}

            <div class="flex justify-between pt-4 border-t">
              <${Button}
                type="button"
                variant="secondary"
                onClick=${() => onNavigate('sites')}
              >
                Cancel
              </${Button}>
              <${Button} type="submit" variant="primary">
                ${isNewSite ? 'Create Site' : 'Update Site'}
              </${Button}>
            </div>
          </form>
        </div>

        <!-- Right Column: Testing Tool -->
        ${(formData.type === 'html_rules' || formData.type === 'html_llm') && html`
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">
              ${formData.type === 'html_rules' ? '🔧 Test CSS Selectors' : '🤖 Test LLM Extraction'}
            </h3>

            <p class="text-sm text-gray-600 mb-4">
              ${formData.type === 'html_rules'
                ? 'Test your CSS selectors to see what posts will be extracted from the page.'
                : 'Test the LLM extraction to see what posts will be extracted using AI.'}
            </p>

            <div class="w-full">
              <${Button}
                onClick=${handleTest}
                variant="primary"
                disabled=${testing || !formData.url}
              >
                ${testing ? 'Testing... (may take 10-30 seconds)' : '🧪 Test Extraction'}
              </${Button}>
            </div>

            ${testError && html`
              <div class="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                <div class="flex">
                  <div class="flex-shrink-0">
                    <span class="text-red-600">❌</span>
                  </div>
                  <div class="ml-3">
                    <h4 class="text-sm font-medium text-red-800">Error</h4>
                    <div class="mt-2 text-sm text-red-700">${testError}</div>
                  </div>
                </div>
              </div>
            `}

            ${testResults && html`
              <div class="mt-4 space-y-4">
                <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 class="text-sm font-semibold text-green-900">
                    ✓ Successfully extracted ${testResults.total || testResults.count} posts
                  </h4>
                  ${testResults.estimated_cost && html`
                    <p class="text-xs text-green-700 mt-1">
                      Estimated cost: $${testResults.estimated_cost.toFixed(3)}
                    </p>
                  `}
                </div>

                ${testResults.posts && testResults.posts.length > 0 && html`
                  <div>
                    <h5 class="text-sm font-medium text-gray-700 mb-2">
                      Extracted Posts
                    </h5>
                    <div class="space-y-3">
                      ${testResults.posts.map((post, idx) => html`
                        <div key=${idx} class="border border-gray-200 rounded p-3 text-sm">
                          <div class="font-medium text-gray-900">${post.title || '(No title)'}</div>
                          <a
                            href=${post.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-blue-600 hover:underline text-xs break-all"
                          >
                            ${post.url || '(No URL)'}
                          </a>
                          ${post.date && html`
                            <div class="text-xs text-gray-500 mt-1">Date: ${post.date}</div>
                          `}
                          ${post.content && html`
                            <div class="text-xs text-gray-600 mt-2 line-clamp-2">${post.content}</div>
                          `}
                        </div>
                      `)}
                    </div>
                  </div>
                `}
              </div>
            `}
          </div>
        `}
      </div>
    </div>
  `;
}
