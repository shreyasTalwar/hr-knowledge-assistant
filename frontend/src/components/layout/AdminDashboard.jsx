import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@clerk/clerk-react"
import {
  AlertCircle,
  CheckCircle2,
  CloudUpload,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"

const MAX_FILE_SIZE = 10 * 1024 * 1024

function formatDate(dateValue) {
  if (!dateValue) return "—"

  const date = new Date(dateValue)

  if (Number.isNaN(date.getTime())) {
    return dateValue
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date)
}

function formatFileSize(size) {
  if (!size) return "—"

  if (typeof size === "string") return size

  const units = ["B", "KB", "MB", "GB"]
  const index = Math.floor(Math.log(size) / Math.log(1024))
  const value = size / 1024 ** index

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function DocumentStatus({ status }) {
  const normalizedStatus = status?.toLowerCase()

  const statusConfig = {
    indexed: {
      label: "Indexed",
      icon: CheckCircle2,
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400",
    },
    processing: {
      label: "Processing",
      icon: RefreshCw,
      className:
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400",
    },
    failed: {
      label: "Failed",
      icon: AlertCircle,
      className:
        "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400",
    },
  }

  const config = statusConfig[normalizedStatus] || {
    label: status || "Unknown",
    icon: AlertCircle,
    className: "border-border bg-muted text-muted-foreground",
  }

  const Icon = config.icon

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", config.className)}
    >
      <Icon
        className={cn(
          "size-3",
          normalizedStatus === "processing" && "animate-spin"
        )}
      />
      {config.label}
    </Badge>
  )
}

function AdminDashboard() {
  const { getToken } = useAuth()
  const fileInputRef = useRef(null)

  const [documents, setDocuments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [uploadingFileName, setUploadingFileName] = useState(null)

  const [documentToDelete, setDocumentToDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchDocuments = useCallback(
    async (showRefreshLoader = false) => {
      try {
        if (showRefreshLoader) setIsRefreshing(true)

        const token = await getToken()

        if (!token) {
          throw new Error("Your session token is unavailable. Please sign in again.")
        }

        const response = await fetch(`${API_BASE_URL}/admin/documents`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          throw new Error("Failed to fetch documents from the server.")
        }

        const data = await response.json()

        setDocuments(Array.isArray(data) ? data : [])
        setError(null)
      } catch (err) {
        console.error("Failed to load documents:", err)
        setError(err.message || "Failed to load the documents catalog.")
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [getToken]
  )

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  useEffect(() => {
    const hasProcessingDocuments = documents.some(
      (document) => document.status === "processing"
    )

    if (!hasProcessingDocuments) return

    const interval = setInterval(() => {
      fetchDocuments()
    }, 3000)

    return () => clearInterval(interval)
  }, [documents, fetchDocuments])

  const validateAndUpload = (file) => {
    if (!file) return

    if (file.type !== "application/pdf") {
      setError("Only PDF files can be uploaded to the policy knowledge base.")
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("This file is too large. Please upload a PDF smaller than 10 MB.")
      return
    }

    uploadFile(file)
  }

  const handleDragOver = (event) => {
    event.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (event) => {
    event.preventDefault()

    if (event.currentTarget === event.target) {
      setIsDragging(false)
    }
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)

    const file = event.dataTransfer.files?.[0]
    validateAndUpload(file)
  }

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    validateAndUpload(file)

    // Allows selecting the same file again after a failed upload.
    event.target.value = ""
  }

  const uploadFile = async (file) => {
    setError(null)
    setUploadingFileName(file.name)
    setUploadProgress(10)

    let progressInterval

    try {
      const token = await getToken()

      if (!token) {
        throw new Error("Your session token is unavailable. Please sign in again.")
      }

      const formData = new FormData()
      formData.append("file", file)

      progressInterval = setInterval(() => {
        setUploadProgress((previous) => {
          if (previous >= 85) return 85
          return previous + 5
        })
      }, 180)

      const response = await fetch(`${API_BASE_URL}/admin/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      clearInterval(progressInterval)
      setUploadProgress(100)

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)

        throw new Error(errorData?.error || "Document upload failed.")
      }

      await new Promise((resolve) => setTimeout(resolve, 450))
      await fetchDocuments()
    } catch (err) {
      console.error("Upload failed:", err)
      setError(err.message || "Failed to upload this document.")
    } finally {
      if (progressInterval) clearInterval(progressInterval)

      setTimeout(() => {
        setUploadProgress(null)
        setUploadingFileName(null)
      }, 500)
    }
  }

  const handleDelete = async () => {
    if (!documentToDelete) return

    try {
      setIsDeleting(true)
      setError(null)

      const token = await getToken()

      const response = await fetch(
        `${API_BASE_URL}/admin/documents/${documentToDelete.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)

        throw new Error(errorData?.error || "Document deletion failed.")
      }

      setDocuments((previousDocuments) =>
        previousDocuments.filter(
          (document) => document.id !== documentToDelete.id
        )
      )

      setDocumentToDelete(null)
    } catch (err) {
      console.error("Delete failed:", err)
      setError(err.message || "Failed to delete this document.")
    } finally {
      setIsDeleting(false)
    }
  }

  const indexedCount = documents.filter(
    (document) => document.status === "indexed"
  ).length

  const processingCount = documents.filter(
    (document) => document.status === "processing"
  ).length

  return (
    <div className="h-full overflow-y-auto bg-muted/20">
      <div className="mx-auto w-full max-w-7xl space-y-6 p-5 md:p-8">
        {/* Header */}
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
                <ShieldCheck className="size-4" />
              </div>

              <Badge variant="secondary" className="text-[10px]">
                Admin workspace
              </Badge>
            </div>

            <h1 className="text-2xl font-bold tracking-tight">
              Document management
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Upload HR policies and manage the assistant’s knowledge base.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={() => fetchDocuments(true)}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw
              className={cn("size-4", isRefreshing && "animate-spin")}
            />
            Refresh catalog
          </Button>
        </header>

        {/* Statistics */}
        <section className="grid gap-4 sm:grid-cols-3">
          <Card className="shadow-sm">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Total documents
                </p>
                <p className="mt-1 text-2xl font-bold">{documents.length}</p>
              </div>

              <div className="rounded-xl bg-primary/10 p-3 text-primary">
                <FileText className="size-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Ready for search
                </p>
                <p className="mt-1 text-2xl font-bold">{indexedCount}</p>
              </div>

              <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-600">
                <CheckCircle2 className="size-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Being processed
                </p>
                <p className="mt-1 text-2xl font-bold">{processingCount}</p>
              </div>

              <div className="rounded-xl bg-amber-500/10 p-3 text-amber-600">
                <Loader2
                  className={cn(
                    "size-5",
                    processingCount > 0 && "animate-spin"
                  )}
                />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Error feedback */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />

            <AlertTitle>Something went wrong</AlertTitle>

            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{error}</span>

              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
              >
                <X className="size-4" />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Upload panel */}
          <Card className="h-fit lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CloudUpload className="size-5 text-primary" />
                Upload policy document
              </CardTitle>

              <p className="text-sm text-muted-foreground">
                The file will be processed and added to the assistant’s search
                index.
              </p>
            </CardHeader>

            <CardContent>
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    fileInputRef.current?.click()
                  }
                }}
                className={cn(
                  "flex min-h-60 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition",
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/30",
                  uploadProgress !== null && "pointer-events-none opacity-70"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />

                <div
                  className={cn(
                    "mb-4 grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground transition",
                    isDragging && "bg-primary/10 text-primary"
                  )}
                >
                  <UploadCloud className="size-7" />
                </div>

                <h3 className="text-sm font-semibold">
                  Drop your policy PDF here
                </h3>

                <p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">
                  Drag and drop a PDF, or click here to browse your device.
                </p>

                <Badge variant="secondary" className="mt-4 text-[10px]">
                  PDF only · Maximum 10 MB
                </Badge>
              </div>

              {uploadProgress !== null && (
                <div className="mt-5 rounded-xl border bg-muted/30 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Loader2 className="size-4 shrink-0 animate-spin text-primary" />

                      <p className="truncate text-xs font-medium">
                        {uploadingFileName || "Uploading document"}
                      </p>
                    </div>

                    <span className="text-xs font-semibold text-primary">
                      {uploadProgress}%
                    </span>
                  </div>

                  <Progress value={uploadProgress} className="h-2" />

                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Uploading and preparing your document for indexing.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Documents table */}
          <Card className="overflow-hidden lg:col-span-3">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Document catalog</CardTitle>

                <p className="mt-1 text-sm text-muted-foreground">
                  Track upload and indexing status.
                </p>
              </div>

              <Badge variant="outline">
                {documents.length} total
              </Badge>
            </CardHeader>

            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="min-w-56">Document</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-16 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {isLoading &&
                      Array.from({ length: 5 }).map((_, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Skeleton className="size-8 rounded-lg" />
                              <Skeleton className="h-4 w-40" />
                            </div>
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-12" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-20" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-6 w-20 rounded-full" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="ml-auto size-8 rounded-md" />
                          </TableCell>
                        </TableRow>
                      ))}

                    {!isLoading && documents.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-80">
                          <div className="flex flex-col items-center justify-center text-center">
                            <div className="mb-4 grid size-12 place-items-center rounded-full bg-muted">
                              <FolderOpen className="size-6 text-muted-foreground" />
                            </div>

                            <p className="text-sm font-semibold">
                              No policy documents yet
                            </p>

                            <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
                              Upload your first company policy PDF to make it
                              available to the HR assistant.
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}

                    {!isLoading &&
                      documents.map((document) => (
                        <TableRow key={document.id}>
                          <TableCell>
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                                <FileText className="size-4" />
                              </div>

                              <div className="min-w-0">
                                <p
                                  title={document.name}
                                  className="max-w-52 truncate text-sm font-medium"
                                >
                                  {document.name}
                                </p>

                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  PDF policy document
                                </p>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="text-xs text-muted-foreground">
                            {formatFileSize(document.size)}
                          </TableCell>

                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(
                              document.uploadedAt || document.created_at
                            )}
                          </TableCell>

                          <TableCell>
                            <DocumentStatus status={document.status} />
                          </TableCell>

                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setDocumentToDelete(document)}
                              className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              title={`Delete ${document.name}`}
                              aria-label={`Delete ${document.name}`}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog
        open={Boolean(documentToDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDocumentToDelete(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mb-2 grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
              <Trash2 className="size-5" />
            </div>

            <AlertDialogTitle>Delete this document?</AlertDialogTitle>

            <AlertDialogDescription>
              <span className="font-medium text-foreground">
                {documentToDelete?.name}
              </span>{" "}
              will be permanently removed from the document catalog and knowledge
              base. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancel
            </AlertDialogCancel>

            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete document"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default AdminDashboard
