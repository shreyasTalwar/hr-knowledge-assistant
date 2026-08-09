import { useCallback, useEffect, useState } from "react"
import { UserButton, useAuth, useUser } from "@clerk/clerk-react"
import {
  FileText,
  FolderOpen,
  Moon,
  RefreshCw,
  Shield,
  ShieldCheck,
  Sun,
  User,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"

function Sidebar({ activeRole, setActiveRole, theme, setTheme }) {
  const { user } = useUser()
  const { getToken } = useAuth()

  const [documents, setDocuments] = useState([])
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const isAdmin =
    user?.publicMetadata?.role === "admin" ||
    user?.primaryEmailAddress?.emailAddress ===
      "shreyastalwar334@gmail.com"

  const userInitial =
    user?.firstName?.charAt(0)?.toUpperCase() ||
    user?.primaryEmailAddress?.emailAddress?.charAt(0)?.toUpperCase() ||
    "U"

  const fetchDocuments = useCallback(
    async (showRefreshState = false) => {
      try {
        if (showRefreshState) setIsRefreshing(true)

        const token = await getToken()
        if (!token) return

        const response = await fetch(`${API_BASE_URL}/admin/documents`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          throw new Error("Failed to load indexed documents")
        }

        const data = await response.json()

        const indexedDocuments = data
          .filter((document) => document.status === "indexed")
          .map((document) => ({
            id: document.id || document.name,
            name: document.name,
            type: "Indexed policy",
            pages: document.pages,
          }))

        setDocuments(indexedDocuments)
      } catch (error) {
        console.error("Failed to load documents for sidebar:", error)
      } finally {
        setIsLoadingDocuments(false)
        setIsRefreshing(false)
      }
    },
    [getToken]
  )

  useEffect(() => {
    fetchDocuments()

    const interval = setInterval(() => {
      fetchDocuments()
    }, 10000)

    return () => clearInterval(interval)
  }, [fetchDocuments])

  return (
    <aside className="flex h-screen w-80 shrink-0 flex-col border-r bg-background">
      {/* Brand and profile area */}
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ShieldCheck className="size-5" />
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-tight">
                HR Core
              </h1>

              <p className="truncate text-xs text-muted-foreground">
                Knowledge Hub
              </p>
            </div>
          </div>

          <UserButton afterSignOutUrl="/" />
        </div>
      </div>

      <Separator />

      {/* Current signed-in user */}
      <div className="px-4 py-4">
        <Card className="border-none bg-muted/45 shadow-none">
          <CardContent className="flex items-center gap-3 p-3">
            <Avatar className="size-9 border">
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {userInitial}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">
                {user?.fullName || "Signed-in user"}
              </p>

              <p className="truncate text-[11px] text-muted-foreground">
                {user?.primaryEmailAddress?.emailAddress}
              </p>
            </div>

            {isAdmin && (
              <Badge
                variant="secondary"
                className="border border-primary/15 bg-primary/10 text-[10px] text-primary"
              >
                Admin
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Indexed documents */}
      <div className="flex min-h-0 flex-1 flex-col px-4 py-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Policy documents</h2>

            <p className="mt-0.5 text-xs text-muted-foreground">
              {documents.length} indexed document
              {documents.length === 1 ? "" : "s"}
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fetchDocuments(true)}
            disabled={isRefreshing}
            className="size-8"
            aria-label="Refresh documents"
          >
            <RefreshCw
              className={cn("size-4", isRefreshing && "animate-spin")}
            />
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1 pr-3">
          <div className="space-y-2">
            {isLoadingDocuments &&
              Array.from({ length: 4 }).map((_, index) => (
                <Card key={index} className="shadow-none">
                  <CardContent className="flex items-center gap-3 p-3">
                    <Skeleton className="size-9 rounded-lg" />

                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-4/5" />
                      <Skeleton className="h-2.5 w-2/5" />
                    </div>
                  </CardContent>
                </Card>
              ))}

            {!isLoadingDocuments && documents.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-10 text-center">
                <div className="mb-3 grid size-10 place-items-center rounded-full bg-muted">
                  <FolderOpen className="size-5 text-muted-foreground" />
                </div>

                <p className="text-xs font-medium">No policies available</p>

                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  Indexed company documents will appear here.
                </p>
              </div>
            )}

            {!isLoadingDocuments &&
              documents.map((document) => (
                <Card
                  key={document.id}
                  className="group cursor-default border-transparent bg-muted/40 shadow-none transition-colors hover:border-border hover:bg-muted/70"
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="size-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        title={document.name}
                        className="truncate text-xs font-medium"
                      >
                        {document.name}
                      </p>

                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-emerald-500" />

                        <p className="text-[10px] text-muted-foreground">
                          {document.type}
                          {document.pages
                            ? ` · ${document.pages} pages`
                            : ""}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </ScrollArea>
      </div>

      <Separator />

      {/* Footer controls */}
      <div className="space-y-5 p-4">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Appearance
            </h2>

            <Badge variant="outline" className="text-[10px]">
              {theme === "dark" ? "Dark" : "Light"}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={theme === "light" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setTheme("light")}
              className={cn(
                "justify-center gap-2 text-xs",
                theme === "light" &&
                  "border border-primary/15 bg-primary/10 text-primary hover:bg-primary/15"
              )}
            >
              <Sun className="size-3.5" />
              Light
            </Button>

            <Button
              type="button"
              variant={theme === "dark" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setTheme("dark")}
              className={cn(
                "justify-center gap-2 text-xs",
                theme === "dark" &&
                  "border border-primary/15 bg-primary/10 text-primary hover:bg-primary/15"
              )}
            >
              <Moon className="size-3.5" />
              Dark
            </Button>
          </div>
        </section>

        {isAdmin && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Workspace view
              </h2>

              <Shield className="size-3.5 text-primary" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={activeRole === "employee" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveRole("employee")}
                className="gap-1.5 text-xs"
              >
                <User className="size-3.5" />
                Employee
              </Button>

              <Button
                type="button"
                variant={activeRole === "admin" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveRole("admin")}
                className="gap-1.5 text-xs"
              >
                <Shield className="size-3.5" />
                Admin
              </Button>
            </div>
          </section>
        )}
      </div>
    </aside>
  )
}

export default Sidebar