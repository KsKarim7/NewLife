import axiosClient from "@/api/axiosClient";

export type ReportFormat = "pdf" | "excel";

export interface ExportReportParams {
  module: string;
  from: string;
  to: string;
  format: ReportFormat;
}

export const exportReport = async ({
  module,
  from,
  to,
  format,
}: ExportReportParams): Promise<Blob> => {
  const response = await axiosClient.get(`/reports/${module}`, {
    params: {
      from,
      to,
      format,
    },
    responseType: "blob",
  });

  if (!response.data) {
    throw new Error("Failed to export report");
  }

  // Axios with responseType "blob" puts the Blob in response.data
  return response.data as Blob;
};

