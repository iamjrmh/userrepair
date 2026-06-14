import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Graceful top-level error display with a copy-to-clipboard report option. */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Local-only: log to the devtools console; no telemetry leaves the app.
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  handleReport = (): void => {
    const { error } = this.state;
    if (!error) return;
    const report = `userrepair error report\n${error.name}: ${error.message}\n\n${error.stack ?? ""}`;
    void navigator.clipboard.writeText(report);
  };

  handleReload = (): void => {
    this.setState({ error: null });
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{error.message}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={this.handleReport}>
            Copy report
          </Button>
          <Button onClick={this.handleReload}>Reload app</Button>
        </div>
      </div>
    );
  }
}
