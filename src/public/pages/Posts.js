import { h } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import PostCard from '../components/PostCard.js';
import Select from '../components/Select.js';
import Input from '../components/Input.js';

const html = htm.bind(h);

export default function Posts() {
  const [posts, setPosts] = useState([]);
  const [sites, setSites] = useState([]);
  const [filter, setFilter] = useState({ site: 'all', search: '' });
  const [loading, setLoading] = useState(true);

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
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
      alert('Failed to load posts');
    } finally {
      setLoading(false);
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
        <h2 class="text-2xl font-bold text-gray-900">Posts</h2>
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

      <!-- Posts list -->
      ${filteredPosts.length === 0 ? html`
        <div class="text-center py-12 text-gray-500">
          ${posts.length === 0
            ? 'No posts yet. Add a site and run a check to start collecting posts!'
            : 'No posts found. Try adjusting your filters.'}
        </div>
      ` : html`
        <div class="space-y-3">
          ${filteredPosts.map(post => html`
            <${PostCard}
              key=${post.id}
              post=${post}
              timeAgo=${timeAgo}
            />
          `)}
        </div>
      `}
    </div>
  `;
}
