"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckSquare,
  Copy,
  Download,
  Eye,
  FileCheck2,
  CopyPlus,
  FilePenLine,
  FileSignature,
  FileText,
  HelpCircle,
  Layers,
  ListChecks,
  ListTree,
  Loader2,
  Minus,
  Paperclip,
  PenTool,
  Plus,
  RotateCw,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Type,
  User,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useRef, useState } from "react";

import { AttachmentsDialog } from "@/components/envelopes/attachments-dialog";
import { DocumentSettingsDialog } from "@/components/envelopes/document-settings-dialog";
import { PdfPage, PdfPager } from "@/components/shared/pdf-page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useEnvelope,
  useEnvelopeAttachments,
  useEnvelopeDocuments,
  useEnvelopeFields,
  useEnvelopeRecipients,
  useMe,
  usePlatformToken,
} from "@/hooks/use-envelope-api";
import {
  ApiError,
  createEnvelopeField,
  deleteEnvelope,
  deleteEnvelopeDocument,
  deleteEnvelopeField,
  documentFilePath,
  duplicateEnvelope,
  platformApiUrl,
  recipientPalette,
  saveEnvelopeAsTemplate,
  updateEnvelopeField,
  type EnvelopeField,
  type EnvelopeRecipient,
} from "@/lib/platform-api";
import { isSoloSelfSign, openWorkspaceSigningSession } from "@/lib/self-sign-flow";
import { cn } from "@/lib/utils";

type FieldType = EnvelopeField["type"];

const defaultSizes: Record<FieldType, { width: number; height: number }> = {
  signature: { width: 26, height: 6.2 },
  initials: { width: 14, height: 6.2 },
  name: { width: 24, height: 5.5 },
  date: { width: 20, height: 5.5 },
  text: { width: 24, height: 5.5 },
  checkbox: { width: 6, height: 4.5 },
  attachment: { width: 26, height: 6.2 },
  dropdown: { width: 24, height: 5.5 },
  radio: { width: 28, height: 5.5 },
};

const DEFAULT_CHOICE_OPTIONS = ["Option 1", "Option 2"];

function roundCoord(value: number) {
  return Math.round(value * 100) / 100;
}

function clampPlacement(x: number, y: number, width: number, height: number) {
  const nextWidth = Math.min(100, Math.max(5, roundCoord(width)));
  const nextHeight = Math.min(100, Math.max(3.5, roundCoord(height)));
  return {
    x: Math.max(0, Math.min(roundCoord(100 - nextWidth), roundCoord(x))),
    y: Math.max(0, Math.min(roundCoord(100 - nextHeight), roundCoord(y))),
    width: nextWidth,
    height: nextHeight,
  };
}

function recipientStyle(index: number) {
  return recipientPalette[index % recipientPalette.length];
}

type EditorTab = "fields" | "preview";

export default function FieldEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("FieldEditor");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { getAccessToken } = usePlatformToken();

  const envelopeQuery = useEnvelope(id);
  const documentsQuery = useEnvelopeDocuments(id);
  const recipientsQuery = useEnvelopeRecipients(id);
  const fieldsQuery = useEnvelopeFields(id);
  const attachmentsQuery = useEnvelopeAttachments(id);
  const me = useMe().data?.user;

  const [activeTab, setActiveTab] = useState<EditorTab>("fields");
  const [activeRecipientId, setActiveRecipientId] = useState<string | null>(null);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [fields, setFields] = useState<EnvelopeField[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);
  const [marqueeRect, setMarqueeRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const marqueeStateRef = useRef<{ startX: number; startY: number; rect: DOMRect; additive: boolean } | null>(null);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [renderedPages, setRenderedPages] = useState(1);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selfParam] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("self") === "1");

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAttachmentsOpen, setIsAttachmentsOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);

  const pendingPatches = useRef(new Map<string, Partial<Pick<EnvelopeField, "recipientId" | "page" | "x" | "y" | "width" | "height" | "label" | "required">>>());
  const patchTimers = useRef(new Map<string, number>());
  const justDraggedRef = useRef(false);

  const envelope = envelopeQuery.data;
  const documents = documentsQuery.data ?? [];
  const recipients = recipientsQuery.data ?? [];
  const attachments = attachmentsQuery.data ?? [];
  const selfFlow = selfParam || isSoloSelfSign(recipients, me?.email);

  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? documents[0],
    [activeDocumentId, documents],
  );
  const pageCount = Math.max(1, selectedDocument?.pageCount ?? 1, renderedPages);
  const isDraft = envelope?.status === "draft";

  useEffect(() => {
    if (fieldsQuery.data && !hydrated) {
      setFields(fieldsQuery.data);
      setHydrated(true);
    }
  }, [fieldsQuery.data, hydrated]);

  useEffect(() => {
    if (recipients.length === 0) {
      return;
    }
    setActiveRecipientId((current) => current ?? recipients.find((recipient) => recipient.role === "signer")?.id ?? recipients[0].id);
  }, [recipients]);

  useEffect(() => {
    return () => {
      for (const timer of patchTimers.current.values()) {
        window.clearTimeout(timer);
      }
    };
  }, []);


  const activeRecipient = recipients.find((recipient) => recipient.id === activeRecipientId) ?? recipients[0];
  const selectedField = fields.find((field) => field.id === selectedFieldId) ?? null;

  const fieldTypes = [
    { type: "signature" as const, label: t("fieldSignature"), icon: FileSignature },
    { type: "initials" as const, label: t("fieldInitials"), icon: PenTool },
    { type: "name" as const, label: t("fieldName"), icon: User },
    { type: "date" as const, label: t("fieldDate"), icon: Calendar },
    { type: "text" as const, label: t("fieldText"), icon: Type },
    { type: "checkbox" as const, label: t("fieldCheckbox"), icon: CheckSquare },
    { type: "attachment" as const, label: t("fieldAttachment"), icon: Paperclip },
    { type: "dropdown" as const, label: t("fieldDropdown"), icon: ListTree },
    { type: "radio" as const, label: t("fieldRadio"), icon: ListChecks },
  ];

  const filteredRecipients = useMemo(() => {
    const query = recipientSearch.trim().toLowerCase();
    if (!query) {
      return recipients;
    }
    return recipients.filter(
      (recipient) => recipient.name.toLowerCase().includes(query) || recipient.email.toLowerCase().includes(query),
    );
  }, [recipients, recipientSearch]);
  const sequentialOrder = useMemo(() => new Set(recipients.map((recipient) => recipient.signingOrder)).size > 1, [recipients]);

  const requireToken = async () => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error(t("loadError"));
    }
    return token;
  };

  const flushField = async (fieldId: string) => {
    const timer = patchTimers.current.get(fieldId);
    if (timer) {
      window.clearTimeout(timer);
      patchTimers.current.delete(fieldId);
    }
    const payload = pendingPatches.current.get(fieldId);
    pendingPatches.current.delete(fieldId);
    if (!payload || Object.keys(payload).length === 0) {
      return;
    }
    const token = await requireToken();
    const updated = await updateEnvelopeField(token, id, fieldId, payload);
    setFields((current) => current.map((field) => (field.id === fieldId ? updated : field)));
  };

  const schedulePatch = (fieldId: string, updates: Partial<EnvelopeField>) => {
    const current = pendingPatches.current.get(fieldId) ?? {};
    pendingPatches.current.set(fieldId, { ...current, ...updates });
    const existing = patchTimers.current.get(fieldId);
    if (existing) {
      window.clearTimeout(existing);
    }
    const timer = window.setTimeout(() => {
      void flushField(fieldId).catch((caught) => {
        setError(caught instanceof ApiError ? caught.message : t("saveError"));
      });
    }, 400);
    patchTimers.current.set(fieldId, timer);
  };

  const persistNewField = async (input: {
    type: FieldType;
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    options?: string[];
  }) => {
    if (!selectedDocument || !activeRecipient || !isDraft) {
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const token = await requireToken();
      const created = await createEnvelopeField(token, id, {
        documentId: selectedDocument.id,
        recipientId: activeRecipient.id,
        type: input.type,
        page: currentPage,
        ...clampPlacement(input.x, input.y, input.width, input.height),
        label: input.label,
        required: true,
        options: input.type === "dropdown" || input.type === "radio" ? (input.options?.length ? input.options : DEFAULT_CHOICE_OPTIONS) : undefined,
      });
      setFields((current) => [...current, created]);
      setSelectedFieldId(created.id);
      await queryClient.invalidateQueries({ queryKey: ["envelope-fields", id] });
      await queryClient.invalidateQueries({ queryKey: ["envelope-review", id] });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("saveError"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddField = (type: FieldType) => {
    const size = defaultSizes[type];
    const count = fields.length;
    void persistNewField({
      type,
      x: 8 + (count % 4) * 12,
      y: 18 + (count % 5) * 10,
      width: size.width,
      height: size.height,
      label: `${activeRecipient?.name ?? ""} ${fieldTypes.find((field) => field.type === type)?.label ?? type}`.trim(),
    });
  };

  const handleDocumentDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isDraft || activeTab === "preview") {
      return;
    }
    const payload = event.dataTransfer.getData("application/x-yoursign-field");
    if (!payload) {
      return;
    }
    let data: { kind: "new" | "existing"; type?: FieldType; id?: string };
    try {
      data = JSON.parse(payload) as { kind: "new" | "existing"; type?: FieldType; id?: string };
    } catch {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * 100;
    const pointerY = ((event.clientY - rect.top) / rect.height) * 100;
    const place = (width: number, height: number) => clampPlacement(pointerX - width / 2, pointerY - height / 2, width, height);

    if (data.kind === "existing" && data.id) {
      const field = fields.find((item) => item.id === data.id);
      if (!field) {
        return;
      }
      const next = { page: currentPage, ...place(field.width, field.height) };
      setFields((current) => current.map((item) => (item.id === data.id ? { ...item, ...next } : item)));
      setSelectedFieldId(data.id);
      schedulePatch(data.id, next);
      return;
    }

    if (data.kind === "new" && data.type) {
      const size = defaultSizes[data.type];
      const next = place(size.width, size.height);
      void persistNewField({
        type: data.type,
        ...next,
        label: `${activeRecipient?.name ?? ""} ${fieldTypes.find((field) => field.type === data.type)?.label ?? data.type}`.trim(),
      });
    }
  };

  const handleUpdateSelectedField = (updates: Partial<EnvelopeField>) => {
    if (!selectedFieldId || !isDraft) {
      return;
    }
    setFields((current) => current.map((field) => (field.id === selectedFieldId ? { ...field, ...updates } : field)));
    schedulePatch(selectedFieldId, updates);
  };

  const handleDeleteSelectedField = async (fieldId: string) => {
    if (!isDraft) {
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const token = await requireToken();
      const timer = patchTimers.current.get(fieldId);
      if (timer) {
        window.clearTimeout(timer);
        patchTimers.current.delete(fieldId);
      }
      pendingPatches.current.delete(fieldId);
      await deleteEnvelopeField(token, id, fieldId);
      setFields((current) => current.filter((field) => field.id !== fieldId));
      if (selectedFieldId === fieldId) {
        setSelectedFieldId(null);
      }
      setMultiSelectedIds((current) => current.filter((fid) => fid !== fieldId));
      await queryClient.invalidateQueries({ queryKey: ["envelope-fields", id] });
      await queryClient.invalidateQueries({ queryKey: ["envelope-review", id] });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("saveError"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDuplicateField = (fieldId: string) => {
    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;
    void persistNewField({
      type: field.type,
      x: Math.min(75, field.x + 2),
      y: Math.min(85, field.y + 3),
      width: field.width,
      height: field.height,
      label: field.label ?? "",
      options: field.options,
    });
  };

  const handleBulkDelete = async () => {
    if (multiSelectedIds.length === 0 || !isDraft) return;
    const ids = [...multiSelectedIds];
    setIsBusy(true);
    setError(null);
    try {
      const token = await requireToken();
      for (const fieldId of ids) {
        const timer = patchTimers.current.get(fieldId);
        if (timer) {
          window.clearTimeout(timer);
          patchTimers.current.delete(fieldId);
        }
        pendingPatches.current.delete(fieldId);
      }
      await Promise.all(ids.map((fieldId) => deleteEnvelopeField(token, id, fieldId)));
      setFields((current) => current.filter((field) => !ids.includes(field.id)));
      setMultiSelectedIds([]);
      setSelectedFieldId(null);
      await queryClient.invalidateQueries({ queryKey: ["envelope-fields", id] });
      await queryClient.invalidateQueries({ queryKey: ["envelope-review", id] });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("saveError"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleBulkDuplicate = async () => {
    if (multiSelectedIds.length < 2 || !isDraft) return;
    const sources = fields.filter((field) => multiSelectedIds.includes(field.id));
    if (sources.length === 0) return;
    setIsBusy(true);
    setError(null);
    try {
      const token = await requireToken();
      const created: EnvelopeField[] = [];
      for (const field of sources) {
        const placement = clampPlacement(field.x + 2, field.y + 3, field.width, field.height);
        const newField = await createEnvelopeField(token, id, {
          documentId: field.documentId,
          recipientId: field.recipientId,
          type: field.type,
          page: field.page,
          ...placement,
          label: field.label ?? "",
          required: field.required,
          options: field.options,
        });
        created.push(newField);
      }
      setFields((current) => [...current, ...created]);
      setMultiSelectedIds(created.map((field) => field.id));
      setSelectedFieldId(created.length === 1 ? created[0].id : null);
      await queryClient.invalidateQueries({ queryKey: ["envelope-fields", id] });
      await queryClient.invalidateQueries({ queryKey: ["envelope-review", id] });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("saveError"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleBulkReassign = (recipientId: string) => {
    if (multiSelectedIds.length === 0 || !isDraft) return;
    setFields((current) => current.map((field) => (multiSelectedIds.includes(field.id) ? { ...field, recipientId } : field)));
    for (const fieldId of multiSelectedIds) {
      schedulePatch(fieldId, { recipientId });
    }
  };

  const handleAlign = (mode: "left" | "right" | "centerX" | "top" | "bottom" | "centerY") => {
    if (multiSelectedIds.length < 2 || !isDraft) return;
    const selected = fields.filter((field) => multiSelectedIds.includes(field.id));
    if (selected.length < 2) return;
    const minX = Math.min(...selected.map((field) => field.x));
    const maxRight = Math.max(...selected.map((field) => field.x + field.width));
    const minY = Math.min(...selected.map((field) => field.y));
    const maxBottom = Math.max(...selected.map((field) => field.y + field.height));
    const centerX = (minX + maxRight) / 2;
    const centerY = (minY + maxBottom) / 2;

    const updates = new Map<string, { x: number; y: number }>();
    for (const field of selected) {
      let nextX = field.x;
      let nextY = field.y;
      if (mode === "left") nextX = minX;
      else if (mode === "right") nextX = maxRight - field.width;
      else if (mode === "centerX") nextX = centerX - field.width / 2;
      else if (mode === "top") nextY = minY;
      else if (mode === "bottom") nextY = maxBottom - field.height;
      else if (mode === "centerY") nextY = centerY - field.height / 2;
      const placed = clampPlacement(nextX, nextY, field.width, field.height);
      updates.set(field.id, { x: placed.x, y: placed.y });
    }
    setFields((current) => current.map((field) => (updates.has(field.id) ? { ...field, ...updates.get(field.id)! } : field)));
    for (const [fieldId, patch] of updates) {
      schedulePatch(fieldId, patch);
    }
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraft || activeTab === "preview") return;
    if (event.target !== event.currentTarget) return;
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const additive = event.shiftKey;
    const state = { startX: event.clientX, startY: event.clientY, rect, additive };
    marqueeStateRef.current = state;
    setMarqueeRect({ left: event.clientX - rect.left, top: event.clientY - rect.top, width: 0, height: 0 });

    const onMove = (pointerEvent: PointerEvent) => {
      const currentX = pointerEvent.clientX - rect.left;
      const currentY = pointerEvent.clientY - rect.top;
      const startXRel = state.startX - rect.left;
      const startYRel = state.startY - rect.top;
      setMarqueeRect({
        left: Math.min(startXRel, currentX),
        top: Math.min(startYRel, currentY),
        width: Math.abs(currentX - startXRel),
        height: Math.abs(currentY - startYRel),
      });
    };

    const onUp = (pointerEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      marqueeStateRef.current = null;
      setMarqueeRect(null);

      const dragDistance = Math.hypot(pointerEvent.clientX - state.startX, pointerEvent.clientY - state.startY);
      if (dragDistance < 4) {
        if (!state.additive) {
          setSelectedFieldId(null);
          setMultiSelectedIds([]);
        }
        return;
      }

      const selLeft = Math.min(state.startX, pointerEvent.clientX);
      const selRight = Math.max(state.startX, pointerEvent.clientX);
      const selTop = Math.min(state.startY, pointerEvent.clientY);
      const selBottom = Math.max(state.startY, pointerEvent.clientY);

      const hits = visibleFields
        .filter((field) => {
          const fieldLeft = rect.left + (field.x / 100) * rect.width;
          const fieldTop = rect.top + (field.y / 100) * rect.height;
          const fieldRight = fieldLeft + (field.width / 100) * rect.width;
          const fieldBottom = fieldTop + (field.height / 100) * rect.height;
          return fieldLeft < selRight && fieldRight > selLeft && fieldTop < selBottom && fieldBottom > selTop;
        })
        .map((field) => field.id);

      setMultiSelectedIds((current) => {
        const next = state.additive ? Array.from(new Set([...current, ...hits])) : hits;
        setSelectedFieldId(next.length === 1 ? next[0] : null);
        return next;
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  const handleFieldMoveStart = (event: React.PointerEvent<HTMLDivElement>, field: EnvelopeField) => {
    if (!isDraft || activeTab === "preview") return;
    if ((event.target as HTMLElement).closest("button")) return;

    event.preventDefault();
    event.stopPropagation();
    justDraggedRef.current = false;

    const isPartOfGroup = multiSelectedIds.length > 1 && multiSelectedIds.includes(field.id);
    const groupIds = isPartOfGroup ? multiSelectedIds : [field.id];
    if (!isPartOfGroup && !event.shiftKey) {
      setSelectedFieldId(field.id);
      setMultiSelectedIds([field.id]);
    }

    const overlay = (event.currentTarget.closest("[data-field-overlay]") || event.currentTarget.parentElement) as HTMLElement | null;
    if (!overlay) return;

    const rect = overlay.getBoundingClientRect();
    const startPointerX = event.clientX;
    const startPointerY = event.clientY;
    const startPositions = new Map(
      groupIds.map((fieldId) => {
        const item = fields.find((f) => f.id === fieldId);
        return [fieldId, { x: item?.x ?? 0, y: item?.y ?? 0, width: item?.width ?? field.width, height: item?.height ?? field.height }] as const;
      }),
    );
    let hasMoved = false;

    const onPointerMove = (pointerEvent: PointerEvent) => {
      const deltaXPercent = ((pointerEvent.clientX - startPointerX) / rect.width) * 100;
      const deltaYPercent = ((pointerEvent.clientY - startPointerY) / rect.height) * 100;

      if (!hasMoved && (Math.abs(pointerEvent.clientX - startPointerX) > 2 || Math.abs(pointerEvent.clientY - startPointerY) > 2)) {
        hasMoved = true;
      }

      setFields((current) =>
        current.map((item) => {
          const start = startPositions.get(item.id);
          if (!start) return item;
          const next = clampPlacement(start.x + deltaXPercent, start.y + deltaYPercent, start.width, start.height);
          return { ...item, x: next.x, y: next.y };
        }),
      );
    };

    const onPointerUp = (pointerEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);

      if (hasMoved) {
        justDraggedRef.current = true;
        const deltaXPercent = ((pointerEvent.clientX - startPointerX) / rect.width) * 100;
        const deltaYPercent = ((pointerEvent.clientY - startPointerY) / rect.height) * 100;
        for (const [fieldId, start] of startPositions) {
          const finalPlacement = clampPlacement(start.x + deltaXPercent, start.y + deltaYPercent, start.width, start.height);
          schedulePatch(fieldId, { x: finalPlacement.x, y: finalPlacement.y });
        }
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isDraft) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.getAttribute("role") === "combobox")
      ) {
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (multiSelectedIds.length > 1) {
          event.preventDefault();
          void handleBulkDelete();
        } else if (selectedFieldId) {
          event.preventDefault();
          void handleDeleteSelectedField(selectedFieldId);
        }
      } else if (event.key === "Escape") {
        setSelectedFieldId(null);
        setMultiSelectedIds([]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedFieldId, multiSelectedIds, isDraft]);

  const handleContinueToSend = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await Promise.all([...pendingPatches.current.keys()].map((fieldId) => flushField(fieldId)));
      if (selfFlow) {
        const recipient = recipients.find((item) => item.role === "signer") ?? recipients[0];
        if (!recipient) throw new Error("Add yourself as the signer before continuing.");
        const token = await requireToken();
        await openWorkspaceSigningSession(token, id, recipient.id, router);
        return;
      }
      router.push(`/envelopes/${id}/send`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("saveError"));
      setIsBusy(false);
    }
  };

  const handleDuplicate = async () => {
    setIsBusy(true);
    try {
      const token = await requireToken();
      const duplicated = await duplicateEnvelope(token, id);
      router.push(`/envelopes/${duplicated.id}/editor`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Failed to duplicate document.");
      setIsBusy(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const token = await requireToken();
      await saveEnvelopeAsTemplate(token, id);
      await queryClient.invalidateQueries({ queryKey: ["envelopes", "templates"] });
      setIsSaveTemplateOpen(false);
      router.push("/templates");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Failed to save template.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteDocument = async () => {
    setIsBusy(true);
    try {
      const token = await requireToken();
      await deleteEnvelope(token, id);
      router.push("/envelopes");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Failed to delete document.");
      setIsBusy(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const token = await requireToken();
      const res = await fetch(`${platformApiUrl}/v1/envelopes/${id}/documents/${selectedDocument.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = selectedDocument.filename || "document.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download PDF.");
    }
  };

  const recipientIndex = (recipientId: string) => Math.max(0, recipients.findIndex((recipient) => recipient.id === recipientId));
  const styledRecipient = (recipient: EnvelopeRecipient | undefined, recipientId: string) => {
    const style = recipientStyle(recipientIndex(recipientId));
    return {
      name: recipient?.name ?? t("unknownRecipient"),
      role: recipient?.role ?? "signer",
      ...style,
    };
  };

  if (envelopeQuery.error || documentsQuery.error || recipientsQuery.error || fieldsQuery.error) {
    const notFound = envelopeQuery.error instanceof ApiError && envelopeQuery.error.status === 404;
    return (
      <div className="grid h-[calc(100dvh-4.5rem)] place-items-center bg-surface-subtle px-6">
        <div className="max-w-md rounded-3xl border bg-background p-6 text-center shadow-sm">
          <p className="font-semibold">{notFound ? t("notFound") : t("loadError")}</p>
          <Button asChild className="mt-4">
            <Link href="/envelopes">{t("backToEnvelopes")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (envelopeQuery.isLoading || documentsQuery.isLoading || recipientsQuery.isLoading || fieldsQuery.isLoading || !hydrated || !envelope) {
    return (
      <div className="grid h-[calc(100dvh-4.5rem)] place-items-center bg-surface-subtle">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </div>
      </div>
    );
  }

  if (!selectedDocument) {
    return (
      <div className="grid h-[calc(100dvh-4.5rem)] place-items-center bg-surface-subtle px-6">
        <div className="max-w-md rounded-3xl border bg-background p-6 text-center shadow-sm">
          <p className="font-semibold">{t("noDocuments")}</p>
          <Button asChild className="mt-4">
            <Link href="/envelopes">{t("backToEnvelopes")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (recipients.length === 0) {
    return (
      <div className="grid h-[calc(100dvh-4.5rem)] place-items-center bg-surface-subtle px-6">
        <div className="max-w-md rounded-3xl border bg-background p-6 text-center shadow-sm">
          <p className="font-semibold">{t("noRecipients")}</p>
          <Button asChild className="mt-4">
            <Link href={`/envelopes/${id}/recipients`}>{t("addRecipients")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const visibleFields = fields.filter((field) => field.documentId === selectedDocument.id && field.page === currentPage);

  return (
    <div className="flex h-[calc(100dvh-4.5rem)] flex-col overflow-hidden bg-surface-subtle">
      {/* Top Header Bar Matching Screenshot */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4 shadow-2xs sm:px-6">
        {/* Left: Document Title + Status */}
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/envelopes"
            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="size-3.5 rtl:rotate-180" />
          </Link>

          <span className="hidden h-4 w-px bg-border sm:block" />

          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-sm font-bold text-foreground">
              {envelope.title || selectedDocument.filename}
            </span>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500 capitalize">
              {envelope.status}
            </span>
          </div>
        </div>

        {/* Center: Pager & Zoom controls */}
        <div className="hidden md:flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border bg-card px-2 py-1 text-xs font-medium shadow-2xs">
            <button
              type="button"
              onClick={() => setZoomLevel((value) => Math.max(75, value - 15))}
              className="p-1 transition hover:text-primary"
              title={t("zoom")}
            >
              <Minus className="size-3.5" />
            </button>
            <span className="min-w-10 text-center font-mono">{zoomLevel}%</span>
            <button
              type="button"
              onClick={() => setZoomLevel((value) => Math.min(150, value + 15))}
              className="p-1 transition hover:text-primary"
              title={t("zoom")}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <PdfPager
            page={currentPage}
            pageCount={pageCount}
            onChange={(page) => {
              setCurrentPage(page);
              setSelectedFieldId(null);
              setMultiSelectedIds([]);
            }}
          />
        </div>

        {/* Right Header Action Buttons: Attachments, Settings, Send Document */}
        <div className="flex items-center gap-2">
          {/* Attachments Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsAttachmentsOpen(true)}
            className="h-9 gap-1.5 rounded-xl text-xs"
          >
            <Paperclip className="size-3.5" />
            <span>Attachments</span>
            {attachments.length > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                {attachments.length}
              </span>
            )}
          </Button>

          {/* Settings Icon Button */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setIsSettingsOpen(true)}
            className="size-9 rounded-xl text-muted-foreground hover:text-foreground"
            title="Document Settings"
          >
            <Settings className="size-4" />
          </Button>

          {/* Send Document Primary CTA */}
          <Button
            onClick={() => void handleContinueToSend()}
            disabled={isBusy}
            className="h-9 gap-2 rounded-xl text-xs font-semibold bg-[#a3e635] hover:bg-[#84cc16] text-black shadow-xs"
          >
            {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            <span>{selfFlow ? "Continue to Sign" : "Send Document"}</span>
          </Button>
        </div>
      </header>

      {error ? <p className="border-b bg-destructive/5 px-4 py-2 text-xs text-destructive">{error}</p> : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Workflow Sidebar Matching Screenshot */}
        <aside className="flex w-80 shrink-0 flex-col justify-between overflow-y-auto border-e bg-card p-4 shadow-xs">
          <div className="space-y-5">
            {/* Step Header */}
            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Document Editor
              </p>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                Step {activeTab === "preview" ? "3/3" : "2/3"}
              </span>
            </div>

            {/* Step Navigation Cards */}
            <div className="space-y-2">
              <Link
                href={`/envelopes/${id}/recipients`}
                className="flex items-center gap-3 rounded-2xl border border-transparent p-3 text-start transition hover:bg-surface-subtle group"
              >
                <span className="grid size-9 place-items-center rounded-xl bg-surface-subtle text-muted-foreground group-hover:text-foreground">
                  <Users className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground">Document & Recipients</p>
                  <p className="text-[10px] text-muted-foreground">Upload documents and add recipients</p>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => setActiveTab("fields")}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border p-3 text-start transition",
                  activeTab === "fields"
                    ? "border-primary/40 bg-primary/5 shadow-xs ring-1 ring-primary/20"
                    : "border-transparent hover:bg-surface-subtle",
                )}
              >
                <span className={cn(
                  "grid size-9 place-items-center rounded-xl",
                  activeTab === "fields" ? "bg-primary text-primary-foreground" : "bg-surface-subtle text-muted-foreground",
                )}>
                  <PenTool className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground">Add Fields</p>
                  <p className="text-[10px] text-muted-foreground">Place and configure form fields in the document</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border p-3 text-start transition",
                  activeTab === "preview"
                    ? "border-primary/40 bg-primary/5 shadow-xs ring-1 ring-primary/20"
                    : "border-transparent hover:bg-surface-subtle",
                )}
              >
                <span className={cn(
                  "grid size-9 place-items-center rounded-xl",
                  activeTab === "preview" ? "bg-primary text-primary-foreground" : "bg-surface-subtle text-muted-foreground",
                )}>
                  <Eye className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground">Preview</p>
                  <p className="text-[10px] text-muted-foreground">Preview the document before sending</p>
                </div>
              </button>
            </div>

            {/* In "Add Fields" Mode: Active Recipient + Fields Palette + Properties */}
            {activeTab === "fields" && (
              <div className="space-y-4 pt-2 border-t">
                {/* Active Signer Selector */}
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Active Signer
                  </Label>
                  {recipients.length > 5 && (
                    <div className="relative mt-2">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={recipientSearch}
                        onChange={(event) => setRecipientSearch(event.target.value)}
                        placeholder="Search recipients…"
                        className="h-8 rounded-lg pl-8 text-xs"
                      />
                    </div>
                  )}
                  <div className="mt-2 space-y-1">
                    {filteredRecipients.length === 0 && (
                      <p className="px-1 py-2 text-[11px] text-muted-foreground">No recipients match &ldquo;{recipientSearch}&rdquo;.</p>
                    )}
                    {filteredRecipients.map((recipient) => {
                      const active = recipient.id === activeRecipientId;
                      const style = recipientStyle(recipientIndex(recipient.id));
                      return (
                        <button
                          key={recipient.id}
                          type="button"
                          onClick={() => setActiveRecipientId(recipient.id)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-xl border p-2.5 text-start text-xs transition",
                            active
                              ? "border-primary bg-primary/5 font-semibold ring-1 ring-primary/30"
                              : "border-border/80 bg-background hover:bg-surface-subtle",
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            {sequentialOrder && (
                              <span
                                className="grid size-4.5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
                                style={{ backgroundColor: style.color }}
                                title={`Signs in step ${recipient.signingOrder}`}
                              >
                                {recipient.signingOrder}
                              </span>
                            )}
                            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: style.color }} />
                            <div className="min-w-0">
                              <p className="truncate text-foreground font-semibold">{recipient.name}</p>
                              <p className="truncate text-[10px] text-muted-foreground capitalize">{recipient.role}</p>
                            </div>
                          </div>
                          {active && <Check className="size-3.5 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Fields Palette */}
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Form Fields
                  </Label>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {fieldTypes.map(({ icon: Icon, label, type }) => (
                      <button
                        key={type}
                        type="button"
                        draggable={isDraft}
                        disabled={!isDraft}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "copy";
                          event.dataTransfer.setData("application/x-yoursign-field", JSON.stringify({ kind: "new", type }));
                        }}
                        onClick={() => handleAddField(type)}
                        className="group flex cursor-grab flex-col items-center justify-center gap-1 rounded-xl border bg-background p-2.5 text-center shadow-2xs transition hover:border-primary/50 hover:bg-primary/5 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span
                          className="grid size-7 place-items-center rounded-lg text-white shadow-2xs transition group-hover:scale-105"
                          style={{ backgroundColor: recipientStyle(recipientIndex(activeRecipient.id)).color }}
                        >
                          <Icon className="size-3.5" />
                        </span>
                        <span className="text-[10px] font-semibold text-foreground">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected Field Properties */}
                {selectedField && (
                  <div className="rounded-2xl border bg-surface-subtle/70 p-3 space-y-2.5 text-xs animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[11px] text-foreground uppercase tracking-wider">
                        {selectedField.type} properties
                      </span>
                      {isDraft && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void handleDeleteSelectedField(selectedField.id)}
                          className="size-6 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Assigned To</Label>
                      <Select
                        value={selectedField.recipientId}
                        disabled={!isDraft}
                        onValueChange={(val) => handleUpdateSelectedField({ recipientId: val })}
                      >
                        <SelectTrigger className="h-8 rounded-lg text-xs">
                          <SelectValue placeholder="Select recipient" />
                        </SelectTrigger>
                        <SelectContent>
                          {recipients.map((recipient) => (
                            <SelectItem key={recipient.id} value={recipient.id}>
                              {recipient.name} ({recipient.role})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Field Label</Label>
                      <Input
                        className="h-7 text-xs bg-background"
                        value={selectedField.label ?? ""}
                        disabled={!isDraft}
                        onChange={(event) => handleUpdateSelectedField({ label: event.target.value })}
                      />
                    </div>

                    {(selectedField.type === "dropdown" || selectedField.type === "radio") && (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground">Choices</Label>
                        {(selectedField.options ?? []).map((option, index) => (
                          <div key={index} className="flex items-center gap-1.5">
                            <Input
                              className="h-7 text-xs bg-background"
                              value={option}
                              disabled={!isDraft}
                              onChange={(event) => {
                                const next = [...(selectedField.options ?? [])];
                                next[index] = event.target.value;
                                handleUpdateSelectedField({ options: next });
                              }}
                            />
                            {isDraft && (selectedField.options?.length ?? 0) > 2 && (
                              <button
                                type="button"
                                aria-label="Remove choice"
                                onClick={() => {
                                  const next = (selectedField.options ?? []).filter((_, i) => i !== index);
                                  handleUpdateSelectedField({ options: next });
                                }}
                                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              >
                                <X className="size-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        {isDraft && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 w-full gap-1.5 rounded-lg text-[11px]"
                            onClick={() => handleUpdateSelectedField({ options: [...(selectedField.options ?? []), `Option ${(selectedField.options?.length ?? 0) + 1}`] })}
                          >
                            <Plus className="size-3" />
                            Add choice
                          </Button>
                        )}
                      </div>
                    )}

                    {isDraft && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleDeleteSelectedField(selectedField.id)}
                        className="w-full h-8 gap-1.5 rounded-xl text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30 mt-1"
                      >
                        <Trash2 className="size-3.5" />
                        <span>Delete Field</span>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Actions List Matching Screenshot */}
          <div className="border-t pt-4 space-y-1 text-xs">
            <p className="px-2 pb-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Quick Actions
            </p>

            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-muted-foreground hover:bg-surface-subtle hover:text-foreground transition text-left"
            >
              <Settings className="size-3.5 text-muted-foreground" />
              <span>Document Settings</span>
            </button>

            <button
              type="button"
              onClick={() => void handleContinueToSend()}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-muted-foreground hover:bg-surface-subtle hover:text-foreground transition text-left"
            >
              <Send className="size-3.5 text-muted-foreground" />
              <span>Send Document</span>
            </button>

            <button
              type="button"
              onClick={() => void handleDuplicate()}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-muted-foreground hover:bg-surface-subtle hover:text-foreground transition text-left"
            >
              <Copy className="size-3.5 text-muted-foreground" />
              <span>Duplicate Document</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSaveTemplateOpen(true)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-muted-foreground hover:bg-surface-subtle hover:text-foreground transition text-left"
            >
              <Sparkles className="size-3.5 text-muted-foreground" />
              <span>Save as Template</span>
            </button>

            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-muted-foreground hover:bg-surface-subtle hover:text-foreground transition text-left"
            >
              <Download className="size-3.5 text-muted-foreground" />
              <span>Download PDF</span>
            </button>

            {isDraft && (
              <button
                type="button"
                onClick={() => setIsDeleteOpen(true)}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-rose-500 hover:bg-rose-500/10 transition text-left"
              >
                <Trash2 className="size-3.5 text-rose-500" />
                <span>Delete Document</span>
              </button>
            )}

            <Link
              href="/envelopes"
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-muted-foreground hover:bg-surface-subtle hover:text-foreground transition text-left"
            >
              <ArrowLeft className="size-3.5 text-muted-foreground rtl:rotate-180" />
              <span>Return to documents</span>
            </Link>
          </div>
        </aside>

        {/* Center Main Canvas Area */}
        <main className="flex flex-1 flex-col items-center overflow-auto bg-slate-200/50 p-6 dark:bg-slate-900/50">
          {/* Document Header Pill Tabs */}
          <div className="flex items-center gap-2 mb-4">
            {documents.map((doc, i) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => {
                  setActiveDocumentId(doc.id);
                  setCurrentPage(1);
                  setRenderedPages(1);
                  setSelectedFieldId(null);
                  setMultiSelectedIds([]);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition border",
                  selectedDocument.id === doc.id
                    ? "bg-card text-foreground border-primary/40 shadow-xs ring-1 ring-primary/20"
                    : "bg-card/70 text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                <span className="grid size-4 place-items-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                  {i + 1}
                </span>
                <span>{doc.filename}</span>
                <span className="text-[10px] text-muted-foreground">
                  • {fields.filter((f) => f.documentId === doc.id).length} Fields
                </span>
                <span className="size-1.5 rounded-full bg-emerald-500" />
              </button>
            ))}
          </div>

          {/* Preview Mode Notice Banner */}
          {activeTab === "preview" && (
            <div className="w-full max-w-[680px] mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-amber-900 dark:text-amber-200">
              <p className="font-bold text-xs">Preview Mode</p>
              <p className="text-[11px] opacity-90 mt-0.5">
                Preview what the signed document will look like with placeholder data before sending.
              </p>
            </div>
          )}

          {/* Multi-select Toolbar */}
          {activeTab === "fields" && isDraft && multiSelectedIds.length > 1 && (
            <div className="sticky top-2 z-40 mb-4 flex w-full max-w-[680px] flex-wrap items-center gap-1.5 rounded-2xl border bg-card/95 p-2 shadow-md backdrop-blur-sm animate-in fade-in">
              <span className="px-2 text-[11px] font-bold text-foreground">{multiSelectedIds.length} selected</span>
              <span className="h-4 w-px bg-border" />
              {[
                { mode: "left" as const, icon: AlignHorizontalJustifyStart, label: "Align left" },
                { mode: "centerX" as const, icon: AlignHorizontalJustifyCenter, label: "Align center" },
                { mode: "right" as const, icon: AlignHorizontalJustifyEnd, label: "Align right" },
                { mode: "top" as const, icon: AlignVerticalJustifyStart, label: "Align top" },
                { mode: "centerY" as const, icon: AlignVerticalJustifyCenter, label: "Align middle" },
                { mode: "bottom" as const, icon: AlignVerticalJustifyEnd, label: "Align bottom" },
              ].map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  type="button"
                  title={label}
                  aria-label={label}
                  onClick={() => handleAlign(mode)}
                  className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
                >
                  <Icon className="size-3.5" />
                </button>
              ))}
              <span className="h-4 w-px bg-border" />
              <Select onValueChange={handleBulkReassign}>
                <SelectTrigger className="h-7 w-auto min-w-[9rem] rounded-lg text-[11px]">
                  <SelectValue placeholder="Reassign to…" />
                </SelectTrigger>
                <SelectContent>
                  {recipients.map((recipient) => (
                    <SelectItem key={recipient.id} value={recipient.id}>
                      {recipient.name} ({recipient.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                title="Duplicate selection"
                aria-label="Duplicate selection"
                onClick={() => void handleBulkDuplicate()}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
              >
                <CopyPlus className="size-3.5" />
              </button>
              <button
                type="button"
                title="Delete selection"
                aria-label="Delete selection"
                onClick={() => void handleBulkDelete()}
                className="flex size-7 items-center justify-center rounded-lg text-destructive hover:bg-destructive/15 transition cursor-pointer"
              >
                <Trash2 className="size-3.5" />
              </button>
              <span className="h-4 w-px bg-border" />
              <button
                type="button"
                title="Clear selection"
                aria-label="Clear selection"
                onClick={() => {
                  setSelectedFieldId(null);
                  setMultiSelectedIds([]);
                }}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {/* PDF Page Canvas */}
          <PdfPage
            src={documentFilePath(id, selectedDocument.id)}
            page={currentPage}
            width={Math.round(680 * (zoomLevel / 100))}
            onDocumentLoad={({ pageCount: count }) => setRenderedPages(count)}
          >
            <div
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = [...event.dataTransfer.types].includes("application/x-yoursign-field") ? "move" : "none";
              }}
              onDrop={handleDocumentDrop}
              onPointerDown={handleCanvasPointerDown}
              data-field-overlay
              className="absolute inset-0"
            >
              {marqueeRect ? (
                <div
                  className="absolute z-40 rounded-sm border-2 border-primary/70 bg-primary/10 pointer-events-none"
                  style={{ left: marqueeRect.left, top: marqueeRect.top, width: marqueeRect.width, height: marqueeRect.height }}
                />
              ) : null}
              {visibleFields.map((field) => {
                const rec = styledRecipient(
                  recipients.find((recipient) => recipient.id === field.recipientId),
                  field.recipientId,
                );
                const isMultiSelected = multiSelectedIds.length > 1 && multiSelectedIds.includes(field.id);
                const isSelected = field.id === selectedFieldId || isMultiSelected;
                const FieldIcon = fieldTypes.find((item) => item.type === field.type)?.icon ?? FileSignature;

                // Preview Mode rendering
                if (activeTab === "preview") {
                  return (
                    <div
                      key={field.id}
                      style={{
                        left: `${field.x}%`,
                        top: `${field.y}%`,
                        width: `${field.width}%`,
                        height: `${field.height}%`,
                      }}
                      className="absolute flex items-center justify-center rounded-[3px] border border-primary/40 bg-primary/10 px-2 text-[10px] font-semibold text-primary overflow-hidden"
                    >
                      <span className="truncate">
                        {field.type === "signature" ? `✍️ [Signed: ${rec.name}]` : field.type === "date" ? new Date().toLocaleDateString() : field.label || field.type}
                      </span>
                    </div>
                  );
                }

                // Add Fields mode interactive rendering (Documenso style: crisp square cards, smooth pointer dragging)
                return (
                  <div
                    key={field.id}
                    onPointerDown={(event) => handleFieldMoveStart(event, field)}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (justDraggedRef.current) {
                        justDraggedRef.current = false;
                        return;
                      }
                      if (event.shiftKey) {
                        setMultiSelectedIds((current) => {
                          const base = current.length > 0 ? current : selectedFieldId ? [selectedFieldId] : [];
                          const exists = base.includes(field.id);
                          const next = exists ? base.filter((fid) => fid !== field.id) : [...base, field.id];
                          setSelectedFieldId(next.length === 1 ? next[0] : null);
                          return next;
                        });
                        return;
                      }
                      setSelectedFieldId(field.id);
                      setMultiSelectedIds([field.id]);
                    }}
                    style={{
                      left: `${field.x}%`,
                      top: `${field.y}%`,
                      width: `${field.width}%`,
                      height: `${field.height}%`,
                    }}
                    className={cn(
                      "absolute flex items-center justify-between rounded-[4px] border-2 bg-white/95 dark:bg-card/95 font-sans transition-shadow select-none",
                      isDraft ? "cursor-move" : "cursor-default",
                      isSelected
                        ? "z-30 shadow-md ring-2 ring-primary ring-offset-1"
                        : "z-10 shadow-2xs hover:shadow-xs",
                      rec.borderTone,
                    )}
                  >
                    {/* Content inside field: crisp, clean typography without overlapping */}
                    <div className="flex h-full w-full items-center justify-between gap-1.5 px-2 py-0.5 overflow-hidden pointer-events-none">
                      <div className="flex min-w-0 items-center gap-1.5 flex-1">
                        <span
                          className="grid size-5 shrink-0 place-items-center rounded-[2px] text-white shadow-2xs"
                          style={{ backgroundColor: rec.color }}
                        >
                          <FieldIcon className="size-3" />
                        </span>
                        <div className="min-w-0 flex-1 truncate">
                          <p className="truncate text-[11px] font-semibold leading-tight text-foreground">
                            {field.label ?? field.type}
                          </p>
                          <p
                            className="truncate text-[9px] font-medium leading-none mt-0.5"
                            style={{ color: rec.color }}
                          >
                            {rec.name}
                          </p>
                        </div>
                      </div>
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: rec.color }}
                        title={`Assigned to ${rec.name}`}
                      />
                    </div>

                    {isSelected && isDraft && !isMultiSelected ? (
                      <>
                        {/* Floating Quick Action Toolbar */}
                        <div
                          className="absolute -top-8 right-0 z-50 flex items-center gap-1 rounded-lg border border-border bg-card/95 px-1.5 py-0.5 shadow-md backdrop-blur-xs animate-in fade-in zoom-in-95 pointer-events-auto"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[10px] font-bold text-foreground px-1 truncate max-w-[100px]">
                            {field.label ?? field.type}
                          </span>
                          <button
                            type="button"
                            aria-label="Duplicate field"
                            title="Duplicate field"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              handleDuplicateField(field.id);
                            }}
                            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer"
                          >
                            <CopyPlus className="size-3" />
                          </button>
                          <button
                            type="button"
                            aria-label="Delete field"
                            title="Delete field (Backspace / Delete)"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void handleDeleteSelectedField(field.id);
                            }}
                            className="flex size-5 items-center justify-center rounded text-destructive hover:bg-destructive/15 transition cursor-pointer"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>

                        {/* Top-Right Quick Delete 'X' Badge */}
                        <button
                          type="button"
                          aria-label="Delete field"
                          title="Delete field"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleDeleteSelectedField(field.id);
                          }}
                          className="absolute -top-2 -right-2 z-40 flex size-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition hover:scale-110 active:scale-95 border border-background cursor-pointer"
                        >
                          <X className="size-2.5 stroke-[3]" />
                        </button>

                        {/* Square Corner Resize Handle (Documenso Style) */}
                        <button
                          type="button"
                          aria-label="Resize field"
                          title="Drag to resize"
                          draggable={false}
                          onDragStart={(event) => event.preventDefault()}
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const overlay = event.currentTarget.closest("[data-field-overlay]") as HTMLElement | null;
                            if (!overlay) return;
                            const rect = overlay.getBoundingClientRect();
                            const startX = event.clientX;
                            const startY = event.clientY;
                            const startWidth = field.width;
                            const startHeight = field.height;
                            const move = (pointer: PointerEvent) => {
                              const next = clampPlacement(
                                field.x,
                                field.y,
                                startWidth + ((pointer.clientX - startX) / rect.width) * 100,
                                startHeight + ((pointer.clientY - startY) / rect.height) * 100,
                              );
                              setFields((current) => current.map((item) => (item.id === field.id ? { ...item, ...next } : item)));
                              schedulePatch(field.id, next);
                            };
                            const up = () => {
                              window.removeEventListener("pointermove", move);
                              window.removeEventListener("pointerup", up);
                            };
                            window.addEventListener("pointermove", move);
                            window.addEventListener("pointerup", up, { once: true });
                          }}
                          className="absolute -bottom-1.5 -right-1.5 size-3.5 cursor-se-resize rounded-[2px] border-2 border-white bg-primary shadow-sm"
                        />
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </PdfPage>
        </main>
      </div>

      {/* Document Settings Modal */}
      {envelope && (
        <DocumentSettingsDialog
          envelope={envelope}
          open={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          onSuccess={() => void envelopeQuery.refetch()}
        />
      )}

      {/* Attachments Modal */}
      <AttachmentsDialog
        envelopeId={id}
        open={isAttachmentsOpen}
        onOpenChange={setIsAttachmentsOpen}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this document and its placed fields? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={isBusy} onClick={() => void handleDeleteDocument()}>
              {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save as Template Dialog */}
      <Dialog open={isSaveTemplateOpen} onOpenChange={(open) => !isBusy && setIsSaveTemplateOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Reusable Template</DialogTitle>
            <DialogDescription>
              This document, its placed fields, and recipient roles will be saved as a reusable template. Recipient names/emails can be
              swapped out each time you start a new envelope from it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={isBusy} onClick={() => setIsSaveTemplateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={isBusy}
              className="bg-[#a3e635] hover:bg-[#84cc16] text-black font-semibold"
              onClick={() => void handleSaveAsTemplate()}
            >
              {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
