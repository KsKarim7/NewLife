import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { exportReport, type ReportFormat } from "@/api/reportsApi";

interface ExportButtonProps {
  module: string;
  from: string;
  to: string;
  format: ReportFormat;
  label: string;
}

export function ExportButton({ module, from, to, format, label }: ExportButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleClick = async () => {
    if (!from || !to) {
      toast({
        title: "Select a date range",
        description: "Please choose both from and to dates before exporting.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const blob = await exportReport({ module, from, to, format });

      if (format === "pdf") {
        // For PDF: read the HTML content and display in a popup window
        // The backend sends HTML content as a Blob for PDF format
        const htmlContent = await blob.text();
        
        const win = window.open('', '_blank', 'width=900,height=700');
        if (!win) {
          toast({
            title: "Popup blocked",
            description: "Please allow popups for this site to export PDF.",
            variant: "destructive",
          });
          return;
        }
        
        win.document.write(htmlContent);
        win.document.close();
        // The HTML content should include auto-print script, or manually trigger:
        win.focus();
        window.setTimeout(() => win.print(), 250);
      } else {
        // For Excel: download as file
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const datePart = `${year}-${month}-${day}`;

        a.href = url;
        a.download = `${module}-report-${datePart}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error: unknown) {
      const message =
        (error as { message?: string })?.message ?? "Failed to export report";
      toast({
        title: "Export failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const Icon = format === "pdf" ? FileText : FileSpreadsheet;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full md:w-auto"
      onClick={handleClick}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Icon className="h-4 w-4 mr-1" />
      )}
      {label}
    </Button>
  );
}

