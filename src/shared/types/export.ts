export type PdfBundleExportedResult = {
  status: 'exported';
  filePath: string;
  bundleHash: string;
  fileSizeBytes: number;
  exhibitsCount: number;
  pageCount: number;
  appendedOriginalsCount: number;
  skippedOriginalsCount: number;
};

export type PdfBundleExportResult =
  | PdfBundleExportedResult
  | {
      status: 'cancelled';
    }
  | {
      status: 'case_not_found';
    };
