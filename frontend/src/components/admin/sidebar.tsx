"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Landmark,
  DoorOpen,
  FileText,
  FileSignature,
  Repeat2,
  LayoutDashboard,
  ListChecks,
  MailCheck,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  ReceiptText,
  Settings,
  Users,
  UserSquare2,
  UserPlus,
  Wrench,
} from "lucide-react";
import {
  PortalSidebar,
  type PortalNavItem,
} from "@/components/portal/portal-sidebar";
import type { ProductTourStep } from "@/components/portal/product-tour";
import { useAuth } from "@/context/auth-context";
import { getNewWebsiteLeadCount } from "@/lib/website-leads";
import { getNewRentalApplicationCount } from "@/lib/admin-rental-applications";

const items = [
  {
    title: "Sales overview",
    icon: LayoutDashboard,
    href: "/admin/sales",
    area: "sales",
    group: "Sales & listings",
    matchNested: false,
  },
  {
    title: "Agent approvals",
    icon: ClipboardCheck,
    href: "/admin/agents",
    area: "sales",
    group: "Sales & listings",
  },
  {
    title: "Listing reviews",
    icon: ListChecks,
    href: "/admin/listings",
    area: "sales",
    group: "Sales & listings",
  },
  {
    title: "Inquiry oversight",
    icon: MessagesSquare,
    href: "/admin/inquiries",
    area: "sales",
    group: "Sales & listings",
  },
  {
    title: "Commission ledger",
    icon: ReceiptText,
    href: "/admin/sales/commissions",
    area: "sales",
    group: "Sales & listings",
  },
  {
    title: "Website leads",
    icon: MailCheck,
    href: "/admin/leads",
    area: "shared",
    group: "Leads & follow-up",
  },
  {
    title: "Rental overview",
    icon: LayoutDashboard,
    href: "/admin/dashboard",
    area: "rent",
    group: "Rental portfolio",
  },
  {
    title: "Rental applications",
    icon: ClipboardList,
    href: "/admin/rental-applications",
    area: "rent",
    group: "Leads & follow-up",
  },
  {
    title: "Properties",
    icon: Building2,
    href: "/admin/properties",
    area: "rent",
    group: "Rental portfolio",
  },
  {
    title: "Units",
    icon: DoorOpen,
    href: "/admin/units",
    area: "rent",
    group: "Rental portfolio",
  },
  {
    title: "Property owners",
    icon: Landmark,
    href: "/admin/owners",
    area: "rent",
    group: "Rental portfolio",
  },
  {
    title: "Tenants",
    icon: Users,
    href: "/admin/tenants",
    area: "rent",
    group: "Residents & payments",
  },
  {
    title: "Leases",
    icon: FileText,
    href: "/admin/leases",
    area: "rent",
    group: "Residents & payments",
  },
  {
    title: "Renewals & move-outs",
    icon: Repeat2,
    href: "/admin/lease-lifecycle",
    area: "rent",
    group: "Residents & payments",
  },
  {
    title: "Move-in inspections",
    icon: ClipboardCheck,
    href: "/admin/move-in-inspections",
    area: "rent",
    group: "Residents & payments",
  },
  {
    title: "Payments",
    icon: CreditCard,
    href: "/admin/payments",
    area: "rent",
    group: "Residents & payments",
  },
  {
    title: "Maintenance",
    icon: Wrench,
    href: "/admin/maintenance",
    area: "rent",
    group: "Service & communication",
  },
  {
    title: "Vendors",
    icon: UserSquare2,
    href: "/admin/vendors",
    area: "rent",
    group: "Service & communication",
  },
  {
    title: "Messages",
    icon: MessageSquare,
    href: "/admin/messages",
    area: "rent",
    group: "Service & communication",
  },
  {
    title: "Announcements",
    icon: Megaphone,
    href: "/admin/announcements",
    area: "rent",
    group: "Service & communication",
  },
  {
    title: "Reports",
    icon: BarChart3,
    href: "/admin/reports",
    area: "super",
    group: "Company tools",
  },
  {
    title: "E-signatures",
    icon: FileSignature,
    href: "/admin/e-signatures",
    group: "Company tools",
  },
  {
    title: "Email delivery",
    icon: MailCheck,
    href: "/admin/emails",
    area: "rent",
    group: "Company tools",
  },
  {
    title: "Tenant administrators",
    icon: UserPlus,
    href: "/admin/tenant-administrators",
    area: "super",
    group: "Company tools",
  },
  {
    title: "Settings",
    icon: Settings,
    href: "/admin/settings",
    group: "System",
  },
];

const salesTour: ProductTourStep[] = [
  {
    title: "Start with the sales overview",
    description:
      "Use this daily snapshot to see agent applications, listing reviews, published homes, open buyer inquiries, and the commission ledger.",
    action: { label: "Open sales overview", href: "/admin/sales" },
  },
  {
    title: "Approve agent companies first",
    description:
      "New agent companies cannot publish listings until their application and documents have been reviewed and approved here.",
    action: { label: "Open agent approvals", href: "/admin/agents" },
  },
  {
    title: "Review every property before it is public",
    description:
      "Agent listings wait in Listing reviews. Approve a complete, accurate listing to publish it, or return it with a clear reason.",
    action: { label: "Open listing reviews", href: "/admin/listings" },
  },
  {
    title: "Follow up on buyer conversations",
    description:
      "Inquiry oversight shows buyer questions across approved agents. Website leads are separate contact requests from the public site.",
    action: { label: "Open inquiry oversight", href: "/admin/inquiries" },
  },
];

const rentalTour: ProductTourStep[] = [
  {
    title: "Start with the rental overview",
    description:
      "This is the daily view of occupancy, leases, unpaid rent, maintenance work, and upcoming operational tasks.",
    action: { label: "Open rental overview", href: "/admin/dashboard" },
  },
  {
    title: "Follow up with rental prospects",
    description:
      "Website Leads contains new rental questions, tour requests, and application requests with the selected property and preferred move-in date.",
    action: { label: "Open website leads", href: "/admin/leads" },
  },
  {
    title: "Review completed applications",
    description:
      "Rental applications keeps identity and income documents private, records application-fee status, and prevents approval until required checks are complete.",
    action: {
      label: "Open rental applications",
      href: "/admin/rental-applications",
    },
  },
  {
    title: "Build the property inventory",
    description:
      "Create a rental property, then add its units. Units are what connect residents, leases, rent, and service requests.",
    action: { label: "Open properties", href: "/admin/properties" },
  },
  {
    title: "Invite residents, then create the lease",
    description:
      "Create or invite the tenant before issuing the lease. Starting an active lease automatically marks that unit occupied.",
    action: { label: "Open tenants", href: "/admin/tenants" },
  },
  {
    title: "Manage rent and owner payouts",
    description:
      "Payments tracks rent charges, late fees, and tenant-initiated checkout. Property owners hold the commission rate and secure payout setup.",
    action: { label: "Open payments", href: "/admin/payments" },
  },
  {
    title: "Document move-in handover",
    description:
      "Move-in inspections records room condition, private photos, utility readings, keys, and the resident acknowledgement before occupancy begins.",
    action: {
      label: "Open move-in inspections",
      href: "/admin/move-in-inspections",
    },
  },
  {
    title: "Finish renewals and move-outs",
    description:
      "Use Renewals & move-outs for signed offers, notice, final inspection, key return, deposit deductions, deadlines, and proof of return.",
    action: {
      label: "Open renewals and move-outs",
      href: "/admin/lease-lifecycle",
    },
  },
  {
    title: "Keep residents informed",
    description:
      "Use Maintenance, Vendors, Messages, and Announcements to coordinate service and communicate with residents.",
    action: { label: "Open maintenance", href: "/admin/maintenance" },
  },
];

const superAdminTour: ProductTourStep[] = [
  {
    title: "Begin with sales operations",
    description:
      "Sales overview brings together agent applications, listing reviews, buyer inquiries, website leads, and commissions.",
    action: { label: "Open sales overview", href: "/admin/sales" },
  },
  {
    title: "Approve the right things in the right order",
    description:
      "Approve an agent company before it can submit listings. Review each submitted listing before it is published to the public website.",
    action: { label: "Open agent approvals", href: "/admin/agents" },
  },
  {
    title: "Manage the rental portfolio",
    description:
      "Rental overview, Properties, and Units describe the homes Johnson Realty manages. Units connect every property to residents and leases.",
    action: { label: "Open rental overview", href: "/admin/dashboard" },
  },
  {
    title: "Review the leasing pipeline",
    description:
      "Rental applications is the controlled handoff from public applicant to approved resident. Review documents and fees before creating any tenant or lease.",
    action: {
      label: "Open rental applications",
      href: "/admin/rental-applications",
    },
  },
  {
    title: "Handle residents, rent, and owner payouts",
    description:
      "Invite a tenant, then create the lease. Payments manages rent and late fees, while Property owners stores the management commission and payout setup.",
    action: { label: "Open tenants", href: "/admin/tenants" },
  },
  {
    title: "Coordinate service and communication",
    description:
      "Maintenance, Vendors, Messages, and Announcements keep resident service requests and follow-up organized.",
    action: { label: "Open maintenance", href: "/admin/maintenance" },
  },
  {
    title: "Use company tools to stay in control",
    description:
      "Reports, E-signatures, Email delivery, and Settings provide the cross-company controls you use after operational work is underway.",
    action: { label: "Open reports", href: "/admin/reports" },
  },
];

export function AdminSidebar() {
  const { user, logout } = useAuth();
  const [newLeadCount, setNewLeadCount] = useState(0);
  const [newApplicationCount, setNewApplicationCount] = useState(0);
  const canReviewLeads =
    user?.role === "SUPER_ADMIN" ||
    user?.role === "SALES_ADMIN" ||
    user?.role === "TENANT_ADMIN";

  useEffect(() => {
    if (!canReviewLeads) return;

    let active = true;
    const refreshNewLeadCount = async () => {
      try {
        const [{ count }, applications] = await Promise.all([
          getNewWebsiteLeadCount(),
          user?.role === "SALES_ADMIN"
            ? Promise.resolve({ count: 0 })
            : getNewRentalApplicationCount(),
        ]);
        if (active) {
          setNewLeadCount(count);
          setNewApplicationCount(applications.count);
        }
      } catch {
        // Navigation remains available if the non-critical badge request fails.
      }
    };

    void refreshNewLeadCount();
    const interval = window.setInterval(
      () => void refreshNewLeadCount(),
      30_000,
    );
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [canReviewLeads, user?.role]);

  const visibleItems = items.reduce<PortalNavItem[]>((visible, item) => {
    const allowed =
      user?.role === "SALES_ADMIN"
        ? item.area !== "rent" && item.area !== "super"
        : user?.role === "TENANT_ADMIN"
          ? item.area !== "sales" && item.area !== "super"
          : true;
    if (!allowed) return visible;
    visible.push(
      item.href === "/admin/leads"
        ? { ...item, badge: newLeadCount }
        : item.href === "/admin/rental-applications"
          ? { ...item, badge: newApplicationCount }
          : item,
    );
    return visible;
  }, []);
  const role =
    user?.role === "SUPER_ADMIN"
      ? "Super administrator"
      : user?.role === "SALES_ADMIN"
        ? "Sales administrator"
        : "Rental administrator";
  const tourSteps =
    user?.role === "SALES_ADMIN"
      ? salesTour
      : user?.role === "TENANT_ADMIN"
        ? rentalTour
        : superAdminTour;
  return (
    <PortalSidebar
      items={visibleItems}
      portalName={
        user?.role === "SALES_ADMIN"
          ? "Sales administration"
          : user?.role === "TENANT_ADMIN"
            ? "Rental administration"
            : "Company administration"
      }
      userName={user?.email?.split("@")[0] || "Administrator"}
      userRole={role}
      initials={user?.email?.slice(0, 2).toUpperCase() || "CJ"}
      onLogout={logout}
      tourId={`admin-${user?.role.toLowerCase() || "staff"}-${user?.id || "unknown"}`}
      tourSteps={tourSteps}
    />
  );
}
