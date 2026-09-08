type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
    __lovableReportRuntimeError?: (payload: {
      message: string;
      stack?: string;
      filename?: string;
    }) => void;
  }
}

/** Portée privée : tant qu'un espace de conception est ouvert, aucune donnée du projet
 * (géométrie, contenu de fichier, réponses de qualification, dossier) ne doit sortir par
 * la télémétrie. On n'émet alors qu'un code d'erreur fixe, sans message d'origine,
 * sans pile d'appels et sans contexte applicatif.
 */
let privateScopes = 0;

export function openPrivateErrorScope(): () => void {
  privateScopes += 1;
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    privateScopes = Math.max(0, privateScopes - 1);
  };
}

export function isPrivateErrorScopeActive(): boolean {
  return privateScopes > 0;
}

/** Messages fixes autorisés en portée privée : aucun texte dynamique. */
export const PRIVATE_ERROR_CODES = {
  design_workspace: "design_workspace_error",
  design_model: "design_model_error",
} as const;

export type PrivateErrorCode = (typeof PRIVATE_ERROR_CODES)[keyof typeof PRIVATE_ERROR_CODES];

function forward(message: string, stack: string | undefined, context: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.__lovableEvents?.captureException?.(new Error(message), context, {
    mechanism: "react_error_boundary",
    handled: false,
    severity: "error",
  });
  window.__lovableReportRuntimeError?.({
    message,
    ...(stack !== undefined && { stack }),
    filename: window.location.pathname,
  });
}

/** Signalement volontairement anonyme, utilisé par les frontières privées. */
export function reportPrivateError(code: PrivateErrorCode) {
  forward(code, undefined, { source: "private_boundary", code });
}

export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  // Un espace privé est ouvert : on n'envoie ni message, ni pile, ni contexte applicatif.
  if (isPrivateErrorScopeActive()) {
    reportPrivateError(PRIVATE_ERROR_CODES.design_workspace);
    return;
  }
  // Prod React does not rethrow boundary-caught errors to window.onerror, so the
  // editor's telemetry never sees them. Forward to lovable.js's reporting hook,
  // which is present only inside the editor preview.
  // Loaders and server fns commonly throw a raw Response; String(it) is the
  // opaque "[object Response]", so pull out the status and URL instead.
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  forward(message, stack, {
    source: "react_error_boundary",
    route: window.location.pathname,
    ...context,
  });
}
