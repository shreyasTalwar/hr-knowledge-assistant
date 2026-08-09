import { useRef, useState } from "react"
import { ArrowUp, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

function ChatInput({ onSend, isLoading }) {
  const [message, setMessage] = useState("")
  const textareaRef = useRef(null)

  const submitMessage = () => {
    const trimmedMessage = message.trim()

    if (!trimmedMessage || isLoading) return

    onSend(trimmedMessage)
    setMessage("")

    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    submitMessage()
  }

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      submitMessage()
    }
  }

  return (
    <footer className="shrink-0 border-t bg-background/95 px-4 py-3 backdrop-blur md:px-6 md:py-4">
      <form onSubmit={handleSubmit} className="mx-auto max-w-5xl">
        <div className="rounded-2xl border bg-background p-2 shadow-sm transition focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15">
          <Textarea
            ref={textareaRef}
            value={message}
            disabled={isLoading}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about leave, benefits, attendance, or any company policy…"
            rows={1}
            className="max-h-32 min-h-11 resize-none border-0 bg-transparent px-3 py-2 text-sm shadow-none focus-visible:ring-0"
          />

          <div className="flex items-center justify-between gap-3 px-2 pb-1">
            <p className="hidden text-[11px] text-muted-foreground sm:block">
              Press Enter to send · Shift + Enter for a new line
            </p>

            <p className="text-[11px] text-muted-foreground sm:hidden">
              Shift + Enter for new line
            </p>

            <Button
              type="submit"
              size="icon"
              disabled={!message.trim() || isLoading}
              className="size-8 rounded-lg"
              aria-label="Send message"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </Button>
          </div>
        </div>

        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Answers are generated from uploaded company policy documents.
        </p>
      </form>
    </footer>
  )
}

export default ChatInput