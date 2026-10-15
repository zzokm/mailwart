import "server-only"

import { promises as fs } from "node:fs"
import path from "node:path"

import {
  DOCS_REGISTRY,
  slugify,
  type DocMetadata,
  type TocItem,
} from "./docs-config"

export * from "./docs-config"

export interface DocPageData extends DocMetadata {
  content: string
  toc: TocItem[]
  prev?: { slug: string; title: string }
  next?: { slug: string; title: string }
}

export function extractToc(content: string): TocItem[] {
  const lines = content.split("\n")
  const toc: TocItem[] = []

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)$/)
    if (h2Match) {
      const rawText = h2Match[1].trim()
      const cleanText = rawText.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      toc.push({
        id: slugify(cleanText),
        text: cleanText,
        level: 2,
      })
      continue
    }

    const h3Match = line.match(/^###\s+(.+)$/)
    if (h3Match) {
      const rawText = h3Match[1].trim()
      const cleanText = rawText.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      toc.push({
        id: slugify(cleanText),
        text: cleanText,
        level: 3,
      })
    }
  }

  return toc
}

export async function getDocBySlug(slug: string): Promise<DocPageData | null> {
  const index = DOCS_REGISTRY.findIndex((item) => item.slug === slug)
  if (index === -1) return null

  const item = DOCS_REGISTRY[index]
  const filePath = path.join(process.cwd(), "docs", item.filename)

  try {
    const rawContent = await fs.readFile(filePath, "utf-8")
    const toc = extractToc(rawContent)

    const prev =
      index > 0
        ? {
            slug: DOCS_REGISTRY[index - 1].slug,
            title: DOCS_REGISTRY[index - 1].title,
          }
        : undefined
    const next =
      index < DOCS_REGISTRY.length - 1
        ? {
            slug: DOCS_REGISTRY[index + 1].slug,
            title: DOCS_REGISTRY[index + 1].title,
          }
        : undefined

    return {
      ...item,
      content: rawContent,
      toc,
      prev,
      next,
    }
  } catch (err) {
    console.error(`Failed to read doc file at ${filePath}:`, err)
    return null
  }
}
