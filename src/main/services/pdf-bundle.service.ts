import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { readFile, stat, writeFile } from 'node:fs/promises';

import { PageSizes, PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';

import { LEGAL_DISCLAIMER } from '@shared/constants/disclaimer';
import type { GoodsService, TrademarkCase, TrademarkCaseRecord } from '@shared/types/case';
import type { EvidenceRecord } from '@shared/types/evidence';
import type { PdfBundleExportedResult } from '@shared/types/export';

import { AuditRepository } from '../db/audit.repository';
import { CasesRepository } from '../db/cases.repository';
import type { SqliteDatabase } from '../db/database';
import { EvidenceRepository } from '../db/evidence.repository';
import { EvidenceStorageService } from './storage.service';

type ExhibitRecord = EvidenceRecord & {
  exhibitNumber: number;
  goodsServices: GoodsService[];
};

type AppendOriginalResult = {
  appended: boolean;
};

const PAGE_WIDTH = PageSizes.A4[0];
const PAGE_HEIGHT = PageSizes.A4[1];
const PAGE_MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const TEXT_COLOR = rgb(0.16, 0.18, 0.16);
const MUTED_COLOR = rgb(0.38, 0.42, 0.39);
const LINE_COLOR = rgb(0.74, 0.78, 0.74);
const ACCENT_COLOR = rgb(0.13, 0.43, 0.39);

const evidenceTypeLabels = {
  invoice: 'Invoice',
  screenshot: 'Screenshot',
  photo: 'Photo',
  catalogue: 'Catalogue',
  ad: 'Advertisement',
  other: 'Other'
} as const;

function normalizePdfText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0);
      const isSupported =
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 32 && code <= 126) ||
        (code >= 160 && code <= 255);

      return isSupported ? character : '?';
    })
    .join('');
}

function formatNiceClass(value: number | null): string {
  return value === null ? 'No class' : `Class ${value}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const normalized = normalizePdfText(text);
  const lines: string[] = [];

  for (const paragraph of normalized.split('\n')) {
    const words = paragraph.trim().length > 0 ? paragraph.trim().split(/\s+/) : [''];
    let line = '';

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;

      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }

      if (line) {
        lines.push(line);
        line = word;
      }

      while (font.widthOfTextAtSize(line, size) > maxWidth && line.length > 1) {
        let splitIndex = line.length - 1;

        while (
          splitIndex > 1 &&
          font.widthOfTextAtSize(`${line.slice(0, splitIndex)}-`, size) > maxWidth
        ) {
          splitIndex -= 1;
        }

        lines.push(`${line.slice(0, splitIndex)}-`);
        line = line.slice(splitIndex);
      }
    }

    lines.push(line);
  }

  return lines;
}

class BundleWriter {
  private page: PDFPage;
  private y: number;

  constructor(
    private readonly doc: PDFDocument,
    private readonly regularFont: PDFFont,
    private readonly boldFont: PDFFont
  ) {
    this.page = this.doc.addPage(PageSizes.A4);
    this.y = PAGE_HEIGHT - PAGE_MARGIN;
  }

  addPage(): void {
    this.page = this.doc.addPage(PageSizes.A4);
    this.y = PAGE_HEIGHT - PAGE_MARGIN;
  }

  title(text: string): void {
    this.ensureSpace(72);
    this.page.drawText(normalizePdfText(text), {
      x: PAGE_MARGIN,
      y: this.y,
      size: 22,
      font: this.boldFont,
      color: ACCENT_COLOR
    });
    this.y -= 34;
  }

  heading(text: string): void {
    this.ensureSpace(42);
    this.page.drawText(normalizePdfText(text), {
      x: PAGE_MARGIN,
      y: this.y,
      size: 15,
      font: this.boldFont,
      color: TEXT_COLOR
    });
    this.y -= 24;
  }

  paragraph(text: string, size = 10.5): void {
    const lines = wrapText(text, this.regularFont, size, CONTENT_WIDTH);
    this.ensureSpace(lines.length * (size + 4) + 8);

    for (const line of lines) {
      this.page.drawText(line, {
        x: PAGE_MARGIN,
        y: this.y,
        size,
        font: this.regularFont,
        color: TEXT_COLOR
      });
      this.y -= size + 4;
    }

    this.y -= 8;
  }

  labelValue(label: string, value: string): void {
    const labelWidth = 142;
    const size = 10;
    const lines = wrapText(
      value || 'Not provided',
      this.regularFont,
      size,
      CONTENT_WIDTH - labelWidth
    );
    this.ensureSpace(Math.max(18, lines.length * 14) + 4);

    this.page.drawText(normalizePdfText(label), {
      x: PAGE_MARGIN,
      y: this.y,
      size,
      font: this.boldFont,
      color: MUTED_COLOR
    });

    let valueY = this.y;

    for (const line of lines) {
      this.page.drawText(line, {
        x: PAGE_MARGIN + labelWidth,
        y: valueY,
        size,
        font: this.regularFont,
        color: TEXT_COLOR
      });
      valueY -= 14;
    }

    this.y = valueY - 4;
  }

  rule(): void {
    this.ensureSpace(18);
    this.page.drawLine({
      start: { x: PAGE_MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - PAGE_MARGIN, y: this.y },
      thickness: 1,
      color: LINE_COLOR
    });
    this.y -= 18;
  }

  tableHeader(labels: readonly string[], widths: readonly number[]): void {
    this.ensureSpace(30);
    let x = PAGE_MARGIN;

    for (let index = 0; index < labels.length; index += 1) {
      this.page.drawText(normalizePdfText(labels[index] ?? ''), {
        x,
        y: this.y,
        size: 8.5,
        font: this.boldFont,
        color: MUTED_COLOR
      });
      x += widths[index] ?? 80;
    }

    this.y -= 14;
    this.rule();
  }

  tableRow(values: readonly string[], widths: readonly number[]): void {
    const size = 8.5;
    const lineGroups = values.map((value, index) =>
      wrapText(value, this.regularFont, size, (widths[index] ?? 80) - 8).slice(0, 3)
    );
    const rowHeight = Math.max(...lineGroups.map((lines) => lines.length), 1) * 12 + 8;
    this.ensureSpace(rowHeight + 6);
    let x = PAGE_MARGIN;

    for (let index = 0; index < lineGroups.length; index += 1) {
      let lineY = this.y;

      for (const line of lineGroups[index] ?? []) {
        this.page.drawText(line, {
          x,
          y: lineY,
          size,
          font: this.regularFont,
          color: TEXT_COLOR
        });
        lineY -= 12;
      }

      x += widths[index] ?? 80;
    }

    this.y -= rowHeight;
  }

  private ensureSpace(height: number): void {
    if (this.y - height < PAGE_MARGIN) {
      this.addPage();
    }
  }
}

export class PdfBundleService {
  private readonly auditRepository: AuditRepository;
  private readonly casesRepository: CasesRepository;
  private readonly evidenceRepository: EvidenceRepository;

  constructor(
    db: SqliteDatabase,
    private readonly storage: EvidenceStorageService = new EvidenceStorageService()
  ) {
    this.auditRepository = new AuditRepository(db);
    this.casesRepository = new CasesRepository(db);
    this.evidenceRepository = new EvidenceRepository(db);
  }

  getSuggestedFilename(caseId: string): string | null {
    const trademarkCase = this.casesRepository.getById(caseId);

    if (!trademarkCase) {
      return null;
    }

    const safeMarkName = trademarkCase.markName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);

    return `${safeMarkName || 'markproof'}-proof-bundle.pdf`;
  }

  async exportCaseBundle(
    caseId: string,
    outputPath: string
  ): Promise<PdfBundleExportedResult | null> {
    const trademarkCase = this.casesRepository.getById(caseId);

    if (!trademarkCase) {
      return null;
    }

    const caseRecord = this.toCaseRecord(trademarkCase);
    const exhibits = this.toExhibits(caseId, caseRecord.goodsServices);
    const doc = await PDFDocument.create();
    const regularFont = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    const writer = new BundleWriter(doc, regularFont, boldFont);

    this.drawCoverPage(writer, caseRecord, exhibits.length);
    writer.addPage();
    this.drawTableOfContents(writer, exhibits);
    writer.addPage();
    this.drawEvidenceIndex(writer, exhibits);

    let appendedOriginalsCount = 0;
    let skippedOriginalsCount = 0;

    for (const exhibit of exhibits) {
      writer.addPage();
      this.drawExhibitMetadata(writer, exhibit);

      const appendResult = await this.appendOriginalEvidence(doc, exhibit, regularFont, boldFont);

      if (appendResult.appended) {
        appendedOriginalsCount += 1;
      } else {
        skippedOriginalsCount += 1;
      }
    }

    const pageCount = doc.getPageCount();
    const bytes = Buffer.from(await doc.save());
    const bundleHash = createHash('sha256').update(bytes).digest('hex');
    await writeFile(outputPath, bytes);
    const outputStats = await stat(outputPath);

    this.auditRepository.append({
      caseId,
      eventType: 'bundle_exported',
      entityType: 'bundle',
      entityId: bundleHash,
      details: {
        outputFilename: basename(outputPath),
        bundleHash,
        fileSizeBytes: outputStats.size,
        exhibitsCount: exhibits.length,
        pageCount,
        appendedOriginalsCount,
        skippedOriginalsCount
      }
    });

    return {
      status: 'exported',
      filePath: outputPath,
      bundleHash,
      fileSizeBytes: outputStats.size,
      exhibitsCount: exhibits.length,
      pageCount,
      appendedOriginalsCount,
      skippedOriginalsCount
    };
  }

  private toCaseRecord(trademarkCase: TrademarkCase): TrademarkCaseRecord {
    return {
      trademarkCase,
      goodsServices: this.casesRepository.listGoodsServices(trademarkCase.id)
    };
  }

  private toExhibits(caseId: string, goodsServices: readonly GoodsService[]): ExhibitRecord[] {
    const goodsServiceById = new Map(goodsServices.map((item) => [item.id, item]));

    return this.evidenceRepository.listByCase(caseId).map((evidence, index) => {
      const goodsServiceLinks = this.evidenceRepository.listGoodsServiceLinks(evidence.id);
      const linkedGoodsServices = goodsServiceLinks
        .map((link) => goodsServiceById.get(link.goodsServiceId))
        .filter((item): item is GoodsService => item !== undefined);

      return {
        exhibitNumber: index + 1,
        evidence,
        dateCandidates: this.evidenceRepository.listDateCandidates(evidence.id),
        goodsServiceLinks,
        goodsServices: linkedGoodsServices
      };
    });
  }

  private drawCoverPage(
    writer: BundleWriter,
    record: TrademarkCaseRecord,
    exhibitsCount: number
  ): void {
    const trademarkCase = record.trademarkCase;
    writer.title('MarkProof Evidence Bundle');
    writer.paragraph('Structured trademark proof-of-use evidence bundle for review.');
    writer.rule();
    writer.labelValue('Mark name', trademarkCase.markName);
    writer.labelValue('Owner', trademarkCase.ownerName);
    writer.labelValue('Registration number', trademarkCase.registrationNumber);
    writer.labelValue('Jurisdiction', trademarkCase.jurisdiction);
    writer.labelValue(
      'Relevant use period',
      `${trademarkCase.usePeriodFrom} to ${trademarkCase.usePeriodTo}`
    );
    writer.labelValue('Goods/services rows', String(record.goodsServices.length));
    writer.labelValue('Numbered exhibits', String(exhibitsCount));
    writer.labelValue('Generated', new Date().toISOString());
    writer.rule();
    writer.paragraph(LEGAL_DISCLAIMER);
  }

  private drawTableOfContents(writer: BundleWriter, exhibits: readonly ExhibitRecord[]): void {
    writer.heading('Table of contents');
    writer.paragraph('Cover page');
    writer.paragraph('Evidence index');

    for (const exhibit of exhibits) {
      writer.paragraph(`Exhibit ${exhibit.exhibitNumber}: ${exhibit.evidence.sourceFilename}`);
    }
  }

  private drawEvidenceIndex(writer: BundleWriter, exhibits: readonly ExhibitRecord[]): void {
    writer.heading('Evidence index');
    writer.tableHeader(
      ['Exhibit', 'Source filename', 'Date', 'Type', 'Territory', 'SHA-256'],
      [42, 120, 58, 70, 75, 118]
    );

    for (const exhibit of exhibits) {
      writer.tableRow(
        [
          String(exhibit.exhibitNumber),
          exhibit.evidence.sourceFilename,
          exhibit.evidence.dateOfUse ?? 'Review recommended',
          evidenceTypeLabels[exhibit.evidence.evidenceType],
          exhibit.evidence.territory || 'Not provided',
          exhibit.evidence.fileHash
        ],
        [42, 120, 58, 70, 75, 118]
      );
    }
  }

  private drawExhibitMetadata(writer: BundleWriter, exhibit: ExhibitRecord): void {
    const evidence = exhibit.evidence;
    const goodsServices =
      exhibit.goodsServices.length > 0
        ? exhibit.goodsServices
            .map((item) => `${formatNiceClass(item.niceClass)}: ${item.description}`)
            .join('\n')
        : 'No goods/services mapped.';

    writer.heading(`Exhibit ${exhibit.exhibitNumber}`);
    writer.labelValue('Date of use', evidence.dateOfUse ?? 'Review recommended');
    writer.labelValue('Evidence type', evidenceTypeLabels[evidence.evidenceType]);
    writer.labelValue('Territory', evidence.territory || 'Not provided');
    writer.labelValue('Covered goods/services', goodsServices);
    writer.labelValue('Notes', evidence.notes || 'Not provided');
    writer.labelValue('Source filename', evidence.sourceFilename);
    writer.labelValue('SHA-256 file hash', evidence.fileHash);
    writer.labelValue('Hash algorithm', evidence.hashAlgo);
    writer.labelValue('File size', formatBytes(evidence.fileSizeBytes));
    writer.labelValue('Original MIME type', evidence.mimeType ?? 'Unknown');
  }

  private async appendOriginalEvidence(
    doc: PDFDocument,
    exhibit: ExhibitRecord,
    regularFont: PDFFont,
    boldFont: PDFFont
  ): Promise<AppendOriginalResult> {
    try {
      const storedPath = this.storage.resolveStoredRelativePath(
        exhibit.evidence.storedRelativePath
      );
      const originalBytes = await readFile(storedPath);

      if (exhibit.evidence.mimeType === 'application/pdf') {
        const originalPdf = await PDFDocument.load(originalBytes);
        const copiedPages = await doc.copyPages(originalPdf, originalPdf.getPageIndices());

        for (const page of copiedPages) {
          doc.addPage(page);
        }

        return { appended: copiedPages.length > 0 };
      }

      if (exhibit.evidence.mimeType === 'image/png' || exhibit.evidence.mimeType === 'image/jpeg') {
        const image =
          exhibit.evidence.mimeType === 'image/png'
            ? await doc.embedPng(originalBytes)
            : await doc.embedJpg(originalBytes);
        const page = doc.addPage(PageSizes.A4);
        const maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
        const maxHeight = PAGE_HEIGHT - PAGE_MARGIN * 2 - 32;
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
        const width = image.width * scale;
        const height = image.height * scale;

        page.drawText(`Exhibit ${exhibit.exhibitNumber}: Original image`, {
          x: PAGE_MARGIN,
          y: PAGE_HEIGHT - PAGE_MARGIN,
          size: 12,
          font: boldFont,
          color: TEXT_COLOR
        });
        page.drawImage(image, {
          x: PAGE_MARGIN + (maxWidth - width) / 2,
          y: PAGE_MARGIN + (maxHeight - height) / 2,
          width,
          height
        });

        return { appended: true };
      }
    } catch {
      // Original pages are best-effort; metadata and hashes remain in the bundle.
    }

    const page = doc.addPage(PageSizes.A4);
    page.drawText(`Exhibit ${exhibit.exhibitNumber}: Original evidence not appended`, {
      x: PAGE_MARGIN,
      y: PAGE_HEIGHT - PAGE_MARGIN,
      size: 13,
      font: boldFont,
      color: TEXT_COLOR
    });
    page.drawText(
      'Review recommended: the original file could not be embedded in the generated PDF bundle.',
      {
        x: PAGE_MARGIN,
        y: PAGE_HEIGHT - PAGE_MARGIN - 26,
        size: 10.5,
        font: regularFont,
        color: MUTED_COLOR
      }
    );

    return { appended: false };
  }
}
