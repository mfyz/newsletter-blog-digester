import { h } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import snarkdown from 'https://esm.sh/snarkdown@2.0.0';
import insane from 'https://esm.sh/insane@2.6.2';
import Select from '../components/Select.js';
import Input from '../components/Input.js';
import { toast } from '../utils/toast.js';
import { modal } from '../utils/modal.js';

const html = htm.bind(h);

export default function Posts() {
  const [posts, setPosts] = useState([]);
  const [sites, setSites] = useState([]);
  const [config, setConfig] = useState({});
  const [filter, setFilter] = useState({ site: 'all', search: '', flaggedOnly: false });
  const [loading, setLoading] = useState(true);
  const [expandedPost, setExpandedPost] = useState(null);
  const [fetchingContent, setFetchingContent] = useState({});
  const [showMarkdown, setShowMarkdown] = useState({});
  const [batchFetchAndSummarizeProcessing, setBatchFetchAndSummarizeProcessing] = useState(false);
  const [batchFetchAndSummarizeProgress, setBatchFetchAndSummarizeProgress] = useState({ current: 0, total: 0 });
  const [deleteConfirm, setDeleteConfirm] = useState(null); // Track which post is in confirm state
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(null); // Track which post has dropdown open

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

  const formatDateDivider = (date) => {
    if (!date) return 'Unknown Date';

    const parsedDate = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Check if today
    if (parsedDate.toDateString() === today.toDateString()) {
      return 'Today';
    }

    // Check if yesterday
    if (parsedDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    // Check if within last week
    const daysAgo = Math.floor((today - parsedDate) / (1000 * 60 * 60 * 24));
    if (daysAgo < 7) {
      return parsedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    }

    // Otherwise show full date
    return parsedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const getPostDate = (post) => {
    return post.date || post.created_at;
  };

  const getDateKey = (date) => {
    if (!date) return 'unknown';
    return new Date(date).toDateString();
  };

  useEffect(() => {
    loadData();
  }, []);

  // Close channel dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (channelDropdownOpen) {
        setChannelDropdownOpen(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [channelDropdownOpen]);

  const loadData = async () => {
    try {
      const [postsRes, sitesRes, configRes] = await Promise.all([
        fetch('/api/posts?limit=300'),
        fetch('/api/sites'),
        fetch('/api/config')
      ]);

      const postsData = await postsRes.json();
      const sitesData = await sitesRes.json();
      const configData = await configRes.json();

      // Ensure we always have arrays
      setPosts(Array.isArray(postsData) ? postsData : []);
      setSites(Array.isArray(sitesData) ? sitesData : []);
      setConfig(configData || {});
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load posts');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePost = async (postId, postTitle, e) => {
    e.stopPropagation();

    // First click: set to confirm mode
    if (deleteConfirm !== postId) {
      setDeleteConfirm(postId);
      // Reset confirm state after 3 seconds
      setTimeout(() => {
        setDeleteConfirm(null);
      }, 3000);
      return;
    }

    // Second click: actually delete
    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Remove the post from state
        setPosts(posts.filter(p => p.id !== postId));
        setExpandedPost(null);
        setDeleteConfirm(null);
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

  const handleFetchAndSummarize = async (postId) => {
    try {
      setFetchingContent({ ...fetchingContent, [postId]: true });

      const response = await fetch(`/api/posts/${postId}/fetch-and-summarize`, {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();

        // Update the post in the posts array with the new data
        setPosts(posts.map(p => p.id === postId ? data.post : p));

        toast.success('Content fetched and summarized successfully');
      } else {
        const data = await response.json();
        toast.error('Failed to fetch content: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Failed to fetch and summarize:', error);
      toast.error('Failed to fetch and summarize');
    } finally {
      setFetchingContent({ ...fetchingContent, [postId]: false });
    }
  };

  const handleToggleFlag = async (postId, currentFlagged, e) => {
    e.stopPropagation(); // Prevent row expansion
    const newFlagged = currentFlagged ? 0 : 1;

    try {
      const response = await fetch(`/api/posts/${postId}/flag`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flagged: newFlagged })
      });

      if (response.ok) {
        // Update the post in state
        setPosts(posts.map(p => p.id === postId ? { ...p, flagged: newFlagged } : p));
      } else {
        const data = await response.json();
        toast.error('Failed to update flag: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Failed to toggle flag:', error);
      toast.error('Failed to update flag');
    }
  };

  const handleSendToSlack = async (postId, channel = null, e) => {
    if (e) e.stopPropagation(); // Prevent row expansion

    try {
      const body = channel ? { channel } : {};
      const response = await fetch(`/api/posts/${postId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const data = await response.json();
        // Update the post in state to mark as notified
        setPosts(posts.map(p => p.id === postId ? { ...p, notified: 1 } : p));
        const channelMsg = channel ? ` to #${channel.replace(/^#/, '')}` : '';
        toast.success(`Post sent to Slack${channelMsg} successfully`);
        setChannelDropdownOpen(null); // Close dropdown
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to send to Slack');
      }
    } catch (error) {
      console.error('Failed to send to Slack:', error);
      toast.error('Failed to send to Slack');
    }
  };

  const handleBatchFetchAndSummarize = async () => {
    // Get all starred posts that don't have full content
    const starredPosts = posts.filter(p => p.flagged && !p.content_full);

    if (starredPosts.length === 0) {
      toast.error('No starred posts without full content found');
      return;
    }

    setBatchFetchAndSummarizeProcessing(true);
    setBatchFetchAndSummarizeProgress({ current: 0, total: starredPosts.length });

    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < starredPosts.length; i++) {
      const post = starredPosts[i];
      setBatchFetchAndSummarizeProgress({ current: i + 1, total: starredPosts.length });

      try {
        const response = await fetch(`/api/posts/${post.id}/fetch-and-summarize`, {
          method: 'POST'
        });

        if (response.ok) {
          const data = await response.json();
          setPosts(prevPosts => prevPosts.map(p => p.id === post.id ? data.post : p));
          successCount++;
        } else {
          failureCount++;
        }
      } catch (error) {
        console.error(`Failed to fetch and summarize post ${post.id}:`, error);
        failureCount++;
      }
    }

    setBatchFetchAndSummarizeProcessing(false);
    setBatchFetchAndSummarizeProgress({ current: 0, total: 0 });

    // Show completion toast
    if (failureCount === 0) {
      toast.success(`Successfully processed all ${successCount} posts`);
    } else {
      toast.error(`Processed ${successCount} posts, ${failureCount} failed`);
    }
  };

  const filteredPosts = posts.filter(post => {
    if (filter.site !== 'all' && post.site_id !== parseInt(filter.site)) return false;
    if (filter.search && !post.title.toLowerCase().includes(filter.search.toLowerCase())) return false;
    if (filter.flaggedOnly && !post.flagged) return false;
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
    <style>
      .summary-content ul { list-style-type: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
      .summary-content ol { list-style-type: decimal; padding-left: 1.5rem; margin: 0.5rem 0; }
      .summary-content li { margin: 0.25rem 0; }
      .summary-content p { margin: 0.5rem 0; }
    </style>
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-900">📰 Posts (${filteredPosts.length})</h2>
        <button
          onClick=${handleBatchFetchAndSummarize}
          disabled=${batchFetchAndSummarizeProcessing}
          class="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-medium transition-colors"
        >
          ${batchFetchAndSummarizeProcessing
            ? `Processing ${batchFetchAndSummarizeProgress.current}/${batchFetchAndSummarizeProgress.total}`
            : '⭐ Fetch & AI Summarize Starred'}
        </button>
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-lg shadow p-4 mb-6">
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search by title..."
              value=${filter.search}
              onInput=${e => setFilter({ ...filter, search: e.target.value })}
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div class="flex-1 min-w-[200px]">
            <select
              value=${filter.site}
              onChange=${e => setFilter({ ...filter, site: e.target.value })}
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              ${siteOptions.map(opt => html`
                <option key=${opt.value} value=${opt.value}>
                  ${opt.label}
                </option>
              `)}
            </select>
          </div>

          <button
            onClick=${() => setFilter({ ...filter, flaggedOnly: !filter.flaggedOnly })}
            class="flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${
              filter.flaggedOnly
                ? 'bg-orange-500 text-white hover:bg-orange-600'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }"
            title="${filter.flaggedOnly ? 'Show all posts' : 'Show only flagged posts'}"
          >
            <span class="text-lg">⭐</span>
            <span class="text-sm">${filter.flaggedOnly ? 'Flagged Only' : 'Show Flagged'}</span>
          </button>
        </div>
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
          <table class="min-w-full">
            <tbody class="bg-white divide-y divide-gray-200">
              ${filteredPosts.map((post, index) => {
                const site = sites.find(s => s.id === post.site_id);
                const isExpanded = expandedPost === post.id;
                const postDate = getPostDate(post);
                const currentDateKey = getDateKey(postDate);
                const prevPost = index > 0 ? filteredPosts[index - 1] : null;
                const prevDateKey = prevPost ? getDateKey(getPostDate(prevPost)) : null;
                const showDateDivider = currentDateKey !== prevDateKey;

                return html`
                  ${showDateDivider && html`
                    <tr key="date-${currentDateKey}" class="bg-white border-none">
                      <td class="px-4 pb-2" style="${index > 0 ? 'padding-top: 50px' : 'padding-top: 16px'}">
                        <div class="text-3xl font-light text-gray-700">
                          ${formatDateDivider(postDate)}
                        </div>
                      </td>
                    </tr>
                  `}
                  <tr key=${post.id} class="${post.flagged ? 'bg-orange-50 hover:bg-orange-100' : 'hover:bg-gray-50'} transition-colors cursor-pointer" onClick=${() => setExpandedPost(isExpanded ? null : post.id)}>
                    <td class="px-4 py-3">
                      <div class="flex items-start gap-2">
                        <span class="text-gray-400 mt-1">${isExpanded ? '▼' : '▶'}</span>
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center justify-between gap-2 mb-1">
                            <div class="flex items-center gap-2 flex-wrap">
                              <button
                                onClick=${(e) => handleToggleFlag(post.id, post.flagged, e)}
                                class="text-2xl hover:scale-110 transition-transform"
                                style="${post.flagged ? '' : 'filter: grayscale(1) opacity(0.5);'}"
                                title="${post.flagged ? 'Unflag post' : 'Flag post'}"
                              >
                                ⭐
                              </button>
                              <div class="text-lg font-bold text-gray-900">
                                ${post.title}
                              </div>
                              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                                ${site?.title || 'Unknown'}
                              </span>
                              ${post.sent_to_slack && html`
                                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                                  ✓
                                </span>
                              `}
                            </div>
                            <div class="flex items-center gap-2 text-xs text-gray-500 whitespace-nowrap">
                              ${post.content_full && html`
                                <span title="Full content fetched and available">📘</span>
                              `}
                              <span>${timeAgo(post.date || post.created_at)}</span>
                            </div>
                          </div>
                          ${post.summary && !isExpanded && html`
                            <div
                              class="text-xs text-gray-500 mt-1 summary-content"
                              style="white-space: pre-wrap;"
                              dangerouslySetInnerHTML=${{ __html: snarkdown(post.summary) }}
                            />
                          `}
                        </div>
                      </div>
                    </td>
                  </tr>
                  ${isExpanded && html`
                    <tr key="${post.id}-expanded" class="${post.flagged ? 'bg-orange-50' : 'bg-gray-50'}">
                      <td class="px-4 py-4">
                        <div class="space-y-3">
                          <!-- Metadata and Action Buttons -->
                          <div class="flex items-start justify-between gap-4">
                            <div class="flex flex-wrap gap-2 text-xs">
                              ${post.date && html`
                                <span class="inline-flex items-center px-2 py-1 rounded bg-blue-100 text-blue-700">
                                  Published: ${new Date(post.date).toLocaleString()}
                                </span>
                              `}
                              <span class="inline-flex items-center px-2 py-1 rounded bg-gray-100 text-gray-700">
                                Added: ${new Date(post.created_at).toLocaleString()}
                              </span>
                              <span class="inline-flex items-center px-2 py-1 rounded ${post.notified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">
                                Notified: ${post.notified ? 'Yes' : 'No'}
                              </span>
                            </div>
                            <div class="flex gap-2">
                              <!-- Split Button: Send to Slack -->
                              ${(() => {
                                const channels = config.slack_channels
                                  ? config.slack_channels.split(',').map(c => c.trim().replace(/^#/, '')).filter(c => c)
                                  : [];
                                const hasMultipleChannels = channels.length > 1;

                                return html`
                                  <div class="relative inline-block">
                                    <div class="flex">
                                      <!-- Main button -->
                                      <button
                                        onClick=${(e) => handleSendToSlack(post.id, null, e)}
                                        class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 ${hasMultipleChannels ? 'rounded-l' : 'rounded'} text-sm whitespace-nowrap flex items-center gap-1"
                                        title="Send to ${channels.length > 0 ? `#${channels[0]}` : 'Slack'}"
                                      >
                                        💬 Send to Slack
                                      </button>
                                      <!-- Dropdown trigger (only show if multiple channels configured) -->
                                      ${hasMultipleChannels && html`
                                        <button
                                          onClick=${(e) => {
                                            e.stopPropagation();
                                            setChannelDropdownOpen(channelDropdownOpen === post.id ? null : post.id);
                                          }}
                                          class="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded-r border-l border-green-500 text-sm"
                                          title="Choose channel"
                                        >
                                          ▼
                                        </button>
                                      `}
                                    </div>
                                    <!-- Dropdown menu -->
                                    ${channelDropdownOpen === post.id && hasMultipleChannels && html`
                                      <div class="absolute z-50 mt-1 bg-white border border-gray-300 rounded shadow-lg min-w-[180px]">
                                        ${channels.map(channel => html`
                                          <button
                                            key=${channel}
                                            onClick=${(e) => {
                                              e.stopPropagation();
                                              handleSendToSlack(post.id, channel);
                                            }}
                                            class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 whitespace-nowrap"
                                          >
                                            #${channel}
                                          </button>
                                        `)}
                                      </div>
                                    `}
                                  </div>
                                `;
                              })()}
                              <button
                                onClick=${(e) => handleDeletePost(post.id, post.title, e)}
                                class="${deleteConfirm === post.id
                                  ? 'bg-orange-600 hover:bg-orange-700 animate-pulse'
                                  : 'bg-red-600 hover:bg-red-700'} text-white px-3 py-1 rounded text-sm whitespace-nowrap transition-colors"
                                title="${deleteConfirm === post.id ? 'Click again to confirm deletion' : 'Delete this post'}"
                              >
                                ${deleteConfirm === post.id ? '⚠️ Confirm Delete?' : '🗑️ Delete'}
                              </button>
                            </div>
                          </div>

                          <!-- URL -->
                          <div class="text-sm">
                            <a
                              href=${post.url}
                              target="_blank"
                              class="inline-flex items-center px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors break-all"
                            >
                              ${post.url} →
                            </a>
                          </div>

                          <!-- Fetch and Summarize Button -->
                          ${!post.content_full && html`
                            <div>
                              <button
                                onClick=${(e) => {
                                  e.stopPropagation();
                                  handleFetchAndSummarize(post.id);
                                }}
                                disabled=${fetchingContent[post.id]}
                                class="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                              >
                                ${fetchingContent[post.id] ? '🔄 Fetching...' : '🤖 Fetch and summarize with AI'}
                              </button>
                            </div>
                          `}

                          <!-- AI Summary -->
                          ${post.summary && html`
                            <div>
                              <div class="text-xs font-medium text-gray-500 uppercase mb-1">
                                AI Summary ${post.content_full ? '(from full content)' : '(from RSS/newsletter)'}
                              </div>
                              <div
                                class="text-sm text-gray-700 ${post.content_full ? 'bg-purple-50 border-purple-200' : 'bg-yellow-50 border-yellow-200'} border rounded p-4 summary-content"
                                dangerouslySetInnerHTML=${{ __html: snarkdown(post.summary) }}
                              />
                            </div>
                          `}

                          <!-- Full Content (Markdown) -->
                          ${post.content_full && html`
                            <div>
                              <div class="flex items-center justify-between mb-1">
                                <div class="text-xs font-medium text-gray-500 uppercase">Full Content</div>
                                <button
                                  onClick=${(e) => {
                                    e.stopPropagation();
                                    setShowMarkdown({ ...showMarkdown, [post.id]: !showMarkdown[post.id] });
                                  }}
                                  class="text-xs text-blue-600 hover:text-blue-800 underline"
                                >
                                  ${showMarkdown[post.id] ? 'Show Preview' : 'Show Markdown'}
                                </button>
                              </div>
                              ${showMarkdown[post.id] ? html`
                                <div class="text-sm text-gray-700 bg-gray-50 border-2 border-purple-400 rounded p-4 overflow-auto max-h-[36rem] whitespace-pre-wrap font-mono">
                                  ${post.content_full}
                                </div>
                              ` : html`
                                <div
                                  class="text-sm text-gray-700 bg-white border-2 border-purple-400 rounded p-4 overflow-auto max-h-[36rem] summary-content"
                                  dangerouslySetInnerHTML=${{ __html: snarkdown(post.content_full) }}
                                />
                              `}
                            </div>
                          `}

                          <!-- Content -->
                          ${post.content && html`
                            <div>
                              <div class="text-xs font-medium text-gray-500 uppercase mb-1">Content</div>
                              <div
                                class="text-sm text-gray-700 bg-white border border-gray-200 rounded p-4 summary-content"
                                dangerouslySetInnerHTML=${{ __html: insane(post.content, {
                                  allowedTags: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre', 'img', 'div', 'span'],
                                  allowedAttributes: {
                                    a: ['href', 'title', 'target'],
                                    img: ['src', 'alt', 'title', 'width', 'height']
                                  },
                                  allowedSchemes: ['http', 'https', 'mailto']
                                }) }}
                              />
                            </div>
                          `}
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
