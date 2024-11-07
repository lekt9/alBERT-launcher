import * as workers from './worker-management';
import { logger } from './utils/logger';

export const embed = async (text: string): Promise<number[]> => {
  try {
    const vectorizer = await workers.getVectorizer();
    return await vectorizer.vectorize([text]);
  } catch (error) {
    logger.error('Embedding error:', error);
    throw error;
  }
};