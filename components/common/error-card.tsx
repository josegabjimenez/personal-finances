import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ErrorCard({
  title = "Couldn’t load this",
  message,
}: {
  title?: string;
  message?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <AlertTriangle className="h-4 w-4 text-warning" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {message ??
            "Check that FIREFLY_BASE_URL and FIREFLY_TOKEN are set and that your VPS is reachable."}
        </p>
      </CardContent>
    </Card>
  );
}
