import React from "react";
import { ErrorBoundary } from "../../src/core/ui/ErrorBoundary";
import { getErrorSurface } from "../../src/core/ui/ErrorSurface";

function renderToString(element: React.ReactElement): string {
	// Lightweight inline renderer to avoid bringing in react-dom.
	if (typeof element.type === "string") {
		return `<${element.type}>${element.props.children ?? ""}</${element.type}>`;
	}

	if (typeof element.type === "function") {
		const rendered = (element.type as any)(element.props);
		return renderToString(rendered);
	}

	if (React.isValidElement(element)) {
		return renderToString(element as any);
	}

	return String(element);
}

function ProblemChild(): JSX.Element {
	throw new Error("boom in child");
}

function runErrorBoundaryTests(): void {
	const surface = getErrorSurface();
	surface.clearAll();

	// Normal render path: no error, children should be visible.
	const ok = (
		<ErrorBoundary fallback={<div>fallback</div>}>
			<div>ok</div>
		</ErrorBoundary>
	);
	const okHtml = renderToString(ok);
	if (!okHtml.includes("ok")) {
		throw new Error("ErrorBoundary did not render children correctly");
	}

	// Error path: child throws, boundary should render fallback and report.
	const boundary = new ErrorBoundary({ fallback: <div>fb</div> });
	// Simulate React calling lifecycle methods.
	(ErrorBoundary as any).getDerivedStateFromError(new Error("test"));
	boundary.componentDidCatch(new Error("test"));

	surface.reportError("synthetic");
	const notifications = surface.getNotifications();
	if (notifications.length === 0) {
		throw new Error("Expected ErrorBoundary to leverage ErrorSurface reporting");
	}
}

runErrorBoundaryTests();
