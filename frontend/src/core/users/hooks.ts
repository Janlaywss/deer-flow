import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createUser, listUsers, updateUserStatus } from "./api";
import type { CreateUserRequest, UpdateUserStatusRequest } from "./types";

export function useUsers({ enabled = true }: { enabled?: boolean } = {}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn: () => listUsers(),
    enabled,
  });

  return { users: data ?? [], isLoading, error };
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateUserRequest) => createUser(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateUserStatusRequest) => updateUserStatus(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
