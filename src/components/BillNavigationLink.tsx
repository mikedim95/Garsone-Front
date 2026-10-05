import { ReceiptText } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBillingVisits } from "@/hooks/useBillingVisits";
import { billingCopy } from "@/pages/billingCopy";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

export function BillNavigationLink({ className, compact = false, onClick }: { className?: string; compact?: boolean; onClick?: React.MouseEventHandler<HTMLAnchorElement> }) {
  const { i18n } = useTranslation();
  const role = useAuthStore(state => state.user?.role);
  const copy = billingCopy[(i18n.resolvedLanguage || i18n.language).startsWith("el") ? "el" : "en"];
  const visits = useBillingVisits();
  const count = visits.data?.visits.filter(visit => visit.status === "BILL_REQUESTED").length || 0;
  return <Link to={role === "manager" ? "/manager?tab=bills" : "/staff/bills"} onClick={onClick} aria-label={`${copy.title}${count ? ` · ${count} ${copy.requested}` : ""}`} className={cn("relative inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", compact && "flex-1 flex-col justify-center gap-1 border-0 bg-transparent px-1 text-[10px]", className)}>
    <ReceiptText aria-hidden className={cn("h-4 w-4 shrink-0", compact && "h-5 w-5")} />
    <span className={cn("min-w-0", compact ? "max-w-full truncate" : "break-words")}>{copy.title}</span>
    {count > 0 && <span className={cn("ml-auto min-w-5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums text-amber-800 dark:text-amber-200", compact && "absolute right-1 top-0 ml-0")}>{count}</span>}
  </Link>;
}
