'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeHighlight from 'rehype-highlight'
import { ArchitectureDiagram } from './ArchitectureDiagram'
import { Callout } from './Callout'

interface Props {
  content: string
  className?: string
}

export function MarkdownSection({ content, className = '' }: Props) {
  return (
    <div className={`prose prose-banzami max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeHighlight]}
        components={{
          // Render blockquotes as styled callout boxes
          blockquote({ children }) {
            return <Callout>{children}</Callout>
          },
          // Detect ASCII diagrams in code blocks and render with ArchitectureDiagram
          code({ className: cls, children, ...props }) {
            const isBlock = !props.hasOwnProperty('inline')
            const content = String(children).trim()
            const isAsciiDiagram =
              isBlock &&
              !cls &&
              (content.includes('──') ||
                content.includes('↓') ||
                content.includes('→') ||
                content.includes('┌') ||
                content.includes('│') ||
                content.includes('└'))

            if (isAsciiDiagram) {
              return <ArchitectureDiagram>{content}</ArchitectureDiagram>
            }

            return (
              <code className={cls} {...props}>
                {children}
              </code>
            )
          },
          // Section headings get anchor IDs for deep linking
          h2({ children }) {
            const id = String(children)
              .toLowerCase()
              .replace(/[^a-z0-9\s]/g, '')
              .trim()
              .replace(/\s+/g, '-')
            return (
              <h2 id={id} className="scroll-mt-20">
                {children}
              </h2>
            )
          },
          h3({ children }) {
            const id = String(children)
              .toLowerCase()
              .replace(/[^a-z0-9\s.]/g, '')
              .trim()
              .replace(/\s+/g, '-')
            return (
              <h3 id={id} className="scroll-mt-20">
                {children}
              </h3>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
