/**
 * Toast notification utility
 * Wraps Notyf library for easy replacement in the future
 * CDN: https://cdn.jsdelivr.net/npm/notyf@3/notyf.min.js
 * Docs: https://github.com/caroso1222/notyf
 */

class Toast {
  constructor() {
    this.notyf = null;
    this.initialized = false;
  }

  /**
   * Initialize Notyf library
   * Loads CSS and JS from CDN
   */
  async init() {
    if (this.initialized) return;

    return new Promise((resolve, reject) => {
      // Load CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/notyf@3/notyf.min.css';
      document.head.appendChild(link);

      // Load JS
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/notyf@3/notyf.min.js';
      script.onload = () => {
        // Initialize Notyf with custom options
        this.notyf = new window.Notyf({
          duration: 4000,
          position: { x: 'right', y: 'top' },
          dismissible: true,
          ripple: true,
        });
        this.initialized = true;
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load Notyf library'));
      document.head.appendChild(script);
    });
  }

  /**
   * Ensure library is loaded before showing notification
   */
  async ensureInit() {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * Show success notification
   * @param {string} message - Message to display
   */
  async success(message) {
    await this.ensureInit();
    this.notyf.success(message);
  }

  /**
   * Show error notification
   * @param {string} message - Message to display
   */
  async error(message) {
    await this.ensureInit();
    this.notyf.error(message);
  }

  /**
   * Show info notification (custom type)
   * @param {string} message - Message to display
   */
  async info(message) {
    await this.ensureInit();
    this.notyf.open({
      type: 'info',
      message,
      background: '#3b82f6',
      icon: {
        className: 'notyf__icon--info',
        tagName: 'i',
      },
    });
  }

  /**
   * Show warning notification (custom type)
   * @param {string} message - Message to display
   */
  async warning(message) {
    await this.ensureInit();
    this.notyf.open({
      type: 'warning',
      message,
      background: '#f59e0b',
      icon: {
        className: 'notyf__icon--warning',
        tagName: 'i',
      },
    });
  }

  /**
   * Show custom notification
   * @param {Object} options - Custom options for notification
   */
  async custom(options) {
    await this.ensureInit();
    this.notyf.open(options);
  }
}

// Export singleton instance
export const toast = new Toast();

// Initialize on first import
toast.init().catch(console.error);
