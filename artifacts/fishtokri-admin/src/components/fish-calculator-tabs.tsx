import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { Calculator, RefreshCw, Clock, Settings } from "lucide-react";

const TABS = [
  { href: "/fish-calculator/price", label: "Price Calculator", icon: Calculator },
  { href: "/fish-calculator/yield", label: "Yield & Price Calculator", icon: RefreshCw },
  { href: "/fish-calculator/history", label: "History", icon: Clock },
  { href: "/fish-calculator/config", label: "Configuration", icon: Settings },
];

export function FishCalculatorTabs() {
  const [location] = useLocation();

  const slot = typeof document !== "undefined" ? document.getElementById("page-header-slot") : null;
  if (!slot) return null;

  return createPortal(
    <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-none ml-auto">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = location === href;
        return (
          <Link key={href} href={href}>
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap transition-all ${
                active
                  ? "bg-[#F05B4E] text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              }`}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{label}</span>
            </div>
          </Link>
        );
      })}
    </nav>,
    slot
  );
}
