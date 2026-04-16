import { cn } from "@/lib/utils";

export function Empty({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed p-8 text-center text-sm",
        className
      )}
    >
      <p className="font-medium">{title}</p>
      {description ? (
        <p className="mt-1 text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
