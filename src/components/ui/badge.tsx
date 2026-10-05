import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold leading-[14px] w-fit whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary-soft text-on-primary-soft",
        secondary: "border-border bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        success: "border-transparent bg-success-soft text-on-success-soft",
        warning: "border-transparent bg-warning-soft text-on-warning-soft",
        destructive: "border-transparent bg-destructive-soft text-on-destructive-soft",
        // Logística Maceió e campanha.
        amber: "border-transparent bg-warning-soft text-on-warning-soft",
        // Térmico: congelado, tempo de preparo.
        sky: "border-transparent bg-thermal-soft text-on-thermal-soft",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
