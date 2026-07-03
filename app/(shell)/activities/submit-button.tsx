"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/app/ui/button";

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="px-3 py-1.5 text-sm">
      {children}
    </Button>
  );
}
