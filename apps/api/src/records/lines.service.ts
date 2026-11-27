import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { Tx } from '../db/database.service';
import { isUuid } from '../metadata/field-types';
import { SecurityContext, can } from '../security/security-context';
import { LINE_DOCUMENTS, LineAmounts, documentTotals, grandTotal, lineAmounts } from './line-documents';
import { RecordsService } from './records.service';

const num = (min: number, max: number) => z.coerce.number().finite().min(min).max(max);

export const LinesSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.string().nullable().optional(),
        description: z.string().trim().max(2000).optional(),
        quantity: num(0.001, 1e9),
        /** se assente e c'è un prodotto, si usa il prezzo di listino */
        unitPrice: num(0, 1e10).optional(),
        discount: num(0, 100).default(0),
        /** se assente e c'è un prodotto, si usa la sua aliquota */
        vatRate: num(0, 100).optional(),
      }),
    )
    .max(500),
});
export type LinesBody = z.infer<typeof LinesSchema>;

const PRODUCTS = 'Products';

@Injectable()
export class LinesService {
  constructor(private readonly records: RecordsService) {}

  private doc(module: string) {
    const d = LINE_DOCUMENTS[module];
    if (!d) throw new NotFoundException('Il modulo non ha righe');
    return d;
  }

  async list(tx: Tx, sec: SecurityContext, module: string, id: string) {
    this.doc(module);
    await this.records.get(tx, sec, module, id); // verifica accesso in lettura
    const r = await tx.query(
      `SELECT l.*, p.label AS product_label
         FROM record_lines l LEFT JOIN records p ON p.id = l.product_id
        WHERE l.record_id = $1 ORDER BY l.position`,
      [id],
    );
    return r.rows.map((l) => ({
      id: l.id,
      productId: l.product_id,
      // il nome del prodotto si mostra solo a chi può vedere il catalogo
      productLabel: l.product_id && can(sec, PRODUCTS, 'view') ? l.product_label : null,
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unit_price),
      discount: Number(l.discount),
      vatRate: Number(l.vat_rate),
      net: Number(l.net_amount),
      vat: Number(l.vat_amount),
      total: Number(l.total_amount),
    }));
  }

  /** Sostituisce tutte le righe e ricalcola i totali del documento. */
  async replace(tx: Tx, sec: SecurityContext, module: string, id: string, body: LinesBody) {
    const doc = this.doc(module);
    const { row } = await this.records.loadWritable(tx, sec, module, id);

    // prodotti indicati: devono esistere ed essere visibili all'utente
    const productIds = [...new Set(body.lines.map((l) => l.productId).filter((x): x is string => !!x))];
    const errors: Record<string, string> = {};
    body.lines.forEach((l, i) => {
      if (l.productId && !isUuid(l.productId)) errors[`lines.${i}.productId`] = 'prodotto non valido';
    });
    const products = new Map<string, { label: string; data: Record<string, unknown> }>();
    if (productIds.length && !Object.keys(errors).length) {
      if (!can(sec, PRODUCTS, 'view')) throw new BadRequestException('Non hai accesso al catalogo prodotti');
      const r = await tx.query(
        `SELECT id, label, data FROM records WHERE id = ANY($1::uuid[]) AND module = $2 AND deleted_at IS NULL`,
        [productIds, PRODUCTS],
      );
      for (const p of r.rows) products.set(p.id, { label: p.label, data: p.data });
    }

    const parsed = body.lines.map((l, i) => {
      const p = l.productId ? products.get(l.productId) : undefined;
      if (l.productId && !p) {
        errors[`lines.${i}.productId`] ??= 'prodotto inesistente';
        return null;
      }
      const description = l.description || p?.label || '';
      if (!description) errors[`lines.${i}.description`] = 'descrizione obbligatoria';
      const unitPrice = l.unitPrice ?? Number(p?.data.unit_price ?? NaN);
      if (!Number.isFinite(unitPrice)) errors[`lines.${i}.unitPrice`] = 'prezzo obbligatorio';
      const vatRate = l.vatRate ?? Number(p?.data.vat_rate ?? 0);
      const input = { quantity: l.quantity, unitPrice, discount: l.discount, vatRate };
      return { ...input, productId: l.productId || null, description, amounts: lineAmounts(input) };
    });
    if (Object.keys(errors).length) throw new BadRequestException({ message: 'Righe non valide', errors });
    const lines = parsed.filter((l): l is NonNullable<typeof l> => l !== null);

    await tx.query(`DELETE FROM record_lines WHERE record_id = $1`, [id]);
    for (const [i, l] of lines.entries()) {
      await tx.query(
        `INSERT INTO record_lines (tenant_id, record_id, position, product_id, description, quantity, unit_price,
                                   discount, vat_rate, net_amount, vat_amount, total_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          sec.tenantId, id, i + 1, l.productId, l.description, l.quantity, l.unitPrice,
          l.discount, l.vatRate, l.amounts.net, l.amounts.vat, l.amounts.total,
        ],
      );
    }
    const totals: LineAmounts = documentTotals(lines.map((l) => l.amounts));
    await this.records.setComputed(tx, sec, module, row, {
      [doc.totals.net]: totals.net,
      [doc.totals.vat]: totals.vat,
      [doc.totals.total]: grandTotal(totals.net, totals.vat, row.data[doc.totals.adjustment]),
    });
    return { lines: await this.list(tx, sec, module, id), totals };
  }
}
