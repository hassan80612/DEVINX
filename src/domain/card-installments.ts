// Shared, read-only ledger reconciliation for card purchases, invoices and daily planning.
// Settlement is authoritative when paid_at is populated; otherwise payments are
// summed by installment ID. All amounts are in integer cents.
export type CardInstallmentForBalance={id:string;amount_minor:number;paid_at:string|null};
export type CardPaymentForBalance={source_id:string|null;amount_minor:number};
export type CardInstallmentBalance={paid:number;remaining:number};

export function reconcileCardInstallments(
  installments:readonly CardInstallmentForBalance[],
  payments:readonly CardPaymentForBalance[]
):Map<string,CardInstallmentBalance>{
  const linkedPaid=new Map<string,number>();
  for(const payment of payments){
    if(!payment.source_id)continue;
    const cents=Math.max(0,Math.trunc(Number(payment.amount_minor)||0));
    linkedPaid.set(payment.source_id,(linkedPaid.get(payment.source_id)||0)+cents);
  }
  return new Map(installments.map(installment=>{
    const original=Math.max(0,Math.trunc(Number(installment.amount_minor)||0));
    const ledgerPaid=Math.min(original,linkedPaid.get(installment.id)||0);
    const paid=installment.paid_at?original:ledgerPaid;
    return[installment.id,{paid,remaining:original-paid}] as const;
  }));
}
