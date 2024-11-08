import { OfficeParserConfig, parseOfficeAsync } from 'officeparser'
import fs from 'fs/promises'
import path from 'path'
import { extractContentFromUrl } from './markdown'
import log from '../logger'

/**
 * Reads content from different sources (files or URLs) and returns their content as a string
 * @param source Path to the file or URL to be read
 * @returns Promise containing the content as string
 */
export async function readContent(source: string): Promise<string> {
  // Check if the source is a URL
  try {
    const url = new URL(source)
    return await readWebContent(url.toString())
  } catch {
    // If URL parsing fails, treat as file path
    return await readFileContent(source)
  }
}

/**
 * Reads content from web URLs
 * @param url URL to read from
 * @returns Promise containing the webpage content as string
 */
async function readWebContent(url: string): Promise<string> {
  try {
    const content = await extractContentFromUrl(url)
    return content.markdown
  } catch (error) {
    log.error(`Error reading web content from ${url}:`, error)
    throw error
  }
}

/**
 * Reads content from local files
 * @param filePath Path to the file to be read
 * @returns Promise containing the file content as string
 */
async function readFileContent(filePath: string): Promise<string> {
  const extension = path.extname(filePath).toLowerCase()
  const officeExtensions = ['.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp', '.pdf']

  try {
    if (officeExtensions.includes(extension)) {
      const config: OfficeParserConfig = {
        newlineDelimiter: ' ',
        ignoreNotes: true
      }
      return await parseOfficeAsync(filePath, config)
    } else if (extension === '.txt' || extension === '.md' || extension === '.json') {
      return await fs.readFile(filePath, 'utf-8')
    } else {
      log.warn(`Unsupported file type: ${extension}`)
      return ''
    }
  } catch (error) {
    log.error(`Error reading file ${filePath}:`, error)
    throw error
  }
}
