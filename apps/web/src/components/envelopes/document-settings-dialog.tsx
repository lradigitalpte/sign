"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Check,
  Globe,
  Info,
  Loader2,
  Lock,
  Mail,
  RotateCw,
  Send,
  Settings,
  Shield,
  Sliders,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePlatformToken } from "@/hooks/use-envelope-api";
import { ApiError, updateEnvelope, type Envelope } from "@/lib/platform-api";
import { cn } from "@/lib/utils";

type Props = {
  envelope: Envelope;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

type SettingsTab = "general" | "reminders" | "notifications" | "security";

export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "de", label: "German" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "it", label: "Italian" },
  { value: "nl", label: "Dutch" },
  { value: "pl", label: "Polish" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
];

export const DATE_FORMAT_OPTIONS = [
  "YYYY-MM-DD hh:mm AM/PM",
  "YYYY-MM-DD HH:mm",
  "DD/MM/YYYY HH:mm",
  "DD/MM/YYYY HH:mm AM/PM",
  "DD-MM-YYYY HH:mm",
  "DD-MM-YYYY HH:mm AM/PM",
  "MM/DD/YYYY HH:mm",
  "MM/DD/YYYY HH:mm AM/PM",
  "DD.MM.YYYY HH:mm",
  "YY-MM-DD HH:mm",
  "YY-MM-DD HH:mm AM/PM",
  "YYYY-MM-DD HH:mm:ss",
  "Month Date, Year HH:mm",
  "Month Date, Year HH:mm AM/PM",
  "Day, Month Year HH:mm",
  "Day, Month Year HH:mm AM/PM",
  "ISO 8601",
  "YYYY-MM-DD",
  "DD/MM/YYYY",
  "DD-MM-YYYY",
  "MM/DD/YYYY",
  "DD.MM.YYYY",
  "YY-MM-DD",
  "Month Date, Year",
  "Day, Month Year",
];

export const TIMEZONE_OPTIONS = [
  { value: "Etc/UTC", label: "Etc/UTC" },
  { value: "America/New_York", label: "America/New_York (EST/EDT)" },
  { value: "America/Chicago", label: "America/Chicago (CST/CDT)" },
  { value: "America/Denver", label: "America/Denver (MST/MDT)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST/PDT)" },
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo (BRT)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET/CEST)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET/CEST)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
  { value: "Asia/Seoul", label: "Asia/Seoul (KST)" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai (CST)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST/AEDT)" },
];

export function DocumentSettingsDialog({ envelope, open, onOpenChange, onSuccess }: Props) {
  const { getAccessToken } = usePlatformToken();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [language, setLanguage] = useState(envelope.language || "en");
  const [signatureTypes, setSignatureTypes] = useState("type_draw_upload");
  const [dateFormat, setDateFormat] = useState(envelope.dateFormat || "YYYY-MM-DD hh:mm AM/PM");
  const [timezone, setTimezone] = useState(envelope.timezone || "Etc/UTC");
  const [externalId, setExternalId] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [distributionMethod, setDistributionMethod] = useState("email");

  // Expiration settings
  const [expirationMode, setExpirationMode] = useState<"custom" | "never">("custom");
  const [expirationCount, setExpirationCount] = useState("30");
  const [expirationUnit, setExpirationUnit] = useState<"days" | "weeks" | "months" | "years">("days");

  // Reminders
  const [autoReminders, setAutoReminders] = useState(true);
  const [firstReminderDays, setFirstReminderDays] = useState("3");
  const [repeatReminderDays, setRepeatReminderDays] = useState("2");

  // Notifications
  const [notifyOnView, setNotifyOnView] = useState(true);
  const [notifyOnSign, setNotifyOnSign] = useState(true);
  const [attachCompletedPdf, setAttachCompletedPdf] = useState(true);

  // Security
  const [requirePasscode, setRequirePasscode] = useState(false);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState("60");

  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLanguage(envelope.language || "en");
      setSignatureTypes(envelope.allowedSignatureTypes || "type_draw_upload");
      setDateFormat(envelope.dateFormat || "YYYY-MM-DD hh:mm AM/PM");
      setTimezone(envelope.timezone || "Etc/UTC");
      setExternalId(envelope.externalId || "");
      setRedirectUrl(envelope.redirectUrl || "");
      setDistributionMethod(envelope.distributionMethod || "email");

      if (envelope.expiresAt) {
        setExpirationMode("custom");
        const diffMs = new Date(envelope.expiresAt).getTime() - Date.now();
        const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        setExpirationCount(String(diffDays));
        setExpirationUnit("days");
      } else {
        setExpirationMode("never");
        setExpirationCount("30");
        setExpirationUnit("days");
      }

      setAutoReminders(envelope.autoReminders ?? true);
      setFirstReminderDays(envelope.firstReminderDays != null ? String(envelope.firstReminderDays) : "3");
      setRepeatReminderDays(envelope.repeatReminderDays != null ? String(envelope.repeatReminderDays) : "2");
      setNotifyOnView(envelope.notifyOnView ?? true);
      setNotifyOnSign(envelope.notifyOnSign ?? true);
      setAttachCompletedPdf(envelope.attachCompletedPdf ?? true);
      setSessionTimeoutMinutes(envelope.sessionTimeoutMinutes != null ? String(envelope.sessionTimeoutMinutes) : "60");
      setRequirePasscode(envelope.requirePasscode ?? false);
      setError(null);
    }
  }, [envelope, open]);

  const computeExpiresAt = (): string | null => {
    if (expirationMode === "never") return null;
    const num = parseInt(expirationCount, 10) || 30;
    const date = new Date();
    if (expirationUnit === "days") {
      date.setDate(date.getDate() + num);
    } else if (expirationUnit === "weeks") {
      date.setDate(date.getDate() + num * 7);
    } else if (expirationUnit === "months") {
      date.setMonth(date.getMonth() + num);
    } else if (expirationUnit === "years") {
      date.setFullYear(date.getFullYear() + num);
    }
    return date.toISOString();
  };

  const handleUpdate = async () => {
    setIsUpdating(true);
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Authentication required.");

      const expiresAt = computeExpiresAt();

      await updateEnvelope(token, envelope.id, {
        language,
        timezone,
        dateFormat,
        allowedSignatureTypes: signatureTypes,
        distributionMethod,
        externalId: externalId.trim() || null,
        redirectUrl: redirectUrl.trim() || null,
        autoReminders,
        firstReminderDays: parseInt(firstReminderDays, 10) || 3,
        repeatReminderDays: parseInt(repeatReminderDays, 10) || 2,
        notifyOnView,
        notifyOnSign,
        attachCompletedPdf,
        sessionTimeoutMinutes: parseInt(sessionTimeoutMinutes, 10) || 60,
        requirePasscode,
        expiresAt,
      });

      await queryClient.invalidateQueries({ queryKey: ["envelope", envelope.id] });
      await queryClient.invalidateQueries({ queryKey: ["envelopes"] });
      onSuccess?.();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Failed to update document settings.");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl w-full sm:w-[920px] p-0 overflow-hidden border-border bg-card shadow-2xl rounded-3xl">
        <div className="flex flex-col sm:flex-row min-h-[620px] w-full">
          {/* Left Navigation Sidebar */}
          <div className="w-full sm:w-64 shrink-0 border-b sm:border-b-0 sm:border-r border-border bg-surface-subtle/70 p-6 flex flex-col justify-between">
            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-base text-foreground">Document Settings</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Configure document options</p>
              </div>

              <nav className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab("general")}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition text-left",
                    activeTab === "general"
                      ? "bg-background text-foreground shadow-xs ring-1 ring-border"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  <Settings className="size-4 text-primary" />
                  <span>General</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("reminders")}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition text-left",
                    activeTab === "reminders"
                      ? "bg-background text-foreground shadow-xs ring-1 ring-border"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  <Bell className="size-4 text-amber-500" />
                  <span>Reminders</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("notifications")}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition text-left",
                    activeTab === "notifications"
                      ? "bg-background text-foreground shadow-xs ring-1 ring-border"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  <Mail className="size-4 text-blue-500" />
                  <span>Notifications</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("security")}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition text-left",
                    activeTab === "security"
                      ? "bg-background text-foreground shadow-xs ring-1 ring-border"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  <Shield className="size-4 text-emerald-500" />
                  <span>Security</span>
                </button>
              </nav>
            </div>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 flex flex-col justify-between p-8 bg-card min-h-[620px]">
            <div className="space-y-6 overflow-y-auto max-h-[68vh] pe-2">
              {/* Tab: General */}
              {activeTab === "general" && (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-base font-bold text-foreground">General</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Configure document settings and options before sending.
                    </p>
                  </div>

                  <div className="space-y-4 pt-1">
                    {/* Language Dropdown */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="doc-language" className="text-xs font-semibold text-foreground">
                          Language
                        </Label>
                        <span title="The primary language used in recipient notification emails and UI prompts">
                          <Info className="size-3.5 text-muted-foreground cursor-help" />
                        </span>
                      </div>
                      <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger id="doc-language" className="h-11">
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                        <SelectContent>
                          {LANGUAGE_OPTIONS.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value}>
                              {lang.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Allowed Signature Types */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="doc-sig-types" className="text-xs font-semibold text-foreground">
                          Allowed Signature Types
                        </Label>
                        <span title="Methods signers can use to create their cryptographic signatures">
                          <Info className="size-3.5 text-muted-foreground cursor-help" />
                        </span>
                      </div>
                      <Select value={signatureTypes} onValueChange={setSignatureTypes}>
                        <SelectTrigger id="doc-sig-types" className="h-11">
                          <SelectValue placeholder="Select signature types" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="type_draw_upload">Type, Draw, Upload</SelectItem>
                          <SelectItem value="draw_only">Draw Only (Handwritten)</SelectItem>
                          <SelectItem value="type_draw">Type or Draw Only</SelectItem>
                          <SelectItem value="upload_only">Upload Signature Image Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Date Format */}
                    <div className="space-y-1.5">
                      <Label htmlFor="doc-date-format" className="text-xs font-semibold text-foreground">
                        Date Format
                      </Label>
                      <Select value={dateFormat} onValueChange={setDateFormat}>
                        <SelectTrigger id="doc-date-format" className="h-11">
                          <SelectValue placeholder="Select date format" />
                        </SelectTrigger>
                        <SelectContent>
                          {DATE_FORMAT_OPTIONS.map((format) => (
                            <SelectItem key={format} value={format}>
                              {format}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Time Zone */}
                    <div className="space-y-1.5">
                      <Label htmlFor="doc-timezone" className="text-xs font-semibold text-foreground">
                        Time Zone
                      </Label>
                      <Select value={timezone} onValueChange={setTimezone}>
                        <SelectTrigger id="doc-timezone" className="h-11">
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONE_OPTIONS.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                              {tz.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* External ID */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="doc-external-id" className="text-xs font-semibold text-foreground">
                          External ID
                        </Label>
                        <span title="Optional custom identifier for linking this document to external ERP or CRM records">
                          <Info className="size-3.5 text-muted-foreground cursor-help" />
                        </span>
                      </div>
                      <Input
                        id="doc-external-id"
                        value={externalId}
                        onChange={(e) => setExternalId(e.target.value)}
                        placeholder="e.g. CRM-DEAL-84920"
                        className="h-11 rounded-2xl text-xs px-3.5"
                      />
                    </div>

                    {/* Redirect URL */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="doc-redirect-url" className="text-xs font-semibold text-foreground">
                          Redirect URL
                        </Label>
                        <span title="URL where signers are redirected after completing their signatures">
                          <Info className="size-3.5 text-muted-foreground cursor-help" />
                        </span>
                      </div>
                      <Input
                        id="doc-redirect-url"
                        value={redirectUrl}
                        onChange={(e) => setRedirectUrl(e.target.value)}
                        placeholder="https://company.com/thank-you"
                        className="h-11 rounded-2xl text-xs px-3.5"
                      />
                    </div>

                    {/* Document Distribution Method */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="doc-distribution" className="text-xs font-semibold text-foreground">
                          Document Distribution Method
                        </Label>
                        <span title="How the document invitation will be sent to the recipients">
                          <Info className="size-3.5 text-muted-foreground cursor-help" />
                        </span>
                      </div>
                      <Select value={distributionMethod} onValueChange={setDistributionMethod}>
                        <SelectTrigger id="doc-distribution" className="h-11">
                          <SelectValue placeholder="Select distribution method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="none">None (Direct Link Only)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Expiration Settings */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs font-semibold text-foreground">
                          Expiration
                        </Label>
                        <span title="Set when this agreement will expire and no longer accept signatures">
                          <Info className="size-3.5 text-muted-foreground cursor-help" />
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setExpirationMode("custom")}
                          className={cn(
                            "flex items-center justify-between rounded-2xl border p-3 text-xs transition",
                            expirationMode === "custom"
                              ? "border-primary bg-primary/5 font-semibold text-foreground ring-1 ring-primary/20"
                              : "border-border/80 bg-background text-muted-foreground hover:bg-surface-subtle",
                          )}
                        >
                          <span>Custom duration</span>
                          {expirationMode === "custom" && <Check className="size-3.5 text-primary" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => setExpirationMode("never")}
                          className={cn(
                            "flex items-center justify-between rounded-2xl border p-3 text-xs transition",
                            expirationMode === "never"
                              ? "border-primary bg-primary/5 font-semibold text-foreground ring-1 ring-primary/20"
                              : "border-border/80 bg-background text-muted-foreground hover:bg-surface-subtle",
                          )}
                        >
                          <span>Never expires</span>
                          {expirationMode === "never" && <Check className="size-3.5 text-primary" />}
                        </button>
                      </div>

                      {expirationMode === "custom" && (
                        <div className="flex items-center gap-2 pt-1 animate-in fade-in">
                          <Input
                            type="number"
                            min={1}
                            max={365}
                            value={expirationCount}
                            onChange={(e) => setExpirationCount(e.target.value)}
                            className="h-11 w-32 rounded-2xl text-xs px-3.5"
                          />
                          <Select value={expirationUnit} onValueChange={(val) => setExpirationUnit(val as any)}>
                            <SelectTrigger className="h-11 flex-1">
                              <SelectValue placeholder="Select unit" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="days">Days</SelectItem>
                              <SelectItem value="weeks">Weeks</SelectItem>
                              <SelectItem value="months">Months</SelectItem>
                              <SelectItem value="years">Years</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Reminders */}
              {activeTab === "reminders" && (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-base font-bold text-foreground">Automatic Reminders</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Send automated reminder notifications to pending signers.
                    </p>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div className="flex items-center justify-between rounded-2xl border p-4 bg-surface-subtle/50">
                      <div>
                        <p className="font-semibold text-foreground text-sm">Enable Automated Reminders</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Periodically email signers until the document is completed.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={autoReminders}
                        onChange={(e) => setAutoReminders(e.target.checked)}
                        className="size-5 accent-primary cursor-pointer rounded"
                      />
                    </div>

                    {autoReminders && (
                      <div className="grid sm:grid-cols-2 gap-4 pt-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">First reminder (days)</Label>
                          <Input
                            type="number"
                            value={firstReminderDays}
                            onChange={(e) => setFirstReminderDays(e.target.value)}
                            min={1}
                            max={30}
                            className="h-11 rounded-2xl text-xs px-3.5"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Repeat interval (days)</Label>
                          <Input
                            type="number"
                            value={repeatReminderDays}
                            onChange={(e) => setRepeatReminderDays(e.target.value)}
                            min={1}
                            max={14}
                            className="h-11 rounded-2xl text-xs px-3.5"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab: Notifications */}
              {activeTab === "notifications" && (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-base font-bold text-foreground">Notification Preferences</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Configure activity alerts sent to your email.
                    </p>
                  </div>

                  <div className="space-y-3 text-xs">
                    <label className="flex items-center justify-between rounded-2xl border p-4 bg-surface-subtle/50 cursor-pointer hover:bg-surface-subtle transition">
                      <div>
                        <p className="font-semibold text-foreground text-sm">Email on Document Viewed</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Receive notification when a recipient opens the signing link.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifyOnView}
                        onChange={(e) => setNotifyOnView(e.target.checked)}
                        className="size-5 accent-primary cursor-pointer rounded"
                      />
                    </label>

                    <label className="flex items-center justify-between rounded-2xl border p-4 bg-surface-subtle/50 cursor-pointer hover:bg-surface-subtle transition">
                      <div>
                        <p className="font-semibold text-foreground text-sm">Email on Recipient Signed</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Receive immediate notification each time a party signs.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifyOnSign}
                        onChange={(e) => setNotifyOnSign(e.target.checked)}
                        className="size-5 accent-primary cursor-pointer rounded"
                      />
                    </label>

                    <label className="flex items-center justify-between rounded-2xl border p-4 bg-surface-subtle/50 cursor-pointer hover:bg-surface-subtle transition">
                      <div>
                        <p className="font-semibold text-foreground text-sm">Attach Completed PDF</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Include signed PDF copy in completion confirmation emails.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={attachCompletedPdf}
                        onChange={(e) => setAttachCompletedPdf(e.target.checked)}
                        className="size-5 accent-primary cursor-pointer rounded"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Tab: Security */}
              {activeTab === "security" && (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-base font-bold text-foreground">Security & Access Policy</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Manage cryptographic validation, access restrictions, and timeouts.
                    </p>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-1.5">
                      <div className="flex items-center gap-2 font-bold text-sm text-emerald-600 dark:text-emerald-400">
                        <Shield className="size-4" />
                        <span>Cryptographic SHA-256 Validation Active</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Original and final documents are stamped with tamper-evident digital hashes stored in the audit log.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="doc-timeout" className="text-xs font-semibold text-foreground">
                        Signing Session Timeout (minutes)
                      </Label>
                      <Input
                        id="doc-timeout"
                        type="number"
                        value={sessionTimeoutMinutes}
                        onChange={(e) => setSessionTimeoutMinutes(e.target.value)}
                        min={15}
                        max={1440}
                        className="h-11 rounded-2xl text-xs px-3.5"
                      />
                    </div>
                  </div>
                </div>
              )}

              {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-5 border-t border-border mt-4">
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={() => onOpenChange(false)}
                className="h-10 px-5 rounded-xl text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="default"
                disabled={isUpdating}
                onClick={() => void handleUpdate()}
                className="h-10 px-6 rounded-xl text-xs font-bold bg-[#a3e635] hover:bg-[#84cc16] text-black shadow-sm transition"
              >
                {isUpdating ? <Loader2 className="size-3.5 animate-spin me-1.5" /> : null}
                <span>Update</span>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
