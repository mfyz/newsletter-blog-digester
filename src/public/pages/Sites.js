import { h } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import Button from '../components/Button.js';
import { toast } from '../utils/toast.js';
import { modal } from '../utils/modal.js';

const html = htm.bind(h);

export default function Sites({ onNavigate }) {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);

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
      toast.error('Failed to load sites');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await modal.confirm(
      'Are you sure you want to delete this site? All associated posts will also be deleted.',
      {
        title: 'Delete Site',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmClass: 'modal__btn-danger'
      }
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/sites/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        loadSites();
        toast.success('Site deleted successfully');
      } else {
        toast.error('Failed to delete site');
      }
    } catch (error) {
      console.error('Failed to delete site:', error);
      toast.error('Failed to delete site');
    }
  };

  const toggleActive = async (site) => {
    try {
      await fetch(`/api/sites/${site.id}/toggle`, {
        method: 'POST'
      });
      loadSites();
      toast.success(`Site ${site.is_active ? 'deactivated' : 'activated'}`);
    } catch (error) {
      console.error('Failed to toggle site:', error);
      toast.error('Failed to update site');
    }
  };

  if (loading) {
    return html`<div class="text-center py-12 text-gray-500">Loading sites...</div>`;
  }

  return html`
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">🌐 Sites</h2>
        <${Button} onClick=${() => onNavigate('site-edit')} variant="primary">
          ➕ Add Site
        </${Button}>
      </div>

      <!-- Sites Table -->
      ${sites.length === 0 ? html`
        <div class="bg-white rounded-lg shadow p-12 text-center">
          <p class="text-gray-500 mb-4">No sites configured yet.</p>
          <${Button} onClick=${() => onNavigate('site-edit')} variant="primary">
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
                    <a href=${site.url} target="_blank" rel="noopener noreferrer" class="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate max-w-xs block">
                      ${site.url}
                    </a>
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
                      onClick=${() => onNavigate('site-edit', `id=${site.id}`)}
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
    </div>
  `;
}
