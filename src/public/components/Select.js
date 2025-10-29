import { h } from 'https://esm.sh/preact@10.19.3';
import htm from 'https://esm.sh/htm@3.1.1';

const html = htm.bind(h);

export default function Select({
  label,
  value,
  onChange,
  options = [],
  required = false,
  disabled = false,
  className = '',
  ...props
}) {
  const selectClasses = `w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`;

  return html`
    <div class="mb-4">
      ${label && html`
        <label class="block text-sm font-medium text-gray-700 mb-1">
          ${label}
          ${required && html`<span class="text-red-500">*</span>`}
        </label>
      `}
      <select
        value=${value}
        onChange=${onChange}
        required=${required}
        disabled=${disabled}
        class=${selectClasses}
        ...${props}
      >
        ${options.map(opt => html`
          <option key=${opt.value} value=${opt.value}>
            ${opt.label}
          </option>
        `)}
      </select>
    </div>
  `;
}
