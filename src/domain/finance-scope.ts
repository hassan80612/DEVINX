// Exclude legacy card-module generated entries from ACTIVE finance views.
// Historical rows stay untouched in the database for audit or recovery.
// Manual expenses (even if paid with a card) and unrelated payments remain visible.
export function isCardGeneratedTransaction(sourceType:string|null|undefined):boolean{
  return sourceType==='card_installment_payment'||sourceType==='card_bill_payment';
}
export function activeFinanceTransactions<T extends {source_type:string|null}>(rows:readonly T[]):T[]{
  return rows.filter(row=>!isCardGeneratedTransaction(row.source_type));
}
