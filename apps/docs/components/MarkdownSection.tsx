'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
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

export function MarkdownSection({ content, className = '' }: Props) {
  return (
    <div className={`prose prose-banzami max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // Blockquotes → premium Callout
          blockquote({ children }) {
            return <Callout>{children}</Callout>
          },

          // Code blocks: detect ASCII diagrams, otherwise styled code
          code({ className: cls, children, ...props }) {
            const text = String(children).trim()
            const isBlock = !Object.prototype.hasOwnProperty.call(props, 'inline')

            if (isBlock && !cls && isAsciiDiagram(text)) {
              return <ArchitectureDiagram>{text}</ArchitectureDiagram>
            }

            if (isBlock) {
              // Fenced code block with language
              const lang = cls?.replace('language-', '') ?? ''
              return (
                <pre className={`language-${lang}`}>
                  <code className={cls} {...props}>{children}</code>
                </pre>
              )
            }

            // Inline code
            return (
              <code className={cls} {...props}>
                {children}
              </code>
            )
          },

          // Anchored headings for deep linking
          h2({ children }) {
            const id = toAnchorId(String(children))
            return (
              <h2 id={id} className="group scroll-mt-24">
                <a href={`#${id}`} className="no-underline">
                  {children}
                </a>
              </h2>
            )
          },
          h3({ children }) {
            const id = toAnchorId(String(children))
            return (
              <h3 id={id} className="group scroll-mt-24">
                <a href={`#${id}`} className="no-underline">
                  {children}
                </a>
              </h3>
            )
          },

          // Tables with better styling
          table({ children }) {
            return (
              <div className="overflow-x-auto">
                <table>{children}</table>
              </div>
            )
          },

          // External links open in new tab
          a({ href, children, ...props }) {
            const isExternal = href?.startsWith('http')
            return (
              <a
                href={href}
                {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                {...props}
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
