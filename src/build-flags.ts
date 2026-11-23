// Build-time feature flags. Production builds omit VITE_DEBUG_DIAG.
export const DEBUG_DIAG = import.meta.env.VITE_DEBUG_DIAG === "1"
