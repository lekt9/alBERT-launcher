import type { 
  Experimental_LanguageModelV1Middleware as LanguageModelV1Middleware 
} from "ai";

interface ContextMiddlewareOptions {
  getContext: () => string;
}

export const createContextMiddleware = (
  options: ContextMiddlewareOptions
): LanguageModelV1Middleware => {
  return {
    transformParams: async ({ params }) => {
      // Get current context
      const context = options.getContext();
      
      // Create system message with context
      const messages = [
        {
          role: 'system',
          content: `You are a helpful AI assistant. Use the following context to answer questions:

${context}

Make sure you respond in a punchy manner that is concise and to the point without unnecessary fluff, and use markdown to format your message well!`
        },
        {
          role: 'user',
          content: params.prompt
        }
      ];

      // Return updated params with messages
      return {
        ...params,
        messages
      };
    }
  };
}; 