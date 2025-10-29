import { h } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import Button from '../components/Button.js';
import Input from '../components/Input.js';
import Select from '../components/Select.js';
import Modal from '../components/Modal.js';

const html = htm.bind(h);

export default function Sites({ onNavigate }) {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [formData, setFormData] = useState({
    url: '',
    title: '',
    type: 'rss',
    is_active: 1,
    extraction_rules: '',
    extraction_instructions: ''
  });

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

  useEffect(() => {
    loadSites();
  }, []);

  const loadSites = async () => {
    try {
      const response = await fetch('/api/sites');
      const data = await response.json();
      setSites(data);
    } catch (error) {
      console.error('Failed to load sites:', error);
      alert('Failed to load sites');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingSite(null);
    setFormData({
      url: '',
      title: '',
      type: 'rss',
      is_active: 1,
      extraction_rules: '',
      extraction_instructions: ''
    });
    setShowModal(true);
  };

  const openEditModal = (site) => {
    setEditingSite(site);
    setFormData({
      url: site.url,
      title: site.title,
      type: site.type,
      is_active: site.is_active,
      extraction_rules: site.extraction_rules || '',
      extraction_instructions: site.extraction_instructions || ''
    });
    setShowModal(true);
  };

  const handleTest = async () => {
    if (!formData.url) {
      alert('Please enter a URL first');
      return;
    }

    if (formData.type === 'html_rules') {
      const rules = getRules();
      if (!rules.postContainer || !rules.title || !rules.link) {
        alert('Please fill in at least the Post Container, Title, and Link selectors');
        return;
      }

      try {
        const response = await fetch('/api/sites/test-extraction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: formData.url, extraction_rules: rules })
        });

        const data = await response.json();
        if (response.ok) {
          alert(`Success! Found ${data.total} posts.\n\nFirst post: ${data.posts[0]?.title || 'N/A'}\n\nCheck browser console for full results.`);
          console.log('Test Results:', data);
        } else {
          alert('Test failed: ' + (data.error || 'Unknown error'));
        }
      } catch (error) {
        alert('Test failed: ' + error.message);
      }
    } else if (formData.type === 'html_llm') {
      if (!formData.extraction_instructions) {
        alert('Please enter extraction instructions first');
        return;
      }

      try {
        const response = await fetch('/api/sites/test-llm-extraction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: formData.url,
            extraction_instructions: formData.extraction_instructions
          })
        });

        const data = await response.json();
        if (response.ok) {
          alert(`Success! Found ${data.count} posts.\n\nFirst post: ${data.posts[0]?.title || 'N/A'}\n\nCheck browser console for full results.`);
          console.log('Test Results:', data);
        } else {
          alert('Test failed: ' + (data.error || 'Unknown error'));
        }
      } catch (error) {
        alert('Test failed: ' + error.message);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const url = editingSite ? `/api/sites/${editingSite.id}` : '/api/sites';
      const method = editingSite ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setShowModal(false);
        loadSites();
      } else {
        const error = await response.json();
        alert('Failed to save site: ' + (error.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Failed to save site:', error);
      alert('Failed to save site');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this site? All associated posts will also be deleted.')) {
      return;
    }

    try {
      const response = await fetch(`/api/sites/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        loadSites();
      } else {
        alert('Failed to delete site');
      }
    } catch (error) {
      console.error('Failed to delete site:', error);
      alert('Failed to delete site');
    }
  };

  const toggleActive = async (site) => {
    try {
      await fetch(`/api/sites/${site.id}/toggle`, {
        method: 'POST'
      });
      loadSites();
    } catch (error) {
      console.error('Failed to toggle site:', error);
      alert('Failed to update site');
    }
  };

  const typeOptions = [
    { value: 'rss', label: 'RSS Feed' },
    { value: 'html_rules', label: 'HTML with CSS Rules' },
    { value: 'html_llm', label: 'HTML with LLM' }
  ];

  if (loading) {
    return html`<div class="text-center py-12 text-gray-500">Loading sites...</div>`;
  }

  return html`
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">🌐 Sites</h2>
        <${Button} onClick=${openAddModal} variant="primary">
          ➕ Add Site
        </${Button}>
      </div>

      <!-- Sites Table -->
      ${sites.length === 0 ? html`
        <div class="bg-white rounded-lg shadow p-12 text-center">
          <p class="text-gray-500 mb-4">No sites configured yet.</p>
          <${Button} onClick=${openAddModal} variant="primary">
            Add Your First Site
          </${Button}>
        </div>
      ` : html`
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Checked
                </th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              ${sites.map(site => html`
                <tr key=${site.id}>
                  <td class="px-6 py-4">
                    <div class="text-sm font-medium text-gray-900">${site.title}</div>
                    <div class="text-sm text-gray-500 truncate max-w-xs">${site.url}</div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                      ${site.type}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick=${() => toggleActive(site)}
                      class="text-2xl hover:scale-110 transition-transform cursor-pointer"
                      title=${site.is_active ? 'Active - Click to deactivate' : 'Inactive - Click to activate'}
                    >
                      ${site.is_active ? '🟢' : '🔴'}
                    </button>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${site.last_checked ? new Date(site.last_checked).toLocaleString() : 'Never'}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick=${() => openEditModal(site)}
                      class="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick=${() => handleDelete(site.id)}
                      class="text-red-600 hover:text-red-900"
                    >
                      🗑️ Delete
                    </button>
                  </td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      `}

      <!-- Add/Edit Modal -->
      <${Modal}
        isOpen=${showModal}
        onClose=${() => setShowModal(false)}
        title=${editingSite ? 'Edit Site' : 'Add New Site'}
      >
        <form onSubmit=${handleSubmit}>
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
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-semibold text-gray-900">CSS Selectors</h3>
                ${onNavigate && html`
                  <${Button}
                    type="button"
                    variant="secondary"
                    onClick=${() => {
                      setShowModal(false);
                      onNavigate('selector-builder');
                    }}
                  >
                    🔧 Open Builder & Tester
                  </${Button}>
                `}
              </div>

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
            <div class="border-t pt-4">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-semibold text-gray-900">LLM Extraction Instructions</h3>
                ${onNavigate && html`
                  <${Button}
                    type="button"
                    variant="secondary"
                    onClick=${() => {
                      setShowModal(false);
                      onNavigate('prompt-editor');
                    }}
                  >
                    🤖 Open LLM Tester
                  </${Button}>
                `}
              </div>

              <textarea
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows="4"
                placeholder="Extract all blog posts with their titles, URLs, and publication dates..."
                value=${formData.extraction_instructions}
                onInput=${e => setFormData({ ...formData, extraction_instructions: e.target.value })}
              ></textarea>
              <p class="text-xs text-gray-500 mt-2">
                Describe what content to extract from the page. The AI will intelligently parse the HTML based on your instructions.
              </p>
              <div class="bg-yellow-50 border border-yellow-200 rounded p-3 mt-3">
                <p class="text-xs text-yellow-800">
                  ⚠️ <strong>Note:</strong> LLM extraction costs ~$0.01-0.05 per check. Make sure OpenAI API key is configured in Config tab.
                </p>
              </div>
            </div>
          `}

          <div class="flex justify-between mt-6">
            <div>
              ${(formData.type === 'html_rules' || formData.type === 'html_llm') && html`
                <${Button}
                  type="button"
                  variant="secondary"
                  onClick=${handleTest}
                >
                  🧪 Test Extraction
                </${Button}>
              `}
            </div>
            <div class="flex gap-3">
              <${Button}
                type="button"
                variant="secondary"
                onClick=${() => setShowModal(false)}
              >
                Cancel
              </${Button}>
              <${Button} type="submit" variant="primary">
                ${editingSite ? 'Update' : 'Create'}
              </${Button}>
            </div>
          </div>
        </form>
      </${Modal}>
    </div>
  `;
}
