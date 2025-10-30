import { h } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect, useRef } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import Button from '../components/Button.js';
import Input from '../components/Input.js';
import { toast } from '../utils/toast.js';
import { modal } from '../utils/modal.js';

const html = htm.bind(h);

export default function SelectorBuilder() {
  // Workflow steps
  const [currentStep, setCurrentStep] = useState(1); // 1: Fetch HTML, 2: Generate Selectors, 3: Test Selectors

  // Step 1: Fetch HTML
  const [url, setUrl] = useState('');
  const [fetchedHTML, setFetchedHTML] = useState('');
  const [fetchingHTML, setFetchingHTML] = useState(false);
  const [showHTML, setShowHTML] = useState(false);

  // Step 2: Generate Selectors
  const [generatingSelectors, setGeneratingSelectors] = useState(false);
  const [llmPrompt, setLlmPrompt] = useState(`You are a web scraping expert. Given the HTML of a blog/news page, generate CSS selectors to extract post information.

Return a JSON object with the following structure:
{
  "postContainer": "CSS selector that matches each post/article container",
  "title": "CSS selector for post title (relative to container)",
  "link": "CSS selector for post link (relative to container)",
  "date": "CSS selector for post date (relative to container, optional)",
  "content": "CSS selector for post content/excerpt (relative to container, optional)"
}

Make sure the selectors are as specific as possible but not overly fragile. Prefer class names and semantic tags.
Only return the JSON object, no additional text.`);

  // Step 3: Test Selectors
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

  // Syntax highlighter loaded flag
  const [highlightLoaded, setHighlightLoaded] = useState(false);
  const codeRef = useRef(null);

  // Load syntax highlighter when HTML is shown
  useEffect(() => {
    if (showHTML && fetchedHTML && !highlightLoaded) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js';
      script.onload = () => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github.min.css';
        document.head.appendChild(link);
        setHighlightLoaded(true);
      };
      document.head.appendChild(script);
    }
  }, [showHTML, fetchedHTML, highlightLoaded]);

  // Apply syntax highlighting
  useEffect(() => {
    if (highlightLoaded && codeRef.current && window.hljs) {
      window.hljs.highlightElement(codeRef.current);
    }
  }, [highlightLoaded, fetchedHTML, showHTML]);

  // Step 1: Fetch HTML
  const handleFetchHTML = async () => {
    if (!url) {
      setError('URL is required');
      return;
    }

    setFetchingHTML(true);
    setError(null);

    try {
      const response = await fetch('/api/sites/fetch-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch HTML');
      }

      const data = await response.json();
      setFetchedHTML(data.html);
      setShowHTML(true);
      setCurrentStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetchingHTML(false);
    }
  };

  // Step 2: Generate Selectors via LLM
  const handleGenerateSelectors = async () => {
    if (!fetchedHTML) {
      setError('Please fetch HTML first');
      return;
    }

    setGeneratingSelectors(true);
    setError(null);

    try {
      const response = await fetch('/api/sites/generate-selectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, html: fetchedHTML, prompt: llmPrompt })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate selectors');
      }

      const data = await response.json();
      setRules(data.selectors);
      setCurrentStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingSelectors(false);
    }
  };

  // Step 3: Test Selectors
  const handleTestSelectors = async () => {
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

  const resetWorkflow = () => {
    setCurrentStep(1);
    setFetchedHTML('');
    setShowHTML(false);
    setResults(null);
    setError(null);
  };

  return html`
    <div class="space-y-6">
      <!-- Header -->
      <div>
        <h2 class="text-2xl font-bold text-gray-900">HTML Selector Builder</h2>
        <p class="text-sm text-gray-500 mt-1">
          3-step workflow: Fetch HTML → Generate Selectors → Test & Refine
        </p>
      </div>

      <!-- Step Progress Indicator -->
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center justify-between">
          ${[1, 2, 3].map(step => {
            const isActive = currentStep === step;
            const isComplete = currentStep > step;
            const stepTitles = ['Fetch HTML', 'Generate Selectors', 'Test Selectors'];

            return html`
              <div key=${step} class="flex-1 flex items-center ${step < 3 ? 'pr-4' : ''}">
                <div class="flex flex-col items-center flex-1">
                  <div class="${isComplete ? 'bg-green-500' : isActive ? 'bg-blue-500' : 'bg-gray-300'} text-white rounded-full w-10 h-10 flex items-center justify-center font-bold">
                    ${isComplete ? '✓' : step}
                  </div>
                  <div class="text-sm mt-2 ${isActive ? 'font-bold text-blue-600' : 'text-gray-600'}">
                    ${stepTitles[step - 1]}
                  </div>
                </div>
                ${step < 3 && html`
                  <div class="flex-1 border-t-2 ${isComplete ? 'border-green-500' : 'border-gray-300'} relative top-[-20px]"></div>
                `}
              </div>
            `;
          })}
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

      <!-- Step 1: Fetch HTML -->
      ${currentStep >= 1 && html`
        <div class="bg-white rounded-lg shadow p-6 space-y-4">
          <h3 class="text-lg font-semibold text-gray-900">Step 1: Fetch HTML</h3>

          <${Input}
            label="Page URL"
            type="url"
            placeholder="https://example.com/blog"
            value=${url}
            onInput=${e => setUrl(e.target.value)}
            required=${true}
            disabled=${currentStep > 1}
          />

          <div class="flex gap-3">
            <${Button}
              onClick=${handleFetchHTML}
              variant="primary"
              disabled=${fetchingHTML || currentStep > 1}
            >
              ${fetchingHTML ? 'Fetching...' : 'Fetch HTML'}
            </${Button}>

            ${fetchedHTML && html`
              <${Button}
                onClick=${() => setShowHTML(!showHTML)}
                variant="secondary"
              >
                ${showHTML ? 'Hide HTML' : 'Show HTML'}
              </${Button}>
            `}

            ${currentStep > 1 && html`
              <${Button} onClick=${resetWorkflow} variant="secondary">
                Start Over
              </${Button}>
            `}
          </div>

          <!-- HTML Display -->
          ${showHTML && fetchedHTML && html`
            <div class="mt-4">
              <h4 class="text-sm font-medium text-gray-700 mb-2">Fetched HTML (syntax highlighted):</h4>
              <div class="bg-gray-50 border border-gray-200 rounded overflow-auto" style="max-height: 400px;">
                <pre><code ref=${codeRef} class="language-html text-xs">${fetchedHTML}</code></pre>
              </div>
            </div>
          `}
        </div>
      `}

      <!-- Step 2: Generate Selectors -->
      ${currentStep >= 2 && html`
        <div class="bg-white rounded-lg shadow p-6 space-y-4">
          <h3 class="text-lg font-semibold text-gray-900">Step 2: Generate Selectors with AI</h3>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              AI Prompt (customize if needed)
            </label>
            <textarea
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono"
              rows="10"
              value=${llmPrompt}
              onInput=${e => setLlmPrompt(e.target.value)}
              disabled=${currentStep > 2}
            ></textarea>
            <p class="text-xs text-gray-500 mt-1">
              Edit this prompt to give the AI more specific instructions about the page structure.
            </p>
          </div>

          <div class="flex gap-3">
            <${Button}
              onClick=${handleGenerateSelectors}
              variant="primary"
              disabled=${generatingSelectors || currentStep > 2}
            >
              ${generatingSelectors ? 'Generating...' : 'Generate Selectors with AI'}
            </${Button}>

            ${currentStep === 2 && html`
              <${Button}
                onClick=${() => setCurrentStep(3)}
                variant="secondary"
              >
                Skip (Enter Manually)
              </${Button}>
            `}
          </div>
        </div>
      `}

      <!-- Step 3: Test Selectors -->
      ${currentStep >= 3 && html`
        <div class="bg-white rounded-lg shadow p-6 space-y-4">
          <h3 class="text-lg font-semibold text-gray-900">Step 3: Test & Refine Selectors</h3>

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

          <div class="flex gap-3 pt-4">
            <${Button} onClick=${handleTestSelectors} variant="primary" disabled=${testing}>
              ${testing ? 'Testing...' : 'Test Selectors'}
            </${Button}>
            <${Button} onClick=${resetRules} variant="secondary">
              Reset to Defaults
            </${Button}>
            ${fetchedHTML && html`
              <${Button} onClick=${handleGenerateSelectors} variant="secondary" disabled=${generatingSelectors}>
                ${generatingSelectors ? 'Regenerating...' : 'Regenerate with AI'}
              </${Button}>
            `}
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
                    toast.success('Rules copied to clipboard!');
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
