import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  resetKey: number;
}

const TRANSLATE_ERROR_PATTERNS = [
  "removeChild",
  "insertBefore",
  "NotFoundError",
  "The node to be removed",
  "The node before which the new node is to be inserted",
];

function isTranslateInducedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = `${error.name} ${error.message}`;
  return TRANSLATE_ERROR_PATTERNS.some((p) => message.includes(p));
}

/**
 * Catches the DOM-mutation errors that Chrome's auto-translate triggers
 * during React reconciliation and silently remounts the affected subtree
 * instead of leaving the user on a frozen page.
 */
export class TranslationErrorBoundary extends React.Component<Props, State> {
  state: State = { resetKey: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> | null {
    if (isTranslateInducedError(error)) {
      return null;
    }
    throw error;
  }

  componentDidCatch(error: unknown): void {
    if (isTranslateInducedError(error)) {
      console.warn("[translate-safe] recovered from translator-induced DOM error", error);
      this.setState((s) => ({ resetKey: s.resetKey + 1 }));
    }
  }

  render() {
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}
