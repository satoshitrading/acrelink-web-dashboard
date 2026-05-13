import React from "react";

interface SafeTextProps {
  children: React.ReactNode;
  /** Set true when the surrounding subtree must not be translated at all. */
  notranslate?: boolean;
  className?: string;
}

/**
 * Wraps raw text in an extra span so that Chrome's translator mutates a node
 * React doesn't directly track, sparing the parent from reconciliation
 * crashes. Use anywhere a translated text label sits next to React-managed
 * siblings (icons, conditional fragments, dynamic lists).
 */
export function SafeText({ children, notranslate, className }: SafeTextProps) {
  if (notranslate) {
    return (
      <span translate="no" className={className ? `notranslate ${className}` : "notranslate"}>
        {children}
      </span>
    );
  }
  return <span className={className}>{children}</span>;
}
