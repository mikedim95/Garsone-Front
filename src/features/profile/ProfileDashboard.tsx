import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Check, ShieldCheck, X } from "lucide-react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { PageTransition } from "@/components/ui/page-transition";
import { useDashboardTheme } from "@/hooks/useDashboardDark";
import { useAuthStore } from "@/store/authStore";
import type { User } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PROFILE_ROLES = new Set(["waiter", "manager", "cook"]);
const ROLE_LABELS: Record<string, string> = {
  waiter: "Waiter",
  manager: "Manager",
  cook: "Cook",
  architect: "Architect",
};

const getInitials = (name?: string | null, email?: string | null) => {
  const source = (name || "").trim() || (email || "").trim();
  if (!source) return "U";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

export default function ProfileDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isAuthenticated, updateUser } = useAuthStore();
  const { dashboardDark, themeClass } = useDashboardTheme();
  const profileLabel = t("app.profile", { defaultValue: "Profile" });

  useEffect(() => {
    if (!isAuthenticated() || !user || !PROFILE_ROLES.has(user.role)) {
      navigate("/login");
    }
  }, [isAuthenticated, user, navigate]);

  const staffType = user?.waiterType ?? user?.cookType ?? null;
  const staffTypeEditable = Boolean(staffType);
  const staffTypeLabel = staffType?.title ?? "";
  const initialProfile = useMemo(
    () => ({
      displayName: user?.displayName ?? "",
      email: user?.email ?? "",
      staffTitle: staffTypeLabel,
    }),
    [staffTypeLabel, user?.displayName, user?.email]
  );
  const [profileForm, setProfileForm] = useState(initialProfile);

  useEffect(() => {
    setProfileForm(initialProfile);
  }, [initialProfile]);

  const trimmedName = profileForm.displayName.trim();
  const trimmedEmail = profileForm.email.trim();
  const trimmedStaffTitle = profileForm.staffTitle.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const nameValid = trimmedName.length >= 2;
  const staffTitleValid = staffTypeEditable ? trimmedStaffTitle.length >= 2 : true;
  const profileDirty =
    trimmedName !== initialProfile.displayName ||
    trimmedEmail !== initialProfile.email ||
    trimmedStaffTitle !== initialProfile.staffTitle;
  const canSaveProfile = profileDirty && nameValid && emailValid && staffTitleValid;

  const handleProfileReset = () => {
    setProfileForm(initialProfile);
  };

  const handleProfileSave = () => {
    if (!user || !canSaveProfile) return;
    const updates: Partial<User> = {};
    if (trimmedName && trimmedName !== user.displayName) {
      updates.displayName = trimmedName;
    }
    if (trimmedEmail && trimmedEmail !== user.email) {
      updates.email = trimmedEmail;
    }
    if (staffTypeEditable && trimmedStaffTitle && staffType) {
      if (user.waiterType) {
        updates.waiterType = { ...staffType, title: trimmedStaffTitle };
      }
      if (user.cookType) {
        updates.cookType = { ...staffType, title: trimmedStaffTitle };
      }
    }
    if (Object.keys(updates).length === 0) return;
    updateUser(updates);
    toast({
      title: t("profile.updated", { defaultValue: "Profile updated" }),
      description: t("profile.updated_desc", {
        defaultValue: "Your account details are up to date.",
      }),
    });
  };

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  const passwordChecks = useMemo(() => {
    const emailPart = (user?.email || "").toLowerCase();
    const pwd = newPassword;
    return [
      {
        key: "length",
        label: "At least 12 characters",
        passed: pwd.length >= 12,
      },
      {
        key: "upper",
        label: "At least one uppercase letter",
        passed: /[A-Z]/.test(pwd),
      },
      {
        key: "lower",
        label: "At least one lowercase letter",
        passed: /[a-z]/.test(pwd),
      },
      {
        key: "number",
        label: "At least one number",
        passed: /\d/.test(pwd),
      },
      {
        key: "symbol",
        label: "At least one symbol",
        passed: /[^A-Za-z0-9]/.test(pwd),
      },
      {
        key: "no-space",
        label: "No spaces",
        passed: !/\s/.test(pwd),
      },
      {
        key: "no-email",
        label: "Does not include your email",
        passed: emailPart ? !pwd.toLowerCase().includes(emailPart) : true,
      },
      {
        key: "not-current",
        label: "Different from current password",
        passed: currentPassword.length === 0 || pwd !== currentPassword,
      },
    ];
  }, [currentPassword, newPassword, user?.email]);

  const passwordScore = passwordChecks.filter((rule) => rule.passed).length;
  const passwordMatch =
    newPassword.length > 0 && newPassword === confirmPassword;
  const passwordRulesOk = passwordChecks.every((rule) => rule.passed);
  const canSavePassword =
    currentPassword.length > 0 && passwordRulesOk && passwordMatch;

  const passwordStrength = useMemo(() => {
    if (!newPassword) return { label: "Set password", variant: "outline" as const };
    if (passwordScore <= 3) return { label: "Weak", variant: "destructive" as const };
    if (passwordScore <= 6) return { label: "Medium", variant: "warning" as const };
    return { label: "Strong", variant: "success" as const };
  }, [newPassword, passwordScore]);

  const handlePasswordReset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const closePasswordModal = () => {
    handlePasswordReset();
    setPasswordModalOpen(false);
  };

  const handlePasswordSave = () => {
    if (!canSavePassword) return;
    closePasswordModal();
    toast({
      title: t("profile.password_updated", {
        defaultValue: "Password updated",
      }),
      description: t("profile.password_updated_desc", {
        defaultValue: "Use your new password next time you sign in.",
      }),
    });
  };

  const themedWrapper = clsx(themeClass, { dark: dashboardDark });
  const title = user?.displayName || profileLabel;
  const initials = getInitials(user?.displayName, user?.email);
  const roleLabel = user?.role ? ROLE_LABELS[user.role] || user.role : "User";
  const maskedPassword = "************";

  const handlePasswordModalChange = (open: boolean) => {
    setPasswordModalOpen(open);
    if (!open) handlePasswordReset();
  };

  return (
    <PageTransition className={clsx(themedWrapper, "min-h-screen min-h-dvh")}>
      <div className="min-h-screen min-h-dvh dashboard-bg text-foreground flex flex-col">
        <DashboardHeader
          supertitle={profileLabel}
          title={title}
          icon="ID"
          tone="secondary"
          rightContent={
            user?.email ? (
              <a
                href={`mailto:${user.email}`}
                className="font-medium underline underline-offset-2 hover:text-foreground"
              >
                {user.email}
              </a>
            ) : undefined
          }
          burgerActions={null}
        />
        <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6 flex-1 w-full">
          <div className="grid gap-6">
            <Card className="bg-card/80 border-border/60" interactive={false}>
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Avatar size="lg">
                    <AvatarFallback className="text-base font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-xl">
                      {t("profile.account_details", {
                        defaultValue: "Account details",
                      })}
                    </CardTitle>
                    <CardDescription>
                      {t("profile.account_details_desc", {
                        defaultValue: "Review and update your profile details.",
                      })}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="info">{roleLabel}</Badge>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="profile-name">
                      {t("profile.display_name", {
                        defaultValue: "Display name",
                      })}
                    </Label>
                    <Input
                      id="profile-name"
                      autoComplete="name"
                      value={profileForm.displayName}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          displayName: event.target.value,
                        }))
                      }
                    />
                    {!nameValid && (
                      <p className="text-xs text-destructive">
                        {t("profile.display_name_error", {
                          defaultValue: "Use at least 2 characters.",
                        })}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="profile-email">
                      {t("profile.email", { defaultValue: "Email" })}
                    </Label>
                    <Input
                      id="profile-email"
                      type="email"
                      autoComplete="email"
                      value={profileForm.email}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          email: event.target.value,
                        }))
                      }
                    />
                    {!emailValid && (
                      <p className="text-xs text-destructive">
                        {t("profile.email_error", {
                          defaultValue: "Enter a valid email address.",
                        })}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="profile-role">
                      {t("profile.role", { defaultValue: "Role" })}
                    </Label>
                    <Input id="profile-role" value={roleLabel} disabled />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="profile-type">
                      {t("profile.type", { defaultValue: "Type" })}
                    </Label>
                    <Input
                      id="profile-type"
                      value={profileForm.staffTitle}
                      disabled={!staffTypeEditable}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          staffTitle: event.target.value,
                        }))
                      }
                      placeholder={
                        staffTypeEditable
                          ? t("profile.type_placeholder", {
                              defaultValue: "Staff type",
                            })
                          : t("profile.type_unassigned", {
                              defaultValue: "Assigned by manager",
                            })
                      }
                    />
                    {!staffTypeEditable && (
                      <p className="text-xs text-muted-foreground">
                        {t("profile.type_note", {
                          defaultValue: "Only managers can change staff types.",
                        })}
                      </p>
                    )}
                    {staffTypeEditable && !staffTitleValid && (
                      <p className="text-xs text-destructive">
                        {t("profile.type_error", {
                          defaultValue: "Use at least 2 characters.",
                        })}
                      </p>
                    )}
                  </div>
                </div>
                <Separator />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="profile-password">
                      {t("profile.password", { defaultValue: "Password" })}
                    </Label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input
                        id="profile-password"
                        type="password"
                        value={maskedPassword}
                        disabled
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setPasswordModalOpen(true)}
                      >
                        {t("profile.change_password", {
                          defaultValue: "Change password",
                        })}
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="profile-id">
                      {t("profile.user_id", { defaultValue: "User ID" })}
                    </Label>
                    <Input id="profile-id" value={user?.id || ""} disabled />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={handleProfileReset}
                  disabled={!profileDirty}
                >
                  {t("profile.reset", { defaultValue: "Reset" })}
                </Button>
                <Button onClick={handleProfileSave} disabled={!canSaveProfile}>
                  {t("actions.save_changes", {
                    defaultValue: "Save changes",
                  })}
                </Button>
              </CardFooter>
            </Card>
          </div>
          <Dialog open={passwordModalOpen} onOpenChange={handlePasswordModalChange}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  {t("profile.change_password", {
                    defaultValue: "Change password",
                  })}
                </DialogTitle>
                <DialogDescription>
                  {t("profile.security_desc", {
                    defaultValue:
                      "Use a strong password to keep your account safe.",
                  })}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="current-password">
                    {t("profile.current_password", {
                      defaultValue: "Current password",
                    })}
                  </Label>
                  <Input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="new-password">
                    {t("profile.new_password", {
                      defaultValue: "New password",
                    })}
                  </Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="confirm-password">
                    {t("profile.confirm_password", {
                      defaultValue: "Confirm new password",
                    })}
                  </Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                  {confirmPassword.length > 0 && !passwordMatch && (
                    <p className="text-xs text-destructive">
                      {t("profile.password_mismatch", {
                        defaultValue: "Passwords do not match.",
                      })}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t("profile.password_rules", {
                        defaultValue: "Password rules",
                      })}
                    </p>
                    <Badge variant={passwordStrength.variant}>
                      {passwordStrength.label}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {passwordChecks.map((rule) => (
                      <div
                        key={rule.key}
                        className={clsx(
                          "flex items-center gap-2 text-xs",
                          rule.passed
                            ? "text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {rule.passed ? (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-destructive" />
                        )}
                        <span>{rule.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={closePasswordModal}
                >
                  {t("actions.cancel", { defaultValue: "Cancel" })}
                </Button>
                <Button
                  onClick={handlePasswordSave}
                  disabled={!canSavePassword}
                >
                  {t("profile.update_password", {
                    defaultValue: "Update password",
                  })}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </PageTransition>
  );
}
