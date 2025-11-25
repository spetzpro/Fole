import React from "react";
import type { ReactNode } from "react";
import { getErrorSurface } from "./ErrorSurface";

export interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
}

export class ErrorBoundary extends React.Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	state: ErrorBoundaryState = { hasError: false };

	static getDerivedStateFromError(): ErrorBoundaryState {
		return { hasError: true };
	}

	componentDidCatch(error: unknown): void {
		try {
			getErrorSurface().reportError(error);
		} catch {
			// UI error reporting must never crash the app.
		}
	}

	render(): ReactNode {
		if (this.state.hasError) {
			return this.props.fallback ?? null;
		}
		return this.props.children;
	}
}
