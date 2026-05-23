import { fetch } from "@/core/api/fetcher";
import { parseAuthError } from "@/core/auth/types";
import { getBackendBaseURL } from "@/core/config";

import {
  usersResponseSchema,
  type CreateUserRequest,
  type SystemUser,
  type UpdateUserStatusRequest,
} from "./types";

export async function listUsers(): Promise<SystemUser[]> {
  const res = await fetch(`${getBackendBaseURL()}/api/v1/auth/users`);
  if (!res.ok) throw new Error(`Failed to load users: ${res.statusText}`);
  const data = usersResponseSchema.parse(await res.json());
  return data.users;
}

export async function createUser(
  request: CreateUserRequest,
): Promise<SystemUser> {
  const res = await fetch(`${getBackendBaseURL()}/api/v1/auth/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(parseAuthError(data).message);
  }

  return res.json() as Promise<SystemUser>;
}

export async function updateUserStatus({
  userId,
  isDisabled,
}: UpdateUserStatusRequest): Promise<SystemUser> {
  const res = await fetch(
    `${getBackendBaseURL()}/api/v1/auth/users/${userId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_disabled: isDisabled }),
    },
  );

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(parseAuthError(data).message);
  }

  return res.json() as Promise<SystemUser>;
}
