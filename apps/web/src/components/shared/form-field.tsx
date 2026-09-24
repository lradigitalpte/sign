import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormFieldProps = React.ComponentProps<"div"> & {
  label: string;
  htmlFor: string;
  description?: string;
  error?: string;
  optional?: boolean;
};

function FormField({
  children,
  className,
  description,
  error,
  htmlFor,
  label,
  optional = false,
  ...props
}: FormFieldProps) {
  const descriptionId = description ? `${htmlFor}-description` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn("grid gap-2", className)} data-slot="form-field" {...props}>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={htmlFor}>{label}</Label>
        {optional ? (
          <span className="text-xs text-muted-foreground">Optional</span>
        ) : null}
      </div>
      {children}
      {description ? (
        <p className="text-xs leading-5 text-muted-foreground" id={descriptionId}>
          {description}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs font-medium leading-5 text-destructive" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { FormField };
