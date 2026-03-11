import { useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ExportButton } from "@/components/shared/ExportButton";

interface ReportCardConfig {
  name: string;
  description: string;
  module: string;
}

const reportConfigs: ReportCardConfig[] = [
  {
    name: "Sales Report",
    description: "Complete breakdown of all sales with customer details and payment status.",
    module: "sales",
  },
  {
    name: "Purchase Report",
    description: "Summary of all purchases including supplier payments and outstanding dues.",
    module: "purchases",
  },
  {
    name: "Sales Returns Report",
    description: "All returned items with reason codes and refund amounts.",
    module: "sales-returns",
  },
  {
    name: "Purchase Returns Report",
    description: "Items returned to suppliers with adjustment details.",
    module: "purchase-returns",
  },
  {
    name: "Expenses Report",
    description: "Monthly expense breakdown by category and party.",
    module: "expenses",
  },
  {
    name: "Stock Movement Report",
    description: "Full audit trail of all inventory changes.",
    module: "stock-movements",
  },
];

function getDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);

  const format = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  return {
    from: format(start),
    to: format(end),
  };
}

function ReportCard({ name, description, module }: ReportCardConfig) {
  const defaults = getDefaultDates();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  return (
    <div className="bg-card rounded-lg p-4 md:p-5 shadow-sm border border-border">
      <h3 className="text-sm md:text-base font-semibold text-card-foreground mb-1">{name}</h3>
      <p className="text-sm text-muted-foreground mb-3 md:mb-4">{description}</p>
      <div className="flex items-center justify-between mb-3 md:mb-0">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>Date range</span>
        </div>
      </div>
      <div className="mt-2 mb-3 flex items-center gap-2">
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-9 text-xs md:text-sm"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-9 text-xs md:text-sm"
        />
      </div>
      <div className="flex flex-col md:flex-row gap-2 mt-2 md:mt-0 md:justify-end">
        <ExportButton
          module={module}
          from={from}
          to={to}
          format="pdf"
          label="Export PDF"
        />
        <ExportButton
          module={module}
          from={from}
          to={to}
          format="excel"
          label="Export Excel"
        />
      </div>
    </div>
  );
}

export default function Reports() {
  return (
    <PageLayout title="Reports & Exports" searchPlaceholder="Search reports..." showPeriodFilter={true}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {reportConfigs.map((config) => (
          <ReportCard
            key={config.name}
            name={config.name}
            description={config.description}
            module={config.module}
          />
        ))}
      </div>
    </PageLayout>
  );
}

