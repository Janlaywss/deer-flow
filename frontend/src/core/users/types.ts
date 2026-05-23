import { z } from "zod";

import { userSchema } from "@/core/auth/types";

export const usersResponseSchema = z.object({
  users: z.array(userSchema),
});

export interface CreateUserRequest {
  email: string;
  password: string;
}

export interface UpdateUserStatusRequest {
  userId: string;
  isDisabled: boolean;
}

export type SystemUser = z.infer<typeof userSchema>;
export type UsersResponse = z.infer<typeof usersResponseSchema>;
