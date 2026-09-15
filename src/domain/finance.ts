export type Money = number;
export type IncomeSourceKind = 'driver' | 'delivery' | 'salary' | 'self_employed' | 'other';
export type VehicleEnergy = 'gasoline' | 'ethanol' | 'diesel' | 'hybrid' | 'electric' | 'human';
export type GoalPeriod = 'daily' | 'weekly' | 'monthly';
export type GoalBasis = 'gross' | 'operational_net' | 'savings' | 'payoff';

export interface WorkSnapshot {
  grossIncome: Money;
  hoursWorked: number;
  distanceKm: number;
  energyCost: Money;
  extraWorkCost?: Money;
}

export function combustionEnergyCost(distanceKm: number, kmPerLiter: number, pricePerLiter: Money): Money {
  if (distanceKm < 0 || kmPerLiter <= 0 || pricePerLiter < 0) return 0;
  return Math.round((distanceKm / kmPerLiter) * pricePerLiter);
}

export function electricEnergyCost(distanceKm: number, kmPerKwh: number, pricePerKwh: Money): Money {
  if (distanceKm < 0 || kmPerKwh <= 0 || pricePerKwh < 0) return 0;
  return Math.round((distanceKm / kmPerKwh) * pricePerKwh);
}

export function workMetrics(work: WorkSnapshot) {
  const operationalCost = work.energyCost + (work.extraWorkCost ?? 0);
  const operationalNet = work.grossIncome - operationalCost;
  return {
    operationalCost,
    operationalNet,
    grossPerHour: work.hoursWorked > 0 ? work.grossIncome / work.hoursWorked : 0,
    netPerHour: work.hoursWorked > 0 ? operationalNet / work.hoursWorked : 0,
    grossPerKm: work.distanceKm > 0 ? work.grossIncome / work.distanceKm : 0,
    netPerKm: work.distanceKm > 0 ? operationalNet / work.distanceKm : 0,
  };
}

export function hoursToGoal(remainingAmount: Money, operationalNetPerHour: Money): number | null {
  if (remainingAmount <= 0) return 0;
  if (operationalNetPerHour <= 0) return null;
  return remainingAmount / operationalNetPerHour;
}

export function projectedBalance(currentBalance: Money, upcomingCommitments: Money): Money {
  return currentBalance - upcomingCommitments;
}

export function spendImpact(projected: Money, proposedSpend: Money): Money {
  return projected - Math.max(0, proposedSpend);
}
