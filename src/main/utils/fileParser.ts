import { OfficeParserConfig, parseOfficeAsync } from 'officeparser';
import fs from 'fs/promises';
import path from 'path';

/**
 * Parses different types of files and returns their content as a string
 * @param filePath Path to the file to be parsed
 * @returns Promise containing the file content as string
 */
export async function parseFile(filePath: string): Promise<string> {
  const extension = path.extname(filePath).toLowerCase();
  const officeExtensions = ['.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp', '.pdf'];
  
  try {
    if (officeExtensions.includes(extension)) {
      const config: OfficeParserConfig = {
        newlineDelimiter: " ",
        ignoreNotes: true
      };
      return await parseOfficeAsync(filePath, config);
    } else if (extension === '.txt' || extension === '.md' || extension === '.json') {
      return await fs.readFile(filePath, 'utf-8');
    } else {
      console.warn(`Unsupported file type: ${extension}`);
      return '';
    }
  } catch (error) {
    console.error(`Error parsing file ${filePath}:`, error);
    throw error;
  }
} 