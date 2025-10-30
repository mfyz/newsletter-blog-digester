import { h } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import snarkdown from 'https://esm.sh/snarkdown@2.0.0';
import Select from '../components/Select.js';
import Input from '../components/Input.js';
import { toast } from '../utils/toast.js';
import { modal } from '../utils/modal.js';

const html = htm.bind(h);

export default function Posts() {
  const [posts, setPosts] = useState([]);
  const [sites, setSites] = useState([]);
  const [filter, setFilter] = useState({ site: 'all', search: '' });
  const [loading, setLoading] = useState(true);
  const [expandedPost, setExpandedPost] = useState(null);

  const timeAgo = (date) => {
    if (!date) return 'Unknown';

    // Ensure we parse the date correctly - add 'Z' if no timezone specified
    const dateStr = date.toString();
    const parsedDate = dateStr.includes('T') || dateStr.includes('Z')
      ? new Date(date)
      : new Date(dateStr + ' UTC');

    const seconds = Math.floor((new Date() - parsedDate) / 1000);

    // Handle future dates or invalid dates
    if (isNaN(seconds) || seconds < 0) {
      return new Date(date).toLocaleDateString();
    }

    if (seconds < 60) return `${seconds} seconds ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)} weeks ago`;
    return `${Math.floor(seconds / 2592000)} months ago`;
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [postsRes, sitesRes] = await Promise.all([
        fetch('/api/posts?limit=100'),
        fetch('/api/sites')
      ]);

      const postsData = await postsRes.json();
      const sitesData = await sitesRes.json();

      // Ensure we always have arrays
      setPosts(Array.isArray(postsData) ? postsData : []);
      setSites(Array.isArray(sitesData) ? sitesData : []);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load posts');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePost = async (postId, postTitle) => {
    const confirmed = await modal.confirm(
      `Are you sure you want to delete this post?<br><br><strong>"${postTitle}"</strong><br><br>This action cannot be undone.`,
      {
        title: 'Delete Post',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmClass: 'modal__btn-danger'
      }
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Remove the post from state
        setPosts(posts.filter(p => p.id !== postId));
        setExpandedPost(null);
        toast.success('Post deleted successfully');
      } else {
        const data = await response.json();
        toast.error('Failed to delete post: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Failed to delete post:', error);
      toast.error('Failed to delete post');
    }
  };

  const filteredPosts = posts.filter(post => {
    if (filter.site !== 'all' && post.site_id !== parseInt(filter.site)) return false;
    if (filter.search && !post.title.toLowerCase().includes(filter.search.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return html`
      <div class="flex items-center justify-center py-12">
        <div class="text-gray-500">Loading posts...</div>
      </div>
    `;
  }

  const siteOptions = [
    { value: 'all', label: 'All Sites' },
    ...sites.map(site => ({ value: site.id.toString(), label: site.title }))
  ];

  return html`
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-900">📰 Posts</h2>
        <div class="text-sm text-gray-500">
          ${filteredPosts.length} posts found
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-lg shadow p-4 mb-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <${Select}
            label="Filter by Site"
            value=${filter.site}
            onChange=${e => setFilter({ ...filter, site: e.target.value })}
            options=${siteOptions}
          />

          <${Input}
            label="Search"
            placeholder="Search by title..."
            value=${filter.search}
            onInput=${e => setFilter({ ...filter, search: e.target.value })}
          />
        </div>

        ${(filter.site !== 'all' || filter.search) && html`
          <button
            class="mt-2 text-sm text-blue-600 hover:text-blue-800"
            onClick=${() => setFilter({ site: 'all', search: '' })}
          >
            Clear Filters
          </button>
        `}
      </div>

      <!-- Posts Table -->
      ${filteredPosts.length === 0 ? html`
        <div class="text-center py-12 text-gray-500">
          ${posts.length === 0
            ? 'No posts yet. Add a site and run a check to start collecting posts!'
            : 'No posts found. Try adjusting your filters.'}
        </div>
      ` : html`
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-7/12">
                  Title
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-3/12">
                  Site
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-2/12">
                  Published
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              ${filteredPosts.map(post => {
                const site = sites.find(s => s.id === post.site_id);
                const isExpanded = expandedPost === post.id;
                return html`
                  <tr key=${post.id} class="hover:bg-gray-50 transition-colors cursor-pointer" onClick=${() => setExpandedPost(isExpanded ? null : post.id)}>
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-2">
                        <span class="text-gray-400">${isExpanded ? '▼' : '▶'}</span>
                        <div class="text-sm font-medium text-gray-900">
                          ${post.title}
                        </div>
                        ${post.sent_to_slack && html`
                          <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                            ✓
                          </span>
                        `}
                      </div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                      <div class="text-sm text-gray-900">${site?.title || 'Unknown'}</div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                      <div class="text-sm text-gray-500">
                        ${timeAgo(post.date || post.created_at)}
                      </div>
                    </td>
                  </tr>
                  ${isExpanded && html`
                    <tr key="${post.id}-expanded" class="bg-gray-50">
                      <td colspan="3" class="px-4 py-4">
                        <div class="space-y-3">
                          <!-- URL -->
                          <div>
                            <div class="text-xs font-medium text-gray-500 uppercase mb-1">URL</div>
                            <a
                              href=${post.url}
                              target="_blank"
                              class="text-sm text-blue-600 hover:text-blue-800 break-all"
                            >
                              ${post.url}
                            </a>
                          </div>

                          <!-- Content -->
                          ${post.content && html`
                            <div>
                              <div class="text-xs font-medium text-gray-500 uppercase mb-1">Content</div>
                              <div
                                class="text-sm text-gray-700 bg-white border border-gray-200 rounded p-4 max-h-96 overflow-y-auto"
                                dangerouslySetInnerHTML=${{ __html: post.content }}
                              />
                            </div>
                          `}

                          <!-- Summary -->
                          ${post.summary && html`
                            <div>
                              <div class="text-xs font-medium text-gray-500 uppercase mb-1">AI Summary</div>
                              <div
                                class="text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded p-4 prose prose-sm max-w-none"
                                dangerouslySetInnerHTML=${{ __html: snarkdown(post.summary) }}
                              />
                            </div>
                          `}

                          <!-- Metadata -->
                          <div class="flex gap-6 text-xs text-gray-500">
                            ${post.date && html`
                              <div>
                                <span class="font-medium">Published:</span> ${new Date(post.date).toLocaleString()}
                              </div>
                            `}
                            <div>
                              <span class="font-medium">Added to DB:</span> ${new Date(post.created_at).toLocaleString()}
                            </div>
                            ${post.notified && html`
                              <div>
                                <span class="font-medium">Notified:</span> Yes
                              </div>
                            `}
                          </div>

                          <!-- Delete Button -->
                          <div class="mt-4 pt-4 border-t border-gray-200 flex justify-end">
                            <button
                              onClick=${(e) => {
                                e.stopPropagation();
                                handleDeletePost(post.id, post.title);
                              }}
                              class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                            >
                              🗑️ Delete Post
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  `}
                `;
              })}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}
