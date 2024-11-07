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

${context}`
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