"use client";

import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Fingerprint,
  Globe,
  Key,
  KeyRound,
  Laptop,
  Loader2,
  Lock,
  LogOut,
  QrCode,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useState } from "react";

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
import { useMe } from "@/hooks/use-envelope-api";

export default function SecuritySettingsPage() {
  const me = useMe().data?.user;

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // 2FA state
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [is2FAModalOpen, setIs2FAModalOpen] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);

  // Passkeys state
  const [isPasskeysModalOpen, setIsPasskeysModalOpen] = useState(false);
  const [passkeys, setPasskeys] = useState<Array<{ id: string; name: string; created: string; lastUsed: string }>>([
    { id: "pk-1", name: "Windows Hello (Work PC)", created: "Aug 30, 2026", lastUsed: "Today, 08:24 AM" },
  ]);
  const [newPasskeyName, setNewPasskeyName] = useState("");
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);

  // Activity state
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);

  // Sessions state
  const [isSessionsModalOpen, setIsSessionsModalOpen] = useState(false);
  const [sessions, setSessions] = useState([
    {
      id: "sess-1",
      device: "Windows 11 · Chrome 128",
      ip: "127.0.0.1",
      location: "Local Workspace",
      current: true,
      lastActive: "Active now",
    },
    {
      id: "sess-2",
      device: "iPhone 15 Pro · Safari Mobile",
      ip: "192.168.1.42",
      location: "Local Network",
      current: false,
      lastActive: "Yesterday at 18:40",
    },
  ]);

  // Linked accounts state
  const [isLinkedAccountsModalOpen, setIsLinkedAccountsModalOpen] = useState(false);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword !== confirmPassword) {
      setPasswordStatus({ text: "New passwords do not match.", type: "error" });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordStatus({ text: "Password must be at least 8 characters.", type: "error" });
      return;
    }

    setIsUpdatingPassword(true);
    setPasswordStatus(null);
    setTimeout(() => {
      setIsUpdatingPassword(false);
      setPasswordStatus({ text: "Password updated successfully!", type: "success" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }, 900);
  };

  const handleVerify2FA = (e: React.FormEvent) => {
    e.preventDefault();
    if (twoFactorCode.length < 6) return;
    setIsVerifying2FA(true);
    setTimeout(() => {
      setIsVerifying2FA(false);
      setIs2FAEnabled(true);
      setIs2FAModalOpen(false);
      setTwoFactorCode("");
    }, 800);
  };

  const handleAddPasskey = () => {
    const name = newPasskeyName.trim() || "Hardware Security Key";
    setIsRegisteringPasskey(true);
    setTimeout(() => {
      setIsRegisteringPasskey(false);
      setPasskeys((prev) => [
        ...prev,
        {
          id: `pk-${Date.now()}`,
          name,
          created: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          lastUsed: "Just now",
        },
      ]);
      setNewPasskeyName("");
    }, 700);
  };

  const handleDeletePasskey = (id: string) => {
    setPasskeys((prev) => prev.filter((p) => p.id !== id));
  };

  const handleRevokeOtherSessions = () => {
    setSessions((prev) => prev.filter((s) => s.current));
  };

  return (
    <div className="space-y-8 max-w-4xl pb-16">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Security</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Here you can manage your password and security settings.
        </p>
      </div>

      {/* Password Change Card */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-2xs space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <KeyRound className="size-4 text-primary" />
            Password
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Update the password associated with your signing account.
          </p>
        </div>

        {passwordStatus && (
          <div
            className={`flex items-center gap-2 rounded-xl p-3 text-xs ${
              passwordStatus.type === "success"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                : "bg-destructive/10 text-destructive border border-destructive/20"
            }`}
          >
            {passwordStatus.type === "success" ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <AlertCircle className="size-4 shrink-0" />
            )}
            <span>{passwordStatus.text}</span>
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="space-y-4 pt-1">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Current password</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="h-9 text-xs rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">New password</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="h-9 text-xs rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Confirm new password</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="h-9 text-xs rounded-xl"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              size="sm"
              disabled={isUpdatingPassword}
              className="rounded-xl h-9 text-xs gap-2"
            >
              {isUpdatingPassword ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Update password
            </Button>
          </div>
        </form>
      </div>

      {/* Security Features Alerts Stack (Documenso Pattern) */}
      <div className="space-y-4">
        {/* 1. Two-Factor Authentication */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
          <div className="space-y-1 pr-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Two factor authentication</h3>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  is2FAEnabled
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25"
                    : "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border border-neutral-500/20"
                }`}
              >
                {is2FAEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Add an authenticator to serve as a secondary authentication method for signing documents.
            </p>
          </div>

          <Button
            variant={is2FAEnabled ? "outline" : "default"}
            size="sm"
            onClick={() => (is2FAEnabled ? setIs2FAEnabled(false) : setIs2FAModalOpen(true))}
            className="shrink-0 rounded-xl h-9 text-xs"
          >
            {is2FAEnabled ? "Disable 2FA" : "Enable 2FA"}
          </Button>
        </div>

        {/* 2. Passkeys */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
          <div className="space-y-1 pr-4">
            <h3 className="text-sm font-semibold text-foreground">Passkeys</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Allows authenticating using biometrics, password managers, hardware keys, etc.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPasskeysModalOpen(true)}
            className="shrink-0 rounded-xl h-9 text-xs"
          >
            Manage passkeys
          </Button>
        </div>

        {/* 3. Recent Activity */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
          <div className="space-y-1 pr-4">
            <h3 className="text-sm font-semibold text-foreground">Recent activity</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              View all recent security activity related to your account.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsActivityModalOpen(true)}
            className="shrink-0 rounded-xl h-9 text-xs"
          >
            View activity
          </Button>
        </div>

        {/* 4. Active Sessions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
          <div className="space-y-1 pr-4">
            <h3 className="text-sm font-semibold text-foreground">Active sessions</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              View and manage all active sessions for your account.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSessionsModalOpen(true)}
            className="shrink-0 rounded-xl h-9 text-xs"
          >
            Manage sessions
          </Button>
        </div>

        {/* 5. Linked Accounts */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
          <div className="space-y-1 pr-4">
            <h3 className="text-sm font-semibold text-foreground">Linked Accounts</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              View and manage all login methods linked to your account.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsLinkedAccountsModalOpen(true)}
            className="shrink-0 rounded-xl h-9 text-xs"
          >
            Manage linked accounts
          </Button>
        </div>
      </div>

      {/* ──────────────── DIALOGS ──────────────── */}

      {/* Dialog 1: Enable 2FA */}
      <Dialog open={is2FAModalOpen} onOpenChange={setIs2FAModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              Set up Two-Factor Authentication
            </DialogTitle>
            <DialogDescription className="text-xs">
              Scan this QR code with your authenticator app (Google Authenticator, 1Password, Authy), then enter the 6-digit code.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 flex flex-col items-center justify-center p-4 rounded-2xl border border-border/70 bg-muted/30">
            <div className="size-40 rounded-xl bg-background border p-2 flex items-center justify-center shadow-xs">
              <QrCode className="size-32 text-foreground" />
            </div>
            <p className="text-[11px] font-mono text-muted-foreground mt-3 select-all">
              SECRET: JBSWY3DPEHPK3PXP
            </p>
          </div>

          <form onSubmit={handleVerify2FA} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">6-Digit Verification Code</Label>
              <Input
                placeholder="123456"
                maxLength={6}
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                autoFocus
                className="h-10 text-center text-lg tracking-widest font-mono rounded-xl"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIs2FAModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={twoFactorCode.length < 6 || isVerifying2FA}>
                {isVerifying2FA ? <Loader2 className="size-3.5 animate-spin" /> : "Verify & Enable"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog 2: Passkeys */}
      <Dialog open={isPasskeysModalOpen} onOpenChange={setIsPasskeysModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Fingerprint className="size-5 text-primary" />
              Manage Passkeys
            </DialogTitle>
            <DialogDescription className="text-xs">
              Passkeys let you sign in and sign documents securely using Windows Hello, Face ID, or a hardware key.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-4">
            {passkeys.map((pk) => (
              <div
                key={pk.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/70 bg-muted/20"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Fingerprint className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{pk.name}</p>
                    <p className="text-[11px] text-muted-foreground">Created {pk.created} · Used {pk.lastUsed}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDeletePasskey(pk.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}

            <div className="pt-2 border-t border-border/60">
              <Label className="text-xs font-semibold">Register New Passkey</Label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  placeholder="Key name (e.g. YubiKey 5C, MacBook Touch ID)"
                  value={newPasskeyName}
                  onChange={(e) => setNewPasskeyName(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
                <Button
                  size="sm"
                  onClick={handleAddPasskey}
                  disabled={isRegisteringPasskey}
                  className="rounded-xl h-9 text-xs shrink-0 gap-1.5"
                >
                  {isRegisteringPasskey ? <Loader2 className="size-3.5 animate-spin" /> : <Fingerprint className="size-3.5" />}
                  Register
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsPasskeysModalOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 3: Recent Activity */}
      <Dialog open={isActivityModalOpen} onOpenChange={setIsActivityModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Clock className="size-5 text-primary" />
              Recent Security Activity
            </DialogTitle>
            <DialogDescription className="text-xs">
              Audit record of authentication events, password updates, and signed documents.
            </DialogDescription>
          </DialogHeader>

          <div className="divide-y rounded-xl border border-border/70 my-4 max-h-72 overflow-y-auto">
            <div className="p-3 text-xs flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">Signed in successfully</p>
                <p className="text-[11px] text-muted-foreground">Windows 11 · Chrome · IP 127.0.0.1</p>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">Today, 08:24 AM</span>
            </div>
            <div className="p-3 text-xs flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">Envelope Signed</p>
                <p className="text-[11px] text-muted-foreground">Mutual Non-Disclosure Agreement (NDA)</p>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">Aug 30, 2026</span>
            </div>
            <div className="p-3 text-xs flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">Account Created</p>
                <p className="text-[11px] text-muted-foreground">WorkOS Enterprise SSO</p>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">Aug 30, 2026</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsActivityModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 4: Active Sessions */}
      <Dialog open={isSessionsModalOpen} onOpenChange={setIsSessionsModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Laptop className="size-5 text-primary" />
              Active Sessions
            </DialogTitle>
            <DialogDescription className="text-xs">
              These devices are currently logged into your account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 my-4">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/70 bg-card"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                    {sess.device.includes("iPhone") ? <Smartphone className="size-4" /> : <Laptop className="size-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-foreground truncate">{sess.device}</p>
                      {sess.current && (
                        <span className="rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 px-1.5 py-0.2 text-[10px] font-bold">
                          Current device
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{sess.location} · {sess.lastActive}</p>
                  </div>
                </div>

                {!sess.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => setSessions((prev) => prev.filter((s) => s.id !== sess.id))}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {sessions.length > 1 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRevokeOtherSessions}
                className="rounded-xl h-9 text-xs"
              >
                Sign out other sessions
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setIsSessionsModalOpen(false)} className="ml-auto">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 5: Linked Accounts */}
      <Dialog open={isLinkedAccountsModalOpen} onOpenChange={setIsLinkedAccountsModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <UserCheck className="size-5 text-primary" />
              Linked Authentication Accounts
            </DialogTitle>
            <DialogDescription className="text-xs">
              Providers linked to your account for single sign-on authentication.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-4">
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/70 bg-card">
              <div className="flex items-center gap-3">
                <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                  @
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Email & Password</p>
                  <p className="text-[11px] text-muted-foreground">{me?.email}</p>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Connected</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border border-border/70 bg-card">
              <div className="flex items-center gap-3">
                <div className="grid size-8 place-items-center rounded-lg bg-muted font-bold text-xs">
                  G
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Google OAuth</p>
                  <p className="text-[11px] text-muted-foreground">One-click signing</p>
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground">Not linked</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border border-border/70 bg-card">
              <div className="flex items-center gap-3">
                <div className="grid size-8 place-items-center rounded-lg bg-blue-500/10 text-blue-600 font-bold text-xs">
                  W
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">WorkOS Enterprise SSO</p>
                  <p className="text-[11px] text-muted-foreground">SAML / OIDC</p>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Connected</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsLinkedAccountsModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
