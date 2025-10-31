import { h } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import beautify from 'https://esm.sh/js-beautify@1.15.1';
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

  // LLM selector generation state
  const [generatingSelectors, setGeneratingSelectors] = useState(false);
  const [generatedSelectors, setGeneratedSelectors] = useState(null);
  const [selectorGenError, setSelectorGenError] = useState(null);
  const [selectorInstructions, setSelectorInstructions] = useState('');
  const [fetchedHTML, setFetchedHTML] = useState(null);
  const [showHTML, setShowHTML] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);

  // Base prompt for LLM
  const [basePrompt, setBasePrompt] = useState('');
  const [selectorPrompt, setSelectorPrompt] = useState('');
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

  // Fetch base prompts from config
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/config');
        const config = await response.json();
        setBasePrompt(config.prompt_html_extract_base || '');
        setSelectorPrompt(config.prompt_selector_generation || '');
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

  // Parse extraction rules - returns array of rule objects
  // IMPORTANT: Expects array format only - no backward compatibility fallback
  const getRules = () => {
    if (!formData.extraction_rules) return [];
    try {
      let rules = typeof formData.extraction_rules === 'string'
        ? JSON.parse(formData.extraction_rules)
        : formData.extraction_rules;

      // Handle double-stringified JSON (legacy data issue)
      if (typeof rules === 'string') {
        rules = JSON.parse(rules);
      }

      // Must be an array - if not, return empty to force user to fix
      if (!Array.isArray(rules)) {
        console.error('extraction_rules must be an array, got:', typeof rules, rules);
        toast.error('Invalid extraction rules format. Expected array. Please re-configure this site.');
        return [];
      }

      return rules;
    } catch (e) {
      console.error('Failed to parse extraction_rules:', e);
      toast.error('Failed to parse extraction rules');
      return [];
    }
  };

  const updateRule = (index, key, value) => {
    const rules = getRules();
    if (rules[index]) {
      rules[index][key] = value;
      setFormData({ ...formData, extraction_rules: JSON.stringify(rules) });
    }
  };

  const addRule = () => {
    const rules = getRules();
    rules.push({
      name: `Rule ${rules.length + 1}`,
      container: '',
      title: '',
      url: '',
      date: '',
      content: ''
    });
    setFormData({ ...formData, extraction_rules: JSON.stringify(rules) });
  };

  const removeRule = (index) => {
    const rules = getRules();
    rules.splice(index, 1);
    setFormData({ ...formData, extraction_rules: JSON.stringify(rules) });
  };

  const handleGenerateSelectors = async () => {
    if (!formData.url) {
      toast.warning('Please enter a URL first');
      return;
    }

    setGeneratingSelectors(true);
    setGeneratedSelectors(null);
    setSelectorGenError(null);
    setTestResults(null);
    setTestError(null);

    try {
      // Step 1: Fetch HTML
      toast.info('Fetching HTML from URL...');
      const fetchResponse = await fetch('/api/sites/fetch-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: formData.url })
      });

      if (!fetchResponse.ok) {
        const error = await fetchResponse.json();
        throw new Error(error.error || 'Failed to fetch HTML');
      }

      const { html } = await fetchResponse.json();

      // Store the fetched HTML for display
      setFetchedHTML(html);
      setShowHTML(false); // Collapsed by default

      // Step 2: Generate selectors using LLM
      toast.info('Generating CSS selectors with AI...');
      const genResponse = await fetch('/api/sites/generate-selectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: formData.url,
          html,
          additional_instructions: selectorInstructions
        })
      });

      if (!genResponse.ok) {
        const error = await genResponse.json();
        throw new Error(error.error || 'Failed to generate selectors');
      }

      const { selectors } = await genResponse.json();
      setGeneratedSelectors(selectors);
      toast.success('Selectors generated successfully!');

      // Step 3: Automatically test the generated selectors
      toast.info('Testing generated selectors...');
      await testGeneratedSelectors(selectors);
    } catch (error) {
      setSelectorGenError(error.message);
      toast.error('Failed to generate selectors: ' + error.message);
    } finally {
      setGeneratingSelectors(false);
    }
  };

  const testGeneratedSelectors = async (selectors) => {
    setTesting(true);
    setTestError(null);

    try {
      const response = await fetch('/api/sites/test-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: formData.url, extraction_rules: selectors })
      });

      const data = await response.json();
      if (response.ok) {
        setTestResults(data);
        toast.success(`Test complete! Found ${data.total} posts.`);
      } else {
        setTestError(data.error || 'Unknown error');
        toast.warning('Generated selectors test failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      setTestError(error.message);
      toast.error('Test failed: ' + error.message);
    } finally {
      setTesting(false);
    }
  };

  const applyGeneratedSelectors = () => {
    if (!generatedSelectors) return;

    // Add generated selectors as a new rule
    const rules = getRules();
    rules.push({
      name: `AI Generated Rule ${rules.length + 1}`,
      container: generatedSelectors.postContainer,
      title: generatedSelectors.title,
      url: generatedSelectors.link || generatedSelectors.url,
      date: generatedSelectors.date || '',
      content: generatedSelectors.content || ''
    });

    setFormData({
      ...formData,
      extraction_rules: JSON.stringify(rules)
    });

    toast.success('Selectors added as new rule!');
    setGeneratedSelectors(null); // Clear after applying
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

        // Validate that at least one rule has required fields
        const hasValidRule = rules.some(rule => rule.container && rule.title && rule.url);
        if (!hasValidRule) {
          toast.warning('At least one rule must have Container, Title, and Link selectors filled in');
          setTesting(false);
          return;
        }

        // First fetch the HTML to show it to the user
        toast.info('Fetching HTML from URL...');
        const fetchResponse = await fetch('/api/sites/fetch-html', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: formData.url })
        });

        if (fetchResponse.ok) {
          const { html } = await fetchResponse.json();
          setFetchedHTML(html);
          setShowHTML(false); // Collapsed by default
        }

        // Then test extraction - send as array
        toast.info('Testing CSS selectors...');
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
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-semibold text-gray-900">CSS Extraction Rules</h3>
                  <${Button}
                    type="button"
                    variant="primary"
                    onClick=${addRule}
                  >
                    ➕ Add Rule
                  </${Button}>
                </div>

                <p class="text-xs text-gray-600">
                  Define one or more extraction rules. Each rule can target different sections of the page (e.g., "Featured Articles", "Quick Links").
                </p>

                <!-- AI Selector Generation Section -->
                <div class="bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick=${(e) => {
                      e.preventDefault();
                      setShowAIGenerator(!showAIGenerator);
                    }}
                    class="w-full flex items-center justify-between p-4 hover:bg-blue-100 transition-colors"
                  >
                    <div class="flex items-center gap-2">
                      <span class="text-2xl">🤖</span>
                      <h4 class="text-sm font-semibold text-blue-900">AI Selector Generation</h4>
                    </div>
                    <span class="text-blue-900">${showAIGenerator ? '▼' : '▶'}</span>
                  </button>

                  ${showAIGenerator && html`
                    <div class="px-4 pb-4 space-y-3">
                      <p class="text-xs text-blue-800">
                        Let AI analyze the page and generate CSS selectors automatically. This uses the base prompt from Settings with optional additional instructions.
                      </p>

                  <!-- Base Prompt Display -->
                  ${!loadingConfig && selectorPrompt && html`
                    <div>
                      <label class="block text-xs font-medium text-gray-700 mb-2">
                        Base Prompt (from Settings)
                      </label>
                      <div class="bg-white border border-gray-200 rounded-md p-3 text-xs text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                        ${selectorPrompt}
                      </div>
                      <p class="text-xs text-gray-500 mt-1">
                        This base prompt guides the AI to generate CSS selectors. You can modify it in the Settings tab.
                      </p>
                    </div>
                  `}

                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">
                      Additional Instructions (Optional)
                    </label>
                    <textarea
                      class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows="2"
                      placeholder="e.g., 'Focus on the main content area, ignore sidebar posts'"
                      value=${selectorInstructions}
                      onInput=${e => setSelectorInstructions(e.target.value)}
                    ></textarea>
                    <p class="text-xs text-gray-500 mt-1">
                      These instructions are appended to the base prompt above. Use them to provide site-specific context.
                    </p>
                  </div>

                  <${Button}
                    onClick=${handleGenerateSelectors}
                    variant="primary"
                    disabled=${generatingSelectors || !formData.url}
                  >
                    ${generatingSelectors ? '⏳ Generating... (may take 10-30s)' : '✨ Generate Selectors with AI'}
                  </${Button}>

                  ${selectorGenError && html`
                    <div class="bg-red-50 border border-red-200 rounded p-2">
                      <p class="text-xs text-red-800">${selectorGenError}</p>
                    </div>
                  `}

                  ${generatedSelectors && html`
                    <div class="bg-white border border-green-300 rounded p-3 space-y-2">
                      <div class="flex items-center justify-between">
                        <h5 class="text-xs font-semibold text-green-900">✓ Generated Selectors</h5>
                        <${Button}
                          onClick=${applyGeneratedSelectors}
                          variant="primary"
                        >
                          📋 Apply as New Rule
                        </${Button}>
                      </div>
                      <div class="text-xs space-y-1 text-gray-700">
                        <div><strong>Container:</strong> ${generatedSelectors.postContainer || 'N/A'}</div>
                        <div><strong>Title:</strong> ${generatedSelectors.title || 'N/A'}</div>
                        <div><strong>Link:</strong> ${generatedSelectors.link || 'N/A'}</div>
                        <div><strong>Date:</strong> ${generatedSelectors.date || '(not found)'}</div>
                        <div><strong>Content:</strong> ${generatedSelectors.content || '(not found)'}</div>
                      </div>
                    </div>
                  `}
                    </div>
                  `}
                </div>

                <!-- Manual Input Fields for Each Rule -->
                ${(() => {
                  const rules = getRules();
                  if (rules.length === 0) {
                    // Initialize with one empty rule if none exist
                    addRule();
                    return null;
                  }

                  return rules.map((rule, index) => html`
                    <div key=${index} class="border border-gray-300 rounded-lg p-4 space-y-3 bg-gray-50">
                      <div class="flex items-center justify-between">
                        <${Input}
                          label="Rule Name"
                          placeholder="e.g., Featured Articles, Quick Links"
                          value=${rule.name || ''}
                          onInput=${e => updateRule(index, 'name', e.target.value)}
                          helpText="Descriptive name for this extraction rule"
                        />
                        ${rules.length > 1 && html`
                          <button
                            type="button"
                            onClick=${() => removeRule(index)}
                            class="ml-2 px-3 py-2 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded border border-red-300"
                          >
                            🗑️ Remove
                          </button>
                        `}
                      </div>

                      <${Input}
                        label="Post Container *"
                        placeholder=".post, article, .entry"
                        value=${rule.container || ''}
                        onInput=${e => updateRule(index, 'container', e.target.value)}
                        helpText="CSS selector that matches each post/article on the page"
                        required=${true}
                      />

                      <${Input}
                        label="Title Selector *"
                        placeholder=".title, h2, .post-title"
                        value=${rule.title || ''}
                        onInput=${e => updateRule(index, 'title', e.target.value)}
                        helpText="Selector for post title (within each post)"
                        required=${true}
                      />

                      <${Input}
                        label="Link Selector *"
                        placeholder="a, .title a, .permalink"
                        value=${rule.url || ''}
                        onInput=${e => updateRule(index, 'url', e.target.value)}
                        helpText="Selector for post URL (href attribute)"
                        required=${true}
                      />

                      <${Input}
                        label="Date Selector (optional)"
                        placeholder=".date, time, .published"
                        value=${rule.date || ''}
                        onInput=${e => updateRule(index, 'date', e.target.value)}
                        helpText="Selector for publication date"
                      />

                      <${Input}
                        label="Content Selector (optional)"
                        placeholder=".content, .excerpt, p"
                        value=${rule.content || ''}
                        onInput=${e => updateRule(index, 'content', e.target.value)}
                        helpText="Selector for post content/excerpt"
                      />
                    </div>
                  `);
                })()}
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

                ${testResults.posts && testResults.posts.length > 0 ? html`
                  <div>
                    <h5 class="text-sm font-semibold text-gray-900 mb-3">
                      📄 Extracted Posts (${testResults.posts.length} total)
                    </h5>
                    <div class="space-y-3">
                      ${testResults.posts.map((post, idx) => html`
                        <div key=${idx} class="border border-gray-300 rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
                          <div class="font-semibold text-gray-900 mb-2">${post.title || '(No title)'}</div>
                          <a
                            href=${post.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-blue-600 hover:text-blue-800 hover:underline text-xs break-all block mb-2"
                          >
                            ${post.url || '(No URL)'}
                          </a>
                          ${post.date && html`
                            <div class="text-xs text-gray-500 mb-2">
                              📅 ${post.date}
                            </div>
                          `}
                          ${post.content && html`
                            <div class="text-sm text-gray-700 mt-2 p-2 bg-gray-50 rounded border border-gray-200">
                              ${post.content.substring(0, 200)}${post.content.length > 200 ? '...' : ''}
                            </div>
                          `}
                        </div>
                      `)}
                    </div>
                  </div>
                ` : html`
                  <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p class="text-sm text-yellow-800">
                      ⚠️ No posts were extracted. The selectors might not match any content on the page.
                    </p>
                  </div>
                `}
              </div>
            `}

            <!-- HTML Preview Section -->
            ${fetchedHTML && html`
              <div class="mt-4">
                <button
                  type="button"
                  onClick=${(e) => {
                    e.preventDefault();
                    setShowHTML(!showHTML);
                  }}
                  class="w-full flex items-center justify-between bg-gray-100 hover:bg-gray-200 px-4 py-3 rounded-lg transition-colors"
                >
                  <span class="text-sm font-semibold text-gray-900">
                    📄 Fetched HTML (${Math.round(fetchedHTML.length / 1024)}KB)
                  </span>
                  <span class="text-gray-600">${showHTML ? '▼' : '▶'}</span>
                </button>

                ${showHTML && (() => {
                  const formattedHTML = (() => {
                    try {
                      return beautify.html(fetchedHTML, {
                        indent_size: 2,
                        wrap_line_length: 80,
                        max_preserve_newlines: 2,
                        end_with_newline: true
                      });
                    } catch (e) {
                      return fetchedHTML;
                    }
                  })();

                  return html`
                    <div class="mt-2 border border-gray-300 rounded-lg bg-gray-50">
                      <div class="p-2 border-b border-gray-300 bg-gray-100 flex items-center justify-between">
                        <span class="text-xs font-medium text-gray-700">Formatted HTML Source</span>
                        <button
                          onClick=${() => {
                            navigator.clipboard.writeText(fetchedHTML);
                            toast.success('HTML copied to clipboard!');
                          }}
                          class="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                          📋 Copy
                        </button>
                      </div>
                      <pre class="p-4 text-xs overflow-auto max-h-[768px] bg-white font-mono whitespace-pre-wrap break-words">${formattedHTML}</pre>
                    </div>
                  `;
                })()}
              </div>
            `}
          </div>
        `}
      </div>
    </div>
  `;
}
