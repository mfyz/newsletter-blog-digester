import { h } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import Button from '../components/Button.js';
import Input from '../components/Input.js';
import Select from '../components/Select.js';
import Modal from '../components/Modal.js';

const html = htm.bind(h);

export default function Sites() {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [formData, setFormData] = useState({
    url: '',
    title: '',
    type: 'rss',
    is_active: 1
  });

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
      is_active: 1
    });
    setShowModal(true);
  };

  const openEditModal = (site) => {
    setEditingSite(site);
    setFormData({
      url: site.url,
      title: site.title,
      type: site.type,
      is_active: site.is_active
    });
    setShowModal(true);
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
      await fetch(`/api/sites/${site.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: site.is_active ? 0 : 1 })
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
        <h2 class="text-2xl font-bold text-gray-900">Sites</h2>
        <${Button} onClick=${openAddModal} variant="primary">
          + Add Site
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
                      class="flex items-center"
                    >
                      <span class=${'px-2 inline-flex text-xs leading-5 font-semibold rounded-full ' + (
                        site.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      )}>
                        ${site.is_active ? 'Active' : 'Inactive'}
                      </span>
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
                      Edit
                    </button>
                    <button
                      onClick=${() => handleDelete(site.id)}
                      class="text-red-600 hover:text-red-900"
                    >
                      Delete
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

          <div class="flex justify-end gap-3 mt-6">
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
        </form>
      </${Modal}>
    </div>
  `;
}
