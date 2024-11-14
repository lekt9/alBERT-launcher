import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import { parseHTML } from 'linkedom'

interface ExtractedContent {
  title: string | null
  content: string | null
  markdown: string
  textContent: string
  length: number
  excerpt: string | null
  byline: string | null
  siteName: string | null
}

async function extractContentFromUrl(url: string): Promise<ExtractedContent> {
  try {
    // Fetch the webpage content
    const response = await fetch(url)
    const html = await response.text()
    return extractContent(html)
  } catch (error) {
    console.error('Error fetching URL:', error)
    return {
      title: null,
      content: null,
      markdown: '',
      textContent: '',
      length: 0,
      excerpt: null,
      byline: null,
      siteName: null
    }
  }
}

function extractContent(html: string): ExtractedContent {
  try {
    // Parse HTML using linkedom
    const dom = parseHTML(html)
    const document = dom.window.document

    // Remove unnecessary elements
    document.querySelectorAll('script, style, svg').forEach((el) => el.remove())

    // Create a clone for Readability
    const documentClone = document.cloneNode(true)

    // Parse content using Readability
    const reader = new Readability(documentClone)
    const article = reader.parse()

    // Convert HTML to Markdown using Turndown
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      emDelimiter: '_'
    })

    // Add additional Turndown rules if needed
    turndownService.addRule('removeEmptyParagraphs', {
      filter: (node) => {
        return node.nodeName === 'P' && node.textContent.trim() === ''
      },
      replacement: () => ''
    })

    const markdown = article?.content ? turndownService.turndown(article.content) : ''

    return {
      title: article?.title || null,
      content: article?.content || null,
      markdown: markdown,
      textContent: article?.textContent || '',
      length: article?.length || 0,
      excerpt: article?.excerpt || null,
      byline: article?.byline || null,
      siteName: article?.siteName || null
    }
  } catch (error) {
    console.error('Error extracting content:', error)
    return {
      title: null,
      content: null,
      markdown: '',
      textContent: '',
      length: 0,
      excerpt: null,
      byline: null,
      siteName: null
    }
  }
}

export { extractContentFromUrl, extractContent, ExtractedContent }
