import { apiFetch } from "@/api/client";
import type { AccessTokenResponse, LoginRequest, RegisterRequest, UserPublic } from "@/api/types";

export function register(body: RegisterRequest): Promise<UserPublic> {
  return apiFetch<UserPublic>("/api/v1/auth/register", { method: "POST", json: body });
}

export function login(body: LoginRequest): Promise<AccessTokenResponse> {
  return apiFetch<AccessTokenResponse>("/api/v1/auth/login", { method: "POST", json: body });
}

export function logout(): Promise<void> {
  return apiFetch<void>("/api/v1/auth/logout", { method: "POST" });
}
