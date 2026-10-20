import { Link } from "react-router";

import { Button } from "@signet/ui/components/button";

export function NotFoundPage() {
  return (
    <div className="py-20 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
