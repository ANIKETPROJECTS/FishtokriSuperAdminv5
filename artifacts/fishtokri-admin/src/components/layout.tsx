import { Link, useLocation } from "wouter";
import { LayoutDashboard, Warehouse, Users, LogOut, Building2, Store, Truck, UserCircle, ShoppingBasket, ClipboardList, Handshake, ChevronLeft, ChevronRight, Boxes, ChevronDown, FolderOpen, Landmark, ArrowDownCircle, ArrowUpCircle, SlidersHorizontal, FileText, Receipt, Package, History, Menu, X, FileBarChart, FileSpreadsheet, Trash2, Calculator, RefreshCw, Settings, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const masterAdminNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/hubs", label: "Hubs", icon: Warehouse },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  {
    href: "/fish-calculator",
    label: "Fish Purchase Calculator",
    icon: Calculator,
    children: [
      { href: "/fish-calculator/price", label: "Price Calculator", icon: Calculator },
      { href: "/fish-calculator/yield", label: "Yield & Price Calculator", icon: RefreshCw },
      { href: "/fish-calculator/history", label: "History", icon: Clock },
      { href: "/fish-calculator/config", label: "Configuration", icon: Settings },
    ],
  },
  {
    href: "/inventory",
    label: "Inventory Management",
    icon: Boxes,
    children: [
      { href: "/inventory/products", label: "Inventory", icon: Package },
      { href: "/inventory/history", label: "History", icon: History },
      { href: "/inventory/adjustment", label: "Stock Management", icon: SlidersHorizontal },
      { href: "/inventory/wastage", label: "Wastage Report", icon: Trash2 },
    ],
  },
  {
    href: "/banking",
    label: "Banking",
    icon: Landmark,
    children: [
      { href: "/banking/accounts", label: "Accounts", icon: Building2 },
      { href: "/banking/receipts", label: "Receipts", icon: ArrowDownCircle },
      { href: "/banking/payments", label: "Payments", icon: ArrowUpCircle },
    ],
  },
  { href: "/admin-users", label: "Admin Users", icon: Users },
  { href: "/customers", label: "Customers", icon: ShoppingBasket },
  { href: "/delivery-report", label: "Delivery Report", icon: FileBarChart },
  { href: "/day-end-report", label: "Day End Report", icon: FileSpreadsheet },
];

function getAdminData() {
  try {
    const raw = localStorage.getItem("fishtokri_admin");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function ExpandableNavItem({ href, label, icon: Icon, isActive, childActive, subItems, location, sidebarOpen, sidebarWidth }: any) {
  const [hovered, setHovered] = useState(false);
  const [coords, setCoords] = useState<{ top: number } | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = hovered;

  const updateCoords = () => {
    if (rowRef.current) {
      const r = rowRef.current.getBoundingClientRect();
      setCoords({ top: r.top });
    }
  };

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    updateCoords();
    setHovered(true);
  };
  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setHovered(false), 120);
  };

  return (
    <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} className="relative">
      <Link href={href}>
        <div
          ref={rowRef}
          title={!sidebarOpen ? label : undefined}
          className={`flex items-center cursor-pointer transition-all text-sm font-medium border-l-2 ${
            sidebarOpen ? "gap-3 px-5 py-2.5" : "justify-center px-0 py-3"
          } ${
            isActive || childActive
              ? "bg-white/10 text-white border-amber-400"
              : "text-white/60 hover:text-white hover:bg-white/5 border-transparent"
          }`}
        >
          <Icon className="w-4 h-4 flex-shrink-0" />
          {sidebarOpen && (
            <>
              <span className="truncate flex-1">{label}</span>
              <ChevronDown
                className={`w-3 h-3 transition-all duration-200 ${open ? "-rotate-90 opacity-100" : "-rotate-90 opacity-50"}`}
              />
            </>
          )}
        </div>
      </Link>

      {/* Flyout submenu — rendered into a portal so it escapes the sidebar's
          overflow-hidden + transform clipping (transformed ancestors capture
          position: fixed children). */}
      {open && coords && createPortal(
        <div
          className="fixed z-[60]"
          style={{ top: coords.top, left: sidebarWidth }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* small bridge so cursor can travel without losing hover */}
          <div className="absolute -left-2 top-0 h-full w-2" />
          <div className="ml-1 min-w-[200px] rounded-lg bg-[#162B4D] border border-white/10 shadow-2xl py-1.5 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">{label}</p>
            </div>
            {subItems.map((child: any) => {
              const ChildIcon = child.icon;
              const isChildActive = location === child.href || location.startsWith(child.href);
              return (
                <Link key={child.href} href={child.href}>
                  <div
                    className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer text-[13px] font-medium transition-colors ${
                      isChildActive
                        ? "bg-white/10 text-white"
                        : "text-white/70 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <ChildIcon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{child.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const admin = getAdminData();
  const role = admin?.role || "master_admin";
  const adminName = admin?.name || (role === "master_admin" ? "Master Admin" : "Super Hub");

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const stored = localStorage.getItem("fishtokri_sidebar_open");
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    localStorage.setItem("fishtokri_sidebar_open", String(sidebarOpen));
  }, [sidebarOpen]);

  // Mobile drawer (separate state from desktop collapsed/expanded)
  const [mobileOpen, setMobileOpen] = useState(false);
  // Track viewport <md so we can force-expand the drawer on mobile
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  // On mobile the drawer should always render in "expanded" mode (with labels)
  const expanded = isMobile ? true : sidebarOpen;
  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);
  // Lock body scroll when drawer is open
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  const handleLogout = () => {
    localStorage.removeItem("fishtokri_token");
    localStorage.removeItem("fishtokri_admin");
    sessionStorage.removeItem("fishtokri_token");
    sessionStorage.removeItem("fishtokri_admin");
    setLocation("/");
  };

  // Pending password reset count (master admin only) — polled every 60s.
  const [pendingResets, setPendingResets] = useState(0);
  useEffect(() => {
    if (admin?.role !== "master_admin") return;
    let cancelled = false;
    const fetchPending = async () => {
      try {
        const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
        const token = localStorage.getItem("fishtokri_token") || "";
        const res = await fetch(`${base}/api/auth/password-reset-requests`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setPendingResets((data.requests || []).filter((r: any) => r.status === "pending").length);
      } catch {}
    };
    fetchPending();
    const id = setInterval(fetchPending, 60000);
    const onFocus = () => fetchPending();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [admin?.role, location]);

  const isSuperHub = role === "super_hub";
  const isSubHub = role === "sub_hub";
  const isDelivery = role === "delivery_person";

  // Super Hub & Sub Hub now share the same Master Admin sidebar UI,
  // filtered to the sections allotted to that role.
  // Allotted sections per role (matches App.tsx route permissions):
  //   Super Hub: Dashboard, Hubs, Orders, Vendor Management, Inventory Management, Banking, Customers
  //   Sub Hub:   Dashboard, Orders, Inventory Management, Customers (+ Menu shortcut)
  const superHubAllowedHrefs = new Set([
    "/dashboard",
    "/hubs",
    "/orders",
    "/fish-calculator",
    "/inventory",
    "/banking",
    "/customers",
    "/delivery-report",
    "/day-end-report",
  ]);
  const subHubAllowedHrefs = new Set([
    "/dashboard",
    "/orders",
    "/inventory",
    "/customers",
    "/delivery-report",
    "/day-end-report",
  ]);

  const filterNavByHrefs = (items: any[], allowed: Set<string>) =>
    items.filter((it) => allowed.has(it.href));

  const subHubNavItems = [
    ...filterNavByHrefs(masterAdminNavItems, subHubAllowedHrefs),
    // Sub Hub menu shortcut → resolves to first assigned sub hub's menu admin
    { href: "/menu", label: "Menu", icon: Store },
  ];

  const deliveryNavItems = [
    { href: "/my-deliveries", label: "Orders", icon: Truck, iconSrc: "/icon-order-delivery.png" },
    { href: "/delivery-report", label: "My Report", icon: FileBarChart, iconSrc: "/icon-report-custom.png", matchPrefix: "/delivery-report" },
  ];

  const navItems = isSuperHub
    ? filterNavByHrefs(masterAdminNavItems, superHubAllowedHrefs)
    : isSubHub
    ? subHubNavItems
    : isDelivery
    ? deliveryNavItems
    : masterAdminNavItems;
  const roleLabel = isSuperHub ? "Super Hub" : isSubHub ? "Sub Hub" : isDelivery ? "Delivery" : "Master Admin";

  const sidebarW = sidebarOpen ? "220px" : "56px";

  return (
    <div className="flex min-h-screen bg-[#F4F6FA]" style={{ ["--sidebar-w" as any]: sidebarW }}>
      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile close circle — floats on the right border of the sidebar, vertically centered */}
      {mobileOpen && (
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed z-50 w-10 h-10 rounded-full bg-[#162B4D] border-2 border-white/20 shadow-xl flex items-center justify-center hover:bg-[#1d3a6b] transition-colors active:scale-95"
          style={{ left: "220px", top: "50%", transform: "translateY(-50%)" }}
          aria-label="Close menu"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
      )}

      {/* Sidebar — drawer on mobile, fixed column on md+ */}
      <aside
        className={`fixed inset-y-0 left-0 bg-[#162B4D] text-white flex flex-col overflow-hidden transition-transform md:transition-all duration-300 ease-in-out z-40 md:z-20 w-[240px] md:w-[var(--sidebar-w)] ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        {/* Logo */}
        <div className={`relative flex items-center border-b border-white/10 transition-all duration-300 ${expanded ? "justify-center px-4 py-4" : "justify-center px-2 py-3"}`}>
          {expanded ? (
            isDelivery ? (
              <div className="w-full mx-2 h-[76px] rounded-2xl bg-white flex items-center justify-center flex-shrink-0 shadow-md">
                <img src="/logo.png" alt="FishTokri" className="w-[180px] h-[64px] object-contain" />
              </div>
            ) : (
              <div className="w-[180px] h-[64px] rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <img src="/logo.png" alt="FishTokri" className="w-[164px] h-[56px] object-contain" />
              </div>
            )
          ) : (
            <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <img src="/logo.png" alt="FishTokri" className="w-7 h-7 object-contain" />
            </div>
          )}
        </div>

        {/* Role Label — hidden for delivery */}
        {expanded && !isDelivery && (
          <div className="px-5 pt-5 pb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">{roleLabel}</p>
          </div>
        )}
        {expanded && isDelivery && <div className="pt-4" />}

        {/* Nav */}
        <nav className={`flex-1 pb-4 ${isDelivery ? "pt-2" : "pt-2"}`} style={isDelivery && isMobile ? { fontFamily: "Poppins, sans-serif" } : {}}>
          {navItems.map((item: any) => {
            const { href, label, icon: Icon, matchPrefix, children, iconSrc } = item;
            const isActive =
              location === href ||
              (matchPrefix && location.startsWith(matchPrefix)) ||
              (!matchPrefix && href === "/hubs" && location.startsWith("/hubs"));
            const childActive = children?.some((c: any) => location === c.href || location.startsWith(c.href));

            if (children && children.length > 0) {
              return (
                <ExpandableNavItem
                  key={href}
                  href={href}
                  label={label}
                  icon={Icon}
                  isActive={isActive}
                  childActive={childActive}
                  subItems={children}
                  location={location}
                  sidebarOpen={expanded}
                  sidebarWidth={expanded ? (isMobile ? 240 : 220) : 56}
                />
              );
            }

            const badgeCount = href === "/admin-users" ? pendingResets : 0;

            // ── Delivery nav item — big, bold, full-width pill ──
            if (isDelivery && isMobile && expanded) {
              return (
                <Link key={href} href={href}>
                  <div
                    className={`mx-3 mb-2 flex items-center gap-4 px-4 rounded-2xl cursor-pointer transition-all active:scale-[0.97] ${
                      isActive
                        ? "bg-white/15 border border-white/20"
                        : "border border-transparent hover:bg-white/8"
                    }`}
                    style={{ height: "68px" }}
                  >
                    {iconSrc ? (
                      <div
                        className="w-7 h-7 flex-shrink-0"
                        style={{
                          WebkitMaskImage: `url(${iconSrc})`,
                          maskImage: `url(${iconSrc})`,
                          WebkitMaskSize: "contain",
                          maskSize: "contain",
                          WebkitMaskRepeat: "no-repeat",
                          maskRepeat: "no-repeat",
                          WebkitMaskPosition: "center",
                          maskPosition: "center",
                          backgroundColor: isActive ? "white" : "rgba(255,255,255,0.7)",
                        }}
                      />
                    ) : (
                      <Icon className={`w-7 h-7 flex-shrink-0 ${isActive ? "text-white" : "text-white/70"}`} />
                    )}
                    <span className={`text-lg font-semibold truncate text-white`}>
                      {label}
                    </span>
                  </div>
                </Link>
              );
            }

            // ── Standard nav item ──
            return (
              <Link key={href} href={href}>
                <div
                  title={!expanded ? (badgeCount > 0 ? `${label} (${badgeCount} pending)` : label) : undefined}
                  className={`flex items-center cursor-pointer transition-all text-sm font-medium border-l-2 relative ${
                    expanded ? "gap-3 px-5 py-2.5" : "justify-center px-0 py-3"
                  } ${
                    isActive
                      ? "bg-white/10 text-white border-amber-400"
                      : "text-white/60 hover:text-white hover:bg-white/5 border-transparent"
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <Icon className="w-4 h-4" />
                    {!expanded && badgeCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-[#162B4D]" />
                    )}
                  </div>
                  {expanded && (
                    <>
                      <span className="truncate flex-1">{label}</span>
                      {badgeCount > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold rounded-full bg-amber-400 text-[#162B4D]">
                          {badgeCount > 99 ? "99+" : badgeCount}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </Link>
            );
          })}

        
        </nav>

        {/* Profile Section */}
        <div className={`border-t border-white/10 ${expanded ? "px-5 pt-4 pb-3" : "py-3"}`}>
          {expanded && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-3">Profile</p>
          )}

          {/* User info card */}
          {expanded ? (
            <div className="flex items-center gap-3 mb-3 px-3 py-2.5 rounded-lg bg-white/5">
              <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
                <div
                  className="w-5 h-5 flex-shrink-0"
                  style={{
                    WebkitMaskImage: "url(/icon-account.png)",
                    maskImage: "url(/icon-account.png)",
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskPosition: "center",
                    maskPosition: "center",
                    backgroundColor: "white",
                  }}
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate leading-tight">{adminName}</p>
                <p className="text-[10px] text-white/40 mt-0.5">{roleLabel}</p>
                {admin?.email && (
                  <p className="text-[10px] text-white/30 truncate">{admin.email}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex justify-center mb-2">
              <div
                className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center"
                title={`${adminName} — ${roleLabel}`}
              >
                <div
                  className="w-5 h-5 flex-shrink-0"
                  style={{
                    WebkitMaskImage: "url(/icon-account.png)",
                    maskImage: "url(/icon-account.png)",
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskPosition: "center",
                    maskPosition: "center",
                    backgroundColor: "white",
                  }}
                />
              </div>
            </div>
          )}

          {/* Logout */}
          {expanded ? (
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white hover:bg-red-500/15 hover:border-red-500/20 border border-transparent transition-colors"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              <span>Logout</span>
            </button>
          ) : (
            <div className="flex justify-center">
              <button
                onClick={handleLogout}
                title="Logout"
                className="p-2 rounded-lg text-white hover:text-red-400 hover:bg-red-500/15 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Desktop-only collapse/expand toggle at the bottom */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="hidden md:flex items-center justify-center py-3 border-t border-white/10 hover:bg-white/10 transition-colors text-white/50 hover:text-white w-full"
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out ml-0 md:ml-[var(--sidebar-w)] w-full min-w-0">
        {/* Header */}
        <header className="bg-white h-14 border-b border-gray-100 flex items-center px-4 md:px-8 z-10 sticky top-0 shadow-sm gap-2">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-md text-[#162B4D] hover:bg-gray-100 -ml-1"
            aria-label="Open menu"
            data-testid="button-mobile-menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Mobile inline brand — hidden for delivery (page injects its own title via slot) */}
          {!isDelivery && (
            <div className="md:hidden flex items-center gap-2 min-w-0">
              <span className="text-sm font-bold text-[#162B4D] truncate">{roleLabel}</span>
            </div>
          )}

          <div id="page-header-slot" className="flex items-center gap-3 flex-1 min-w-0" />
        </header>

        <div className={`flex-1 min-w-0 bg-white ${location.startsWith("/day-end-report") ? "p-0" : location.startsWith("/orders") ? "px-4 py-3" : location.startsWith("/my-deliveries") || location.startsWith("/delivery-report") ? "p-4" : "p-4 sm:p-6 lg:p-8"}`}>
          {children}
        </div>
      </main>
    </div>
  );
}
