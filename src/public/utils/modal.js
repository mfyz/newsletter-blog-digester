/**
 * Modal utility
 * Wraps Micromodal library for easy replacement in the future
 * CDN: https://cdn.jsdelivr.net/npm/micromodal@0.4.10/dist/micromodal.min.js
 * Docs: https://micromodal.vercel.app/
 */

class Modal {
  constructor() {
    this.initialized = false;
    this.confirmResolve = null;
  }

  /**
   * Initialize Micromodal library
   * Loads JS from CDN
   */
  async init() {
    if (this.initialized) return;

    return new Promise((resolve, reject) => {
      // Load JS
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/micromodal@0.4.10/dist/micromodal.min.js';
      script.onload = () => {
        // Initialize Micromodal with custom options
        window.MicroModal.init({
          disableScroll: true,
          disableFocus: false,
          awaitOpenAnimation: true,
          awaitCloseAnimation: true,
        });

        // Create confirmation modal container if not exists
        this.createConfirmModal();

        this.initialized = true;
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load Micromodal library'));
      document.head.appendChild(script);
    });
  }

  /**
   * Create confirmation modal HTML and inject into DOM
   */
  createConfirmModal() {
    if (document.getElementById('confirm-modal')) return;

    const modalHTML = `
      <div class="modal micromodal-slide" id="confirm-modal" aria-hidden="true">
        <div class="modal__overlay" tabindex="-1" data-micromodal-close>
          <div class="modal__container" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
            <header class="modal__header">
              <h2 class="modal__title" id="confirm-modal-title">
                Confirm Action
              </h2>
              <button class="modal__close" aria-label="Close modal" data-micromodal-close></button>
            </header>
            <main class="modal__content" id="confirm-modal-content">
              <p>Are you sure you want to proceed?</p>
            </main>
            <footer class="modal__footer">
              <button class="modal__btn modal__btn-secondary" data-micromodal-close id="confirm-modal-cancel">
                Cancel
              </button>
              <button class="modal__btn modal__btn-primary" id="confirm-modal-confirm">
                Confirm
              </button>
            </footer>
          </div>
        </div>
      </div>

      <style>
        .modal {
          display: none;
        }

        .modal.is-open {
          display: block;
        }

        .modal__overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 9999;
        }

        .modal__container {
          background-color: #fff;
          padding: 30px;
          max-width: 500px;
          max-height: 100vh;
          border-radius: 12px;
          overflow-y: auto;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          animation: mmfadeIn 0.3s cubic-bezier(0, 0, 0.2, 1);
        }

        .modal__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .modal__title {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
          color: #1f2937;
        }

        .modal__close {
          background: transparent;
          border: 0;
          padding: 8px;
          cursor: pointer;
          font-size: 24px;
          line-height: 1;
          color: #6b7280;
        }

        .modal__close:hover {
          color: #1f2937;
        }

        .modal__close::before {
          content: "\\00d7";
        }

        .modal__content {
          margin-bottom: 20px;
          line-height: 1.6;
          color: #4b5563;
        }

        .modal__footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }

        .modal__btn {
          padding: 10px 24px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .modal__btn-primary {
          background-color: #3b82f6;
          color: white;
        }

        .modal__btn-primary:hover {
          background-color: #2563eb;
        }

        .modal__btn-secondary {
          background-color: #f3f4f6;
          color: #374151;
        }

        .modal__btn-secondary:hover {
          background-color: #e5e7eb;
        }

        .modal__btn-danger {
          background-color: #ef4444;
          color: white;
        }

        .modal__btn-danger:hover {
          background-color: #dc2626;
        }

        @keyframes mmfadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes mmfadeOut {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(-10px); }
        }

        .micromodal-slide[aria-hidden="false"] .modal__overlay {
          animation: mmfadeIn 0.3s cubic-bezier(0.0, 0.0, 0.2, 1);
        }

        .micromodal-slide[aria-hidden="false"] .modal__container {
          animation: mmfadeIn 0.3s cubic-bezier(0, 0, 0.2, 1);
        }

        .micromodal-slide[aria-hidden="true"] .modal__overlay {
          animation: mmfadeOut 0.3s cubic-bezier(0.0, 0.0, 0.2, 1);
        }

        .micromodal-slide[aria-hidden="true"] .modal__container {
          animation: mmfadeOut 0.3s cubic-bezier(0, 0, 0.2, 1);
        }
      </style>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Set up event listeners
    const confirmBtn = document.getElementById('confirm-modal-confirm');
    const cancelBtn = document.getElementById('confirm-modal-cancel');

    confirmBtn.addEventListener('click', () => {
      if (this.confirmResolve) {
        this.confirmResolve(true);
        this.confirmResolve = null;
      }
      window.MicroModal.close('confirm-modal');
    });

    cancelBtn.addEventListener('click', () => {
      if (this.confirmResolve) {
        this.confirmResolve(false);
        this.confirmResolve = null;
      }
    });
  }

  /**
   * Ensure library is loaded
   */
  async ensureInit() {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * Show confirmation dialog
   * @param {string} message - Message to display
   * @param {Object} options - Optional configuration
   * @param {string} options.title - Dialog title
   * @param {string} options.confirmText - Confirm button text
   * @param {string} options.cancelText - Cancel button text
   * @param {string} options.confirmClass - CSS class for confirm button (default: 'modal__btn-primary')
   * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
   */
  async confirm(message, options = {}) {
    await this.ensureInit();

    const {
      title = 'Confirm Action',
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      confirmClass = 'modal__btn-primary',
    } = options;

    return new Promise((resolve) => {
      this.confirmResolve = resolve;

      // Update modal content
      document.getElementById('confirm-modal-title').textContent = title;
      document.getElementById('confirm-modal-content').innerHTML = message;

      const confirmBtn = document.getElementById('confirm-modal-confirm');
      confirmBtn.textContent = confirmText;

      // Reset button classes
      confirmBtn.className = `modal__btn ${confirmClass}`;

      const cancelBtn = document.getElementById('confirm-modal-cancel');
      cancelBtn.textContent = cancelText;

      // Show modal
      window.MicroModal.show('confirm-modal', {
        onClose: () => {
          if (this.confirmResolve) {
            this.confirmResolve(false);
            this.confirmResolve = null;
          }
        },
      });
    });
  }

  /**
   * Show custom modal
   * @param {string} modalId - ID of the modal element
   * @param {Object} options - Micromodal options
   */
  async show(modalId, options = {}) {
    await this.ensureInit();
    window.MicroModal.show(modalId, options);
  }

  /**
   * Close modal
   * @param {string} modalId - ID of the modal element
   */
  async close(modalId) {
    await this.ensureInit();
    window.MicroModal.close(modalId);
  }
}

// Export singleton instance
export const modal = new Modal();

// Initialize on first import
modal.init().catch(console.error);
