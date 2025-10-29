import { h } from 'https://esm.sh/preact@10.19.3';
import htm from 'https://esm.sh/htm@3.1.1';

const html = htm.bind(h);

export default function Input({
  label,
  type = 'text',
  value,
  onChange,
  onInput,
  placeholder = '',
  required = false,
  disabled = false,
  className = '',
  error = '',
  ...props
}) {
  const inputClasses = `w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    error ? 'border-red-500' : 'border-gray-300'
  } ${className}`;

  return html`
    <div class="mb-4">
      ${label && html`
        <label class="block text-sm font-medium text-gray-700 mb-1">
          ${label}
          ${required && html`<span class="text-red-500">*</span>`}
        </label>
      `}
      <input
        type=${type}
        value=${value}
        onChange=${onChange}
        onInput=${onInput}
        placeholder=${placeholder}
        required=${required}
        disabled=${disabled}
        class=${inputClasses}
        ...${props}
      />
      ${error && html`
        <p class="mt-1 text-sm text-red-500">${error}</p>
      `}
    </div>
  `;
}
