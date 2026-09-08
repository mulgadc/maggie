import { createContext, type ReactNode, useContext } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"

// Tracks whether the current <code> is nested inside <pre> so fenced code
// blocks render raw while inline code keeps its chip styling.
const InPreContext = createContext(false)

// Headings sit inside a drawer field, so they stay below the field label
// (muted uppercase) in the hierarchy: brighter but normal case.
const HEADING1 = "mt-4 mb-1 first:mt-0 font-semibold text-text text-sm"
const HEADING2 = "mt-3 mb-1 first:mt-0 font-semibold text-text/80 text-xs"

// Fenced blocks render raw; inline code keeps the chip styling.
function CodeSpan({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  const inPre = useContext(InPreContext)
  if (inPre) {
    return <code className={className}>{children}</code>
  }
  return (
    <code className="rounded bg-surface2 px-1 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  )
}

const components: Components = {
  h1: ({ children }) => <h1 className={HEADING1}>{children}</h1>,
  h2: ({ children }) => <h2 className={HEADING1}>{children}</h2>,
  h3: ({ children }) => <h3 className={HEADING2}>{children}</h3>,
  h4: ({ children }) => <h4 className={HEADING2}>{children}</h4>,
  h5: ({ children }) => <h5 className={HEADING2}>{children}</h5>,
  h6: ({ children }) => <h6 className={HEADING2}>{children}</h6>,
  p: ({ children }) => <p className="mb-2 break-words last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-0.5 pl-4 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-0.5 pl-4 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="marker:text-muted">{children}</li>,
  pre: ({ children }) => (
    <InPreContext.Provider value={true}>
      <pre className="mb-2 overflow-x-auto rounded-md border border-line bg-bg p-2 font-mono text-xs">
        {children}
      </pre>
    </InPreContext.Provider>
  ),
  code: CodeSpan,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent underline underline-offset-2"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-line pl-3 text-muted">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <table className="mb-2 w-full border-collapse text-xs">{children}</table>
  ),
  th: ({ children }) => (
    <th className="border border-line px-1.5 py-1 text-left">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-line px-1.5 py-1 text-left">{children}</td>
  ),
  hr: () => <hr className="my-3 border-line" />,
  input: (props) =>
    props.type === "checkbox" ? (
      <input {...props} disabled className="mr-1 align-middle" />
    ) : (
      <input {...props} />
    ),
}

// Markdown renders untrusted bead text (descriptions, comments, notes) as
// formatted content. Raw HTML is never parsed — only remark-gfm's markdown.
export function Markdown({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed break-words text-text/90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
