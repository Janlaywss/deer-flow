"use client";

import {
  CircleOffIcon,
  PlusIcon,
  PowerIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

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
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/core/auth/AuthProvider";
import { useI18n } from "@/core/i18n/hooks";
import { isStaticWebsiteOnly } from "@/core/static-mode";
import {
  useCreateUser,
  useUpdateUserStatus,
  useUsers,
  type SystemUser,
} from "@/core/users";
import { cn } from "@/lib/utils";

const ROLE_ORDER: Record<SystemUser["system_role"], number> = {
  admin: 0,
  user: 1,
};

export function UserManagementPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const staticMode = isStaticWebsiteOnly();
  const canManageUsers = user?.system_role === "admin" && !staticMode;
  const { users, isLoading, error } = useUsers({ enabled: canManageUsers });
  const createUser = useCreateUser();
  const updateUserStatus = useUpdateUserStatus();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${t.users.title} - ${t.pages.appName}`;
  }, [t.pages.appName, t.users.title]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const roleDiff = ROLE_ORDER[a.system_role] - ROLE_ORDER[b.system_role];
      if (roleDiff !== 0) return roleDiff;
      return a.email.localeCompare(b.email);
    });
  }, [users]);

  const resetCreateForm = () => {
    setCreateEmail("");
    setCreatePassword("");
    setCreateError(null);
  };

  const handleCreateDialogOpenChange = (open: boolean) => {
    setIsCreateDialogOpen(open);
    if (!open) resetCreateForm();
  };

  const handleCreateUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);

    createUser.mutate(
      { email: createEmail.trim(), password: createPassword },
      {
        onSuccess: () => {
          handleCreateDialogOpenChange(false);
        },
        onError: (mutationError) => {
          setCreateError(
            mutationError instanceof Error
              ? mutationError.message
              : t.users.createErrorDescription,
          );
        },
      },
    );
  };

  const handleToggleUserStatus = (systemUser: SystemUser) => {
    setStatusError(null);

    updateUserStatus.mutate(
      {
        userId: systemUser.id,
        isDisabled: !systemUser.is_disabled,
      },
      {
        onError: (mutationError) => {
          setStatusError(
            mutationError instanceof Error
              ? mutationError.message
              : t.users.updateErrorDescription,
          );
        },
      },
    );
  };

  if (staticMode) {
    return (
      <UserManagementNotice
        title={t.users.unavailableTitle}
        description={t.common.notAvailableInDemoMode}
      />
    );
  }

  if (user?.system_role !== "admin") {
    return (
      <UserManagementNotice
        title={t.users.accessDeniedTitle}
        description={t.users.accessDeniedDescription}
      />
    );
  }

  return (
    <div className="flex size-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">{t.users.title}</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {t.users.description}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">
            {t.users.userCount(sortedUsers.length)}
          </Badge>
          <Dialog
            open={isCreateDialogOpen}
            onOpenChange={handleCreateDialogOpenChange}
          >
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <PlusIcon className="h-4 w-4" />
              {t.users.addUser}
            </Button>
            <DialogContent>
              <form className="grid gap-4" onSubmit={handleCreateUser}>
                <DialogHeader>
                  <DialogTitle>{t.users.addUser}</DialogTitle>
                  <DialogDescription>
                    {t.users.addUserDescription}
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="user-email">
                    {t.users.email}
                  </label>
                  <Input
                    id="user-email"
                    type="email"
                    autoComplete="email"
                    value={createEmail}
                    onChange={(event) => setCreateEmail(event.target.value)}
                    placeholder={t.users.emailPlaceholder}
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="user-password"
                  >
                    {t.users.password}
                  </label>
                  <Input
                    id="user-password"
                    type="password"
                    autoComplete="new-password"
                    value={createPassword}
                    onChange={(event) => setCreatePassword(event.target.value)}
                    placeholder={t.users.passwordPlaceholder}
                    minLength={8}
                    required
                  />
                  <p className="text-muted-foreground text-xs">
                    {t.users.passwordHint}
                  </p>
                </div>

                {createError && (
                  <Alert variant="destructive">
                    <AlertTitle>{t.users.createErrorTitle}</AlertTitle>
                    <AlertDescription>{createError}</AlertDescription>
                  </Alert>
                )}

                <DialogFooter>
                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={createUser.isPending}
                    >
                      {t.common.cancel}
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={createUser.isPending}>
                    {createUser.isPending ? t.users.creating : t.users.create}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {isLoading ? (
          <UserTableSkeleton />
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>{t.users.loadErrorTitle}</AlertTitle>
            <AlertDescription>{t.users.loadErrorDescription}</AlertDescription>
          </Alert>
        ) : sortedUsers.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
            <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-full">
              <UsersIcon className="text-muted-foreground h-7 w-7" />
            </div>
            <div>
              <p className="font-medium">{t.users.emptyTitle}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {t.users.emptyDescription}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {statusError && (
              <Alert variant="destructive">
                <AlertTitle>{t.users.updateErrorTitle}</AlertTitle>
                <AlertDescription>{statusError}</AlertDescription>
              </Alert>
            )}
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="h-11 px-4 text-left font-medium">
                      {t.users.email}
                    </th>
                    <th className="h-11 w-40 px-4 text-left font-medium">
                      {t.users.permission}
                    </th>
                    <th className="h-11 w-36 px-4 text-left font-medium">
                      {t.users.status}
                    </th>
                    <th className="h-11 w-36 px-4 text-right font-medium">
                      {t.users.actions}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((systemUser) => {
                    const isAdmin = systemUser.system_role === "admin";
                    const isCurrentUser = systemUser.id === user?.id;
                    const isStatusUpdating =
                      updateUserStatus.isPending &&
                      updateUserStatus.variables?.userId === systemUser.id;
                    return (
                      <tr key={systemUser.id} className="border-t">
                        <td className="max-w-0 truncate px-4 py-3 font-medium">
                          {systemUser.email}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={isAdmin ? "default" : "secondary"}
                            className={cn(!isAdmin && "text-muted-foreground")}
                          >
                            {isAdmin && <ShieldCheckIcon className="h-3 w-3" />}
                            {isAdmin ? t.users.roleAdmin : t.users.roleUser}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              systemUser.is_disabled
                                ? "destructive"
                                : "secondary"
                            }
                            className={cn(
                              !systemUser.is_disabled &&
                                "text-muted-foreground",
                            )}
                          >
                            {systemUser.is_disabled
                              ? t.users.statusDisabled
                              : t.users.statusEnabled}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant={
                              systemUser.is_disabled ? "outline" : "destructive"
                            }
                            disabled={isCurrentUser || isStatusUpdating}
                            onClick={() => handleToggleUserStatus(systemUser)}
                          >
                            {systemUser.is_disabled ? (
                              <PowerIcon className="h-4 w-4" />
                            ) : (
                              <CircleOffIcon className="h-4 w-4" />
                            )}
                            {isCurrentUser
                              ? t.users.currentAccount
                              : isStatusUpdating
                                ? t.users.updating
                                : systemUser.is_disabled
                                  ? t.users.enableUser
                                  : t.users.disableUser}
                          </Button>
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
    </div>
  );
}

function UserManagementNotice({
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

function UserTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="bg-muted/60 grid h-11 grid-cols-[1fr_10rem_9rem_9rem] gap-4 px-4">
        <Skeleton className="my-3 h-4 w-24" />
        <Skeleton className="my-3 h-4 w-16" />
        <Skeleton className="my-3 h-4 w-14" />
        <Skeleton className="my-3 ml-auto h-4 w-14" />
      </div>
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="grid h-[49px] grid-cols-[1fr_10rem_9rem_9rem] gap-4 border-t px-4"
        >
          <Skeleton className="my-4 h-4 w-56 max-w-full" />
          <Skeleton className="my-3 h-6 w-20 rounded-full" />
          <Skeleton className="my-3 h-6 w-16 rounded-full" />
          <Skeleton className="my-3 ml-auto h-8 w-20" />
        </div>
      ))}
    </div>
  );
}
