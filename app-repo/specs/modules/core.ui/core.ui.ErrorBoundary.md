# Module: core.ui.ErrorBoundary

## 1. Purpose
React error boundary to catch render errors and show a fallback UI.

## 2. Public API
~~~ts
import type { ReactNode } from "react";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function ErrorBoundary(props: ErrorBoundaryProps): JSX.Element;
~~~
