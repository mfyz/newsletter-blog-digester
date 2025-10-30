import OpenAI from 'openai';
import * as db from './db.js';

/**
 * Wrapper class for OpenAI client to make it easier to test
 */
export class OpenAIClient {
  constructor() {
    const apiKey = db.getConfig('openai_api_key');
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const baseURL = db.getConfig('openai_base_url') || 'https://api.openai.com/v1';
    this.client = new OpenAI({ apiKey, baseURL });
    this.model = db.getConfig('openai_model') || 'gpt-3.5-turbo';
  }

  /**
   * Create a chat completion
   */
  async createChatCompletion(messages, options = {}) {
    const response = await this.client.chat.completions.create({
      model: options.model || this.model,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.max_tokens,
    });

    return response.choices[0].message.content;
  }
}
