import { useState } from "react"
import { useAuth } from "@clerk/clerk-react"
import {
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
} from "@/components/ui/message-scroller"

import {
  Marker,
  MarkerIcon,
  MarkerContent,
} from "@/components/ui/marker"

import ChatMessage from "./ChatMessage"
import ChatInput from "./ChatInput"

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"

const SUGGESTED_QUESTIONS = [
  "How many annual leave days do I get?",
  "What is the remote-work policy?",
  "Explain the probation period.",
  "What is the attendance policy?",
]

const initialMessages = [
  {
    id: "welcome-message",
    role: "assistant",
    content:
      "Hello! I’m your HR Knowledge Assistant. I can help you understand company policies, leave rules, benefits, attendance, and workplace guidelines. What would you like to know?",
  },
]

import { useEffect } from "react"

function Chat() {
  const { getToken } = useAuth()
  const [isSearching, setIsSearching] = useState(false)
  const [messages, setMessages] = useState(initialMessages)

  // Fetch chat history from SQLite backend on mount
  useEffect(() => {
    let active = true
    const fetchChatHistory = async () => {
      try {
        const token = await getToken()
        if (!token) return
        
        const response = await fetch(`${API_BASE_URL}/employee/chat`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
        if (response.ok && active) {
          const data = await response.json()
          if (data.length > 0) {
            setMessages(data)
          } else {
            setMessages(initialMessages)
          }
        }
      } catch (err) {
        console.error("Failed to load chat history from SQLite:", err)
      }
    }
    fetchChatHistory()
    return () => { active = false }
  }, [getToken])


  // Clear chat history inside SQLite backend
  const handleClearHistory = async () => {
    try {
      const token = await getToken()
      if (!token) return
      const response = await fetch(`${API_BASE_URL}/employee/chat`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      if (response.ok) {
        setMessages(initialMessages)
      }
    } catch (err) {
      console.error("Failed to clear chat history from SQLite:", err)
    }
  }



  const handleSend = async (message) => {
    const trimmedMessage = message.trim()

    if (!trimmedMessage || isSearching) return

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedMessage,
    }

    setMessages((previous) => [...previous, userMessage])
    setIsSearching(true)

    try {
      const token = await getToken()

      const response = await fetch(`${API_BASE_URL}/employee/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question: trimmedMessage,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)

        throw new Error(
          errorData?.message ||
            "Unable to retrieve an answer from the company documents."
        )
      }

      const data = await response.json()

      const assistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          data.answer ||
          "I could not find a clear answer in the uploaded company policies.",
        source: data.citations || [],
      }

      setMessages((previous) => [...previous, assistantMessage])
    } catch (error) {
      console.error("Chat request failed:", error)

      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "Sorry, I could not search the company documents right now. Please check your connection and try again.",
        },
      ])
    } finally {
      setIsSearching(false)
    }
  }

  const showSuggestions = messages.length === 1 && !isSearching

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-background">
      <header className="shrink-0 border-b bg-background/90 px-4 py-4 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="size-5" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold sm:text-base">
                  HR Knowledge Assistant
                </h1>

                <span className="hidden items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 sm:inline-flex">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Online
                </span>
              </div>

              <p className="text-xs text-muted-foreground">
                Answers grounded in your company documents
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleClearHistory}
              title="Clear chat history"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-muted text-muted-foreground transition cursor-pointer"
            >
              🗑️ Clear Chat
            </button>
            <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
              <ShieldCheck className="size-4 text-emerald-600" />
              Policy-aware answers
            </div>
          </div>

        </div>
      </header>

      <main className="min-h-0 flex-1">
        <MessageScrollerProvider autoScroll>
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent>
                <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6 md:py-8">
                  {showSuggestions && (
                    <section className="mb-8 rounded-2xl border bg-card p-5 shadow-sm md:p-6">
                      <div className="mb-4 flex items-center gap-2">
                        <FileText className="size-4 text-primary" />
                        <h2 className="text-sm font-semibold">
                          Try asking about
                        </h2>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {SUGGESTED_QUESTIONS.map((question) => (
                          <button
                            key={question}
                            type="button"
                            onClick={() => handleSend(question)}
                            className="rounded-full border bg-background px-3 py-2 text-left text-xs text-muted-foreground transition hover:border-primary hover:bg-primary/5 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  <div className="space-y-6">
                    {messages.map((message) => (
                      <MessageScrollerItem key={message.id}>
                        <ChatMessage
                          role={message.role}
                          content={message.content}
                          source={message.source}
                        />
                      </MessageScrollerItem>
                    ))}

                    {isSearching && (
                      <Marker className="mx-auto w-fit rounded-full border bg-background px-4 py-2 shadow-sm">
                        <MarkerIcon>
                          <Loader2 className="size-4 animate-spin text-primary" />
                        </MarkerIcon>

                        <MarkerContent className="text-xs text-muted-foreground">
                          Searching company policies…
                        </MarkerContent>
                      </Marker>
                    )}
                  </div>
                </div>
              </MessageScrollerContent>
            </MessageScrollerViewport>
          </MessageScroller>
        </MessageScrollerProvider>
      </main>

      <ChatInput onSend={handleSend} isLoading={isSearching} />
    </div>
  )
}

export default Chat