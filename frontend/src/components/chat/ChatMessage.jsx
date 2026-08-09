import { useState } from "react"
import { useAuth } from "@clerk/clerk-react"
import {
  Bot,
  Copy,
  Check,
  ExternalLink,
  FileText,
  User,
} from "lucide-react"

import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/message"

import {
  Bubble,
  BubbleContent,
} from "@/components/ui/bubble"

import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"


const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"

function getUniqueCitations(source) {
  if (!source) return []

  const citations = Array.isArray(source) ? source : [source]
  const seen = new Set()

  return citations.filter((citation) => {
    const filename = citation.source || citation.document || "Unknown document"
    const page = citation.page || 1
    const key = `${filename}-${page}`

    if (seen.has(key)) return false

    seen.add(key)
    return true
  })
}

function ChatMessage({ role, content, source }) {
  const { getToken } = useAuth()
  const [copied, setCopied] = useState(false)

  const isUser = role === "user"
  const citations = getUniqueCitations(source)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)

      setTimeout(() => {
        setCopied(false)
      }, 1800)
    } catch (error) {
      console.error("Could not copy message:", error)
    }
  }

  const handleViewPdf = async (citation) => {
    const filename = citation.source || citation.document
    const pageNumber = citation.page || 1

    if (!filename) return

    try {
      const token = await getToken()

      const response = await fetch(
        `${API_BASE_URL}/documents/view/${encodeURIComponent(filename)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error("Could not retrieve document.")
      }

      const blob = await response.blob()
      const documentUrl = URL.createObjectURL(blob)

      window.open(`${documentUrl}#page=${pageNumber}`, "_blank", "noopener,noreferrer")

      setTimeout(() => {
        URL.revokeObjectURL(documentUrl)
      }, 60000)
    } catch (error) {
      console.error("Failed to open PDF:", error)
      alert("Unable to open this policy document. Please try again.")
    }
  }

  return (
    <Message align={isUser ? "end" : "start"}>
      {!isUser && (
        <MessageAvatar>
          <Avatar className="size-8 border bg-primary text-primary-foreground">
            <AvatarFallback className="bg-primary text-primary-foreground">
              <Bot className="size-4" />
            </AvatarFallback>
          </Avatar>
        </MessageAvatar>
      )}

      <MessageContent
        className={isUser ? "items-end" : "items-start"}
      >
        <div className="mb-1 flex items-center gap-2 px-1">
          <p className="text-xs font-medium text-muted-foreground">
            {isUser ? "You" : "HR Assistant"}
          </p>

          {isUser && <User className="size-3 text-muted-foreground" />}
        </div>

        <div className="group max-w-[85vw] sm:max-w-xl">
          <Bubble
            className={
              isUser
                ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground"
                : "rounded-2xl rounded-bl-md border bg-card shadow-sm"
            }
          >
            <BubbleContent className="text-sm leading-6 max-w-full overflow-x-auto">
              <div className="prose dark:prose-invert max-w-none prose-sm prose-p:leading-relaxed prose-pre:my-0 break-words">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              </div>
            </BubbleContent>

          </Bubble>


          {!isUser && (
            <button
              type="button"
              onClick={handleCopy}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100 focus:opacity-100"
            >
              {copied ? (
                <>
                  <Check className="size-3 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="size-3" />
                  Copy answer
                </>
              )}
            </button>
          )}

          {citations.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Sources used
              </p>

              <div className="flex flex-wrap gap-2">
                {citations.map((citation, index) => {
                  const filename =
                    citation.source || citation.document || "Company policy"
                  const page = citation.page || 1

                  return (
                    <button
                      key={`${filename}-${page}-${index}`}
                      type="button"
                      onClick={() => handleViewPdf(citation)}
                      title={`Open ${filename}, page ${page}`}
                      className="group/source inline-flex max-w-full items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-left text-xs transition hover:border-primary/50 hover:bg-primary/5"
                    >
                      <FileText className="size-3.5 shrink-0 text-primary" />

                      <span className="max-w-64 truncate font-medium text-foreground">
                        {filename}
                      </span>


                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        Page {page}
                      </span>

                      <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 transition group-hover/source:opacity-100" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </MessageContent>
    </Message>
  )
}

export default ChatMessage