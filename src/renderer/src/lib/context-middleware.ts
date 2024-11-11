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
      // Return updated params with messages
      return {
        ...params
      };
    }
  };
}; 