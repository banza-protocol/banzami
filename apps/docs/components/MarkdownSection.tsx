'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { ReactElement } from 'react'
import { ArchitectureDiagram } from './ArchitectureDiagram'
import { Callout } from './Callout'

interface Props {
  content: string
  className?: string
}

function isAsciiDiagram(text: string): boolean {
  return (
    text.includes('──') ||
    text.includes('↓') ||
    text.includes('→') ||
    text.includes('↗') ||
    text.includes('┌') ||
    text.includes('│') ||
    text.includes('└') ||
    text.includes('▶') ||
    (text.includes('←') && text.includes('─'))
  )
}

function toAnchorId(text: string): string {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

// Extract text content from a react-markdown code child
function extractCodeChild(children: React.ReactNode): { text: string; lang: string | undefined } {
  const child = Array.isArray(children) ? children[0] : children
  if (child && typeof child === 'object' && 'props' in child) {
    const el = child as ReactElement<{ children?: React.ReactNode; className?: string }>
    const text = String(el.props.children ?? '').trim()
    const lang = el.props.className?.replace('language-', '') || undefined
    return { text, lang }
  }
  return { text: '', lang: undefined }
}

export function MarkdownSection({ content, className = '' }: Props) {
  return (
    <div className={`prose prose-banzami max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // ── Block code: handled at the <pre> level (correct HTML nesting) ──
          // Never return <pre> from the code component — that causes
          // <p><pre> which is invalid HTML and triggers a hydration error.
          pre({ children }) {
            const { text, lang } = extractCodeChild(children)

            // Un-classified code blocks that look like ASCII diagrams → visual component
            if (!lang && text && isAsciiDiagram(text)) {
              return <ArchitectureDiagram>{text}</ArchitectureDiagram>
            }

            // Everything else → standard pre (prose styles apply)
            return <pre>{children}</pre>
          },

          // ── Inline code only — no pre wrapping here ─────────────────────
          code({ className: cls, children, ...rest }) {
            return (
              <code className={cls} {...rest}>
                {children}
              </code>
            )
          },

          // ── Blockquotes → premium Callout ────────────────────────────────
          blockquote({ children }) {
            return <Callout>{children}</Callout>
          },

          // ── Anchored headings for deep linking ───────────────────────────
          h2({ children }) {
            const id = toAnchorId(String(children))
            return (
              <h2 id={id} className="group scroll-mt-24">
                <a href={`#${id}`} className="no-underline">{children}</a>
              </h2>
            )
          },
          h3({ children }) {
            const id = toAnchorId(String(children))
            return (
              <h3 id={id} className="group scroll-mt-24">
                <a href={`#${id}`} className="no-underline">{children}</a>
              </h3>
            )
          },

          // ── Scrollable tables on mobile ──────────────────────────────────
          table({ children }) {
            return (
              <div className="overflow-x-auto">
                <table>{children}</table>
              </div>
            )
          },

          // ── External links → new tab ─────────────────────────────────────
          a({ href, children, ...rest }) {
            const isExternal = href?.startsWith('http')
            return (
              <a
                href={href}
                {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                {...rest}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
