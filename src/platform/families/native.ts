import { invoke } from "@tauri-apps/api/core"
import type { PawchiveApiTransport } from "../contracts"

export const pawchiveApiTransport: PawchiveApiTransport = {
  request: ({ path, method, sessionKey, timeoutSecs }) =>
    invoke<string>("api_request", { path, method, sessionKey, timeoutSecs }),
}
