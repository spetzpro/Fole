import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", color: "#d32f2f", fontFamily: "sans-serif" }}>
          <h2>Something went wrong.</h2>
          <pre style={{ background: "#ffebee", padding: "10px", borderRadius: "5px" }}>
            {this.state.error?.message || "Unknown error"}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            style={{ 
                marginTop: "10px", 
                padding: "8px 16px", 
                cursor: "pointer",
                background: "#2196F3",
                color: "white",
                border: "none",
                borderRadius: "4px"
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
