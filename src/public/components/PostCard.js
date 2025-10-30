import { h } from 'https://esm.sh/preact@10.19.3';
import { useState } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';

const html = htm.bind(h);

export default function PostCard({ post, timeAgo }) {
  const [expanded, setExpanded] = useState(false);

  return html`
    <div class="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <!-- Post header (clickable) -->
      <div
        class="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick=${() => setExpanded(!expanded)}
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <h3 class="font-semibold text-gray-900 mb-1">
              ${post.title}
            </h3>
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <span class="font-medium">${post.site_title}</span>
              <span>•</span>
              <span>${timeAgo(post.date || post.created_at)}</span>
            </div>
          </div>

          <!-- Expand/collapse icon -->
          <div class="ml-4 flex-none">
            <svg
              class=${`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
      </div>

      <!-- Expanded content -->
      ${expanded && html`
        <div class="px-4 pb-4 border-t border-gray-100">
          <div class="mt-3 prose prose-sm max-w-none">
            <p class="text-gray-700 whitespace-pre-wrap">
              ${post.summary || post.content || 'No content available.'}
            </p>
          </div>

          <div class="mt-4 flex items-center gap-3">
            <a
              href=${post.url}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium text-sm"
              onClick=${(e) => e.stopPropagation()}
            >
              View Original
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      `}
    </div>
  `;
}
