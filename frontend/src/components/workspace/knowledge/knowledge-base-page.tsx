"use client";

import {
  DatabaseIcon,
  EyeIcon,
  FileIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/core/auth/AuthProvider";
import { useI18n } from "@/core/i18n/hooks";
import {
  useDeleteKnowledgeDoc,
  useKnowledgeBases,
  useKnowledgeConfig,
  useKnowledgeDoc,
  useKnowledgeDocs,
  useUploadKnowledgeDoc,
  type KnowledgeBase,
  type KnowledgeDoc,
} from "@/core/knowledge-base";
import { isStaticWebsiteOnly } from "@/core/static-mode";

function collectionNameOf(collection: Partial<KnowledgeBase>) {
  return collection.collection_name ?? collection.name ?? "";
}

const KNOWLEDGE_DOC_NAME_PATTERN = /^[\p{L}\p{N}_.-]{1,255}$/u;
const KNOWLEDGE_PDF_FILE_PATTERN = /\.pdf$/i;

function isValidKnowledgeDocName(value: string) {
  return KNOWLEDGE_DOC_NAME_PATTERN.test(value);
}

function isPdfKnowledgeFile(file: File) {
  return KNOWLEDGE_PDF_FILE_PATTERN.test(file.name);
}

function statusValueToString(value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return undefined;
}

function getDocStatusDisplay(
  doc: KnowledgeDoc,
  labels: {
    deleting: string;
    failed: string;
    processing: string;
    queued: string;
    ready: string;
    unknown: string;
    updating: string;
  },
) {
  const rawProcessStatus = doc.status?.process_status;
  const processStatus =
    typeof rawProcessStatus === "number"
      ? rawProcessStatus
      : typeof rawProcessStatus === "string" &&
          rawProcessStatus.trim().length > 0 &&
          Number.isFinite(Number(rawProcessStatus))
        ? Number(rawProcessStatus)
        : undefined;
  const failedCode = doc.status?.failed_code;
  const failedMessage = doc.status?.failed_msg;
  const failedCodeText = statusValueToString(failedCode);
  const failedMessageText = statusValueToString(failedMessage);
  const hasFailure =
    failedCodeText !== undefined ||
    (failedMessageText !== undefined && failedMessageText.length > 0);

  if (hasFailure) {
    return {
      label: labels.failed,
      variant: "destructive" as const,
      title: [
        failedCodeText ? `code=${failedCodeText}` : null,
        failedMessageText,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }

  if (processStatus === 1) {
    return {
      label: labels.failed,
      variant: "destructive" as const,
    };
  }

  if (processStatus === 0) {
    return {
      className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      label: labels.ready,
      variant: "secondary" as const,
    };
  }

  if (processStatus === 2) {
    return {
      className: "border-sky-500/30 text-sky-700 dark:text-sky-300",
      label: labels.queued,
      variant: "outline" as const,
    };
  }

  if (processStatus === 3) {
    return {
      className: "border-blue-500/30 text-blue-700 dark:text-blue-300",
      label: labels.updating,
      variant: "outline" as const,
    };
  }

  if (processStatus === 5) {
    return {
      className: "border-muted-foreground/30 text-muted-foreground",
      label: labels.deleting,
      variant: "outline" as const,
    };
  }

  if (processStatus === 6) {
    return {
      className: "border-amber-500/30 text-amber-700 dark:text-amber-300",
      label: labels.processing,
      variant: "outline" as const,
    };
  }

  if (
    typeof rawProcessStatus === "number" ||
    typeof rawProcessStatus === "string"
  ) {
    return {
      label: labels.unknown,
      title: `process_status=${rawProcessStatus}`,
      variant: "outline" as const,
    };
  }

  return {
    label: labels.unknown,
    variant: "secondary" as const,
  };
}

function formatBytes(value: number | null | undefined) {
  if (!value) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(value: number | string | null | undefined) {
  if (!value) return "-";
  const numericValue = typeof value === "string" ? Number(value) : value;
  if (Number.isFinite(numericValue)) {
    const ms =
      numericValue > 10_000_000_000 ? numericValue : numericValue * 1000;
    return new Date(ms).toLocaleString();
  }
  return String(value);
}

export function KnowledgeBasePage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const staticMode = isStaticWebsiteOnly();
  const canManageKnowledge = user?.system_role === "admin" && !staticMode;
  const configQuery = useKnowledgeConfig({ enabled: canManageKnowledge });
  const isConfigured = configQuery.data?.configured ?? false;
  const collectionsQuery = useKnowledgeBases({
    enabled: canManageKnowledge && isConfigured,
  });
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null,
  );
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const docsQuery = useKnowledgeDocs(selectedCollection, {
    enabled: canManageKnowledge && isConfigured,
  });
  const detailQuery = useKnowledgeDoc(selectedCollection, selectedDocId, {
    enabled: canManageKnowledge && Boolean(selectedDocId),
  });
  const uploadDoc = useUploadKnowledgeDoc();
  const deleteDoc = useDeleteKnowledgeDoc();

  const collections = useMemo(
    () => collectionsQuery.data ?? [],
    [collectionsQuery.data],
  );
  const docs = useMemo(() => docsQuery.data?.docs ?? [], [docsQuery.data]);

  useEffect(() => {
    document.title = `${t.knowledge.title} - ${t.pages.appName}`;
  }, [t.knowledge.title, t.pages.appName]);

  useEffect(() => {
    if (!canManageKnowledge || !isConfigured) return;
    const configuredDefault = configQuery.data?.default_collection_name;
    const defaultExists = configuredDefault
      ? collections.some(
          (collection) => collectionNameOf(collection) === configuredDefault,
        )
      : false;
    const currentExists = collections.some(
      (collection) => collectionNameOf(collection) === selectedCollection,
    );
    const nextCollection =
      defaultExists && configuredDefault
        ? configuredDefault
        : collectionNameOf(collections[0] ?? {});

    if ((!selectedCollection || !currentExists) && nextCollection) {
      setSelectedCollection(nextCollection);
    }
  }, [
    canManageKnowledge,
    collections,
    configQuery.data?.default_collection_name,
    isConfigured,
    selectedCollection,
  ]);

  const selectedCollectionMeta = useMemo(() => {
    return collections.find(
      (collection) => collectionNameOf(collection) === selectedCollection,
    );
  }, [collections, selectedCollection]);

  const handleRefresh = () => {
    void collectionsQuery.refetch();
    void docsQuery.refetch();
  };

  const handleDelete = (doc: KnowledgeDoc) => {
    if (!selectedCollection) return;
    const label = doc.doc_name ?? doc.doc_id;
    if (!window.confirm(t.knowledge.deleteConfirm(label))) return;

    deleteDoc.mutate(
      { collectionName: selectedCollection, docId: doc.doc_id },
      {
        onSuccess: () => toast.success(t.knowledge.deleteSuccess),
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : String(error)),
      },
    );
  };

  if (staticMode) {
    return (
      <KnowledgeNotice
        title={t.knowledge.unavailableTitle}
        description={t.common.notAvailableInDemoMode}
      />
    );
  }

  if (user?.system_role !== "admin") {
    return (
      <KnowledgeNotice
        title={t.knowledge.accessDeniedTitle}
        description={t.knowledge.accessDeniedDescription}
      />
    );
  }

  return (
    <div className="flex size-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">{t.knowledge.title}</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {t.knowledge.description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCwIcon className="h-4 w-4" />
            {t.knowledge.refresh}
          </Button>
          <Button
            disabled={!selectedCollection || !configQuery.data?.tos_configured}
            onClick={() => setUploadDialogOpen(true)}
          >
            <UploadIcon className="h-4 w-4" />
            {t.knowledge.upload}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {configQuery.isLoading ? (
          <KnowledgePageSkeleton />
        ) : configQuery.error ? (
          <Alert variant="destructive">
            <AlertTitle>{t.knowledge.configLoadErrorTitle}</AlertTitle>
            <AlertDescription>
              {configQuery.error instanceof Error
                ? configQuery.error.message
                : t.knowledge.configLoadErrorDescription}
            </AlertDescription>
          </Alert>
        ) : !configQuery.data?.configured ? (
          <Alert>
            <AlertTitle>{t.knowledge.notConfiguredTitle}</AlertTitle>
            <AlertDescription>
              {t.knowledge.notConfiguredDescription}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-5">
            {!configQuery.data.tos_configured && (
              <Alert>
                <AlertTitle>{t.knowledge.uploadNotConfiguredTitle}</AlertTitle>
                <AlertDescription>
                  {t.knowledge.uploadNotConfiguredDescription}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-md">
                  <DatabaseIcon className="text-muted-foreground h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {t.knowledge.selectCollection}
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    {selectedCollectionMeta?.resource_id ??
                      configQuery.data.endpoint}
                  </div>
                </div>
              </div>
              <Select
                value={selectedCollection ?? ""}
                onValueChange={setSelectedCollection}
                disabled={
                  collectionsQuery.isLoading || collections.length === 0
                }
              >
                <SelectTrigger className="w-full sm:w-80">
                  <SelectValue placeholder={t.knowledge.selectCollection} />
                </SelectTrigger>
                <SelectContent>
                  {collections.map((collection) => {
                    const name = collectionNameOf(collection);
                    return (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {collectionsQuery.isLoading ? (
              <KnowledgeTableSkeleton />
            ) : collectionsQuery.error ? (
              <Alert variant="destructive">
                <AlertTitle>{t.knowledge.loadCollectionsErrorTitle}</AlertTitle>
                <AlertDescription>
                  {collectionsQuery.error instanceof Error
                    ? collectionsQuery.error.message
                    : t.knowledge.loadCollectionsErrorDescription}
                </AlertDescription>
              </Alert>
            ) : collections.length === 0 ? (
              <KnowledgeEmptyState
                title={t.knowledge.emptyCollectionsTitle}
                description={t.knowledge.emptyCollectionsDescription}
              />
            ) : docsQuery.isLoading ? (
              <KnowledgeTableSkeleton />
            ) : docsQuery.error ? (
              <Alert variant="destructive">
                <AlertTitle>{t.knowledge.loadDocsErrorTitle}</AlertTitle>
                <AlertDescription>
                  {docsQuery.error instanceof Error
                    ? docsQuery.error.message
                    : t.knowledge.loadDocsErrorDescription}
                </AlertDescription>
              </Alert>
            ) : docs.length === 0 ? (
              <KnowledgeEmptyState
                title={t.knowledge.emptyDocsTitle}
                description={t.knowledge.emptyDocsDescription}
              />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">
                    {t.knowledge.docCount(
                      docsQuery.data?.total_num ?? docs.length,
                    )}
                  </Badge>
                </div>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full table-fixed text-sm">
                    <thead className="bg-muted/60 text-muted-foreground">
                      <tr>
                        <th className="h-11 px-4 text-left font-medium">
                          {t.knowledge.docName}
                        </th>
                        <th className="h-11 w-40 px-4 text-left font-medium">
                          {t.knowledge.docType}
                        </th>
                        <th className="h-11 w-32 px-4 text-left font-medium">
                          {t.knowledge.docStatus}
                        </th>
                        <th className="h-11 w-32 px-4 text-left font-medium">
                          {t.knowledge.points}
                        </th>
                        <th className="h-11 w-44 px-4 text-left font-medium">
                          {t.common.lastUpdated}
                        </th>
                        <th className="h-11 w-28 px-4 text-right font-medium">
                          {t.users.actions}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {docs.map((doc) => {
                        const status = getDocStatusDisplay(doc, {
                          deleting: t.knowledge.docStatusDeleting,
                          failed: t.knowledge.docStatusFailed,
                          processing: t.knowledge.docStatusProcessing,
                          queued: t.knowledge.docStatusQueued,
                          ready: t.knowledge.docStatusReady,
                          unknown: t.knowledge.docStatusUnknown,
                          updating: t.knowledge.docStatusUpdating,
                        });

                        return (
                          <tr key={doc.doc_id} className="border-t">
                            <td className="max-w-0 px-4 py-3">
                              <div className="truncate font-medium">
                                {doc.doc_name ?? doc.title ?? doc.doc_id}
                              </div>
                              <div className="text-muted-foreground truncate text-xs">
                                {doc.doc_id}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="secondary">
                                {doc.doc_type ?? doc.add_type ?? "-"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                className={status.className}
                                title={status.title}
                                variant={status.variant}
                              >
                                {status.label}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-muted-foreground">
                                {doc.point_num ?? "-"}
                              </span>
                            </td>
                            <td className="text-muted-foreground px-4 py-3">
                              {formatTimestamp(
                                doc.update_time ?? doc.create_time,
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title={t.knowledge.viewDetails}
                                  onClick={() => setSelectedDocId(doc.doc_id)}
                                >
                                  <EyeIcon className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title={t.common.delete}
                                  disabled={
                                    deleteDoc.isPending &&
                                    deleteDoc.variables?.docId === doc.doc_id
                                  }
                                  onClick={() => handleDelete(doc)}
                                >
                                  <Trash2Icon className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <UploadDocDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        collectionName={selectedCollection}
        uploadMaxBytes={configQuery.data?.upload_max_bytes}
        isPending={uploadDoc.isPending}
        onSubmit={(payload) => {
          if (!selectedCollection) return;
          uploadDoc.mutate(
            {
              collectionName: selectedCollection,
              ...payload,
            },
            {
              onSuccess: () => {
                toast.success(t.knowledge.uploadSuccess);
                setUploadDialogOpen(false);
              },
              onError: (error) =>
                toast.error(
                  error instanceof Error ? error.message : String(error),
                ),
            },
          );
        }}
      />

      <Dialog
        open={Boolean(selectedDocId)}
        onOpenChange={(open) => {
          if (!open) setSelectedDocId(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t.knowledge.docDetails}</DialogTitle>
            <DialogDescription>{selectedDocId}</DialogDescription>
          </DialogHeader>
          {detailQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : detailQuery.error ? (
            <Alert variant="destructive">
              <AlertTitle>{t.knowledge.loadDocErrorTitle}</AlertTitle>
              <AlertDescription>
                {detailQuery.error instanceof Error
                  ? detailQuery.error.message
                  : t.knowledge.loadDocErrorDescription}
              </AlertDescription>
            </Alert>
          ) : detailQuery.data ? (
            <DocDetails doc={detailQuery.data} />
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t.common.close}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UploadDocDialog({
  open,
  onOpenChange,
  collectionName,
  uploadMaxBytes,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionName: string | null;
  uploadMaxBytes?: number;
  isPending: boolean;
  onSubmit: (payload: {
    file: File;
    docId?: string;
    docName?: string;
    description?: string;
  }) => void;
}) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [docId, setDocId] = useState("");
  const [docName, setDocName] = useState("");
  const [description, setDescription] = useState("");
  const effectiveDocName = docName.length > 0 ? docName : (file?.name ?? "");
  const docNameError =
    file && !isValidKnowledgeDocName(effectiveDocName)
      ? t.knowledge.docNameValidationError
      : null;
  const fileError =
    file && !isPdfKnowledgeFile(file) ? t.knowledge.fileValidationError : null;
  const fileHint = uploadMaxBytes
    ? `${t.knowledge.fileValidationHint} ${t.knowledge.maxUploadSize(
        formatBytes(uploadMaxBytes),
      )}`
    : t.knowledge.fileValidationHint;

  useEffect(() => {
    if (!open) {
      setFile(null);
      setDocId("");
      setDocName("");
      setDescription("");
    }
  }, [open]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;
    if (fileError) {
      toast.error(fileError);
      return;
    }
    if (docNameError) {
      toast.error(docNameError);
      return;
    }
    onSubmit({
      file,
      docId: docId.trim() || undefined,
      docName: docName.trim() || undefined,
      description: description.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t.knowledge.upload}</DialogTitle>
            <DialogDescription>
              {collectionName
                ? t.knowledge.uploadDescription(collectionName)
                : t.knowledge.selectCollection}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="knowledge-file">
              {t.knowledge.file}
            </label>
            <Input
              id="knowledge-file"
              accept=".pdf,application/pdf"
              aria-describedby="knowledge-file-help"
              aria-invalid={Boolean(fileError)}
              type="file"
              required
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setFile(nextFile);
                if (nextFile && !docName) setDocName(nextFile.name);
              }}
            />
            <p
              id="knowledge-file-help"
              className={
                fileError
                  ? "text-destructive text-xs"
                  : "text-muted-foreground text-xs"
              }
            >
              {fileError ?? fileHint}
            </p>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="knowledge-doc-name">
              {t.knowledge.docName}
            </label>
            <Input
              id="knowledge-doc-name"
              aria-describedby="knowledge-doc-name-help"
              aria-invalid={Boolean(docNameError)}
              maxLength={255}
              value={docName}
              onChange={(event) => setDocName(event.target.value)}
              placeholder={file?.name ?? t.knowledge.docNamePlaceholder}
            />
            <p
              id="knowledge-doc-name-help"
              className={
                docNameError
                  ? "text-destructive text-xs"
                  : "text-muted-foreground text-xs"
              }
            >
              {docNameError ?? t.knowledge.docNameValidationHint}
            </p>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="knowledge-doc-id">
              {t.knowledge.docIdOptional}
            </label>
            <Input
              id="knowledge-doc-id"
              value={docId}
              onChange={(event) => setDocId(event.target.value)}
              placeholder={t.knowledge.docIdPlaceholder}
            />
          </div>

          <div className="grid gap-2">
            <label
              className="text-sm font-medium"
              htmlFor="knowledge-description"
            >
              {t.knowledge.descriptionOptional}
            </label>
            <Textarea
              id="knowledge-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t.knowledge.descriptionPlaceholder}
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t.common.cancel}
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={
                !collectionName ||
                !file ||
                Boolean(fileError) ||
                Boolean(docNameError) ||
                isPending
              }
            >
              {isPending ? t.knowledge.uploading : t.knowledge.upload}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DocDetails({ doc }: { doc: KnowledgeDoc }) {
  const { t } = useI18n();
  const summary = doc.brief_summary ?? doc.doc_summary;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
        <DetailItem label={t.knowledge.docName} value={doc.doc_name} />
        <DetailItem label="ID" value={doc.doc_id} />
        <DetailItem label={t.knowledge.docType} value={doc.doc_type} />
        <DetailItem
          label={t.knowledge.fileSize}
          value={formatBytes(doc.doc_size)}
        />
        <DetailItem label={t.knowledge.points} value={doc.point_num} />
        <DetailItem
          label={t.common.lastUpdated}
          value={formatTimestamp(doc.update_time ?? doc.create_time)}
        />
      </div>
      {summary ? (
        <div className="space-y-2">
          <div className="text-sm font-medium">{t.knowledge.summary}</div>
          <div className="text-muted-foreground max-h-48 overflow-auto rounded-lg border p-3 text-sm whitespace-pre-wrap">
            {summary}
          </div>
        </div>
      ) : null}
      {doc.url || doc.tos_path ? (
        <div className="space-y-2">
          <div className="text-sm font-medium">{t.knowledge.source}</div>
          <div className="text-muted-foreground rounded-lg border p-3 text-sm break-all">
            {doc.url ?? doc.tos_path}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: unknown }) {
  const displayValue =
    value === null || value === undefined || value === ""
      ? "-"
      : typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);

  return (
    <div className="min-w-0">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="truncate font-medium">{displayValue}</div>
    </div>
  );
}

function KnowledgeNotice({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex size-full items-start p-6">
      <Alert>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
    </div>
  );
}

function KnowledgeEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
      <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-full">
        <FileIcon className="text-muted-foreground h-7 w-7" />
      </div>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
    </div>
  );
}

function KnowledgePageSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-10 w-80" />
      <KnowledgeTableSkeleton />
    </div>
  );
}

function KnowledgeTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="bg-muted/60 grid h-11 grid-cols-[1fr_10rem_8rem_11rem_7rem] gap-4 px-4">
        <Skeleton className="my-3 h-4 w-24" />
        <Skeleton className="my-3 h-4 w-16" />
        <Skeleton className="my-3 h-4 w-12" />
        <Skeleton className="my-3 h-4 w-24" />
        <Skeleton className="my-3 ml-auto h-4 w-14" />
      </div>
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="grid h-[57px] grid-cols-[1fr_10rem_8rem_11rem_7rem] gap-4 border-t px-4"
        >
          <Skeleton className="my-4 h-4 w-56 max-w-full" />
          <Skeleton className="my-4 h-5 w-16 rounded-full" />
          <Skeleton className="my-4 h-4 w-10" />
          <Skeleton className="my-4 h-4 w-28" />
          <Skeleton className="my-3 ml-auto h-8 w-20" />
        </div>
      ))}
    </div>
  );
}
