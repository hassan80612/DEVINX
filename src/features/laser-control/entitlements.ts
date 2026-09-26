import {LASER_PLANS,type LaserPlanId} from '@/features/laser-control/config';

export type LaserEntitlementStatus='active'|'blocked'|'expired';

export type LaserEntitlement={
  planId:LaserPlanId;
  status:LaserEntitlementStatus;
  startsAt:string;
  expiresAt:string|null;
  maxPcs:number;
  maxMachines:number;
  maxMobileDevices:number;
  maxActiveOperators:number;
};

export type LaserUsage={
  activePcs:number;
  activeMachines:number;
  activeMobileDevices:number;
  activeOperatorSessions:number;
};

export type LaserAccessDecision={
  allowed:boolean;
  reason:
    |'ok'
    |'not_active'
    |'expired'
    |'pc_limit'
    |'machine_limit'
    |'mobile_limit'
    |'operator_limit';
};

export function entitlementFromPlan(planId:LaserPlanId,startsAt:string,expiresAt:string|null):LaserEntitlement{
  const plan=LASER_PLANS.find(item=>item.id===planId);
  if(!plan)throw new Error('Unknown Laser plan');

  return {
    planId,
    status:'active',
    startsAt,
    expiresAt,
    maxPcs:plan.pcs,
    maxMachines:plan.machines,
    maxMobileDevices:plan.mobileDevices,
    maxActiveOperators:plan.activeOperators
  };
}

export function isLaserEntitlementCurrentlyActive(entitlement:LaserEntitlement,now=Date.now()){
  if(entitlement.status!=='active')return false;
  if(entitlement.expiresAt&&Date.parse(entitlement.expiresAt)<=now)return false;
  return true;
}

export function canRegisterLaserPc(entitlement:LaserEntitlement,usage:LaserUsage,now=Date.now()):LaserAccessDecision{
  if(entitlement.status!=='active')return {allowed:false,reason:'not_active'};
  if(entitlement.expiresAt&&Date.parse(entitlement.expiresAt)<=now)return {allowed:false,reason:'expired'};
  if(usage.activePcs>=entitlement.maxPcs)return {allowed:false,reason:'pc_limit'};
  return {allowed:true,reason:'ok'};
}

export function canRegisterLaserMachine(entitlement:LaserEntitlement,usage:LaserUsage,now=Date.now()):LaserAccessDecision{
  if(!isLaserEntitlementCurrentlyActive(entitlement,now))
    return {allowed:false,reason:entitlement.expiresAt&&Date.parse(entitlement.expiresAt)<=now?'expired':'not_active'};
  if(usage.activeMachines>=entitlement.maxMachines)return {allowed:false,reason:'machine_limit'};
  return {allowed:true,reason:'ok'};
}

export function canRegisterLaserMobile(entitlement:LaserEntitlement,usage:LaserUsage,now=Date.now()):LaserAccessDecision{
  if(!isLaserEntitlementCurrentlyActive(entitlement,now))
    return {allowed:false,reason:entitlement.expiresAt&&Date.parse(entitlement.expiresAt)<=now?'expired':'not_active'};
  if(usage.activeMobileDevices>=entitlement.maxMobileDevices)return {allowed:false,reason:'mobile_limit'};
  return {allowed:true,reason:'ok'};
}

export function canAcquireLaserControlSession(entitlement:LaserEntitlement,usage:LaserUsage,now=Date.now()):LaserAccessDecision{
  if(!isLaserEntitlementCurrentlyActive(entitlement,now))
    return {allowed:false,reason:entitlement.expiresAt&&Date.parse(entitlement.expiresAt)<=now?'expired':'not_active'};
  if(usage.activeOperatorSessions>=entitlement.maxActiveOperators)return {allowed:false,reason:'operator_limit'};
  return {allowed:true,reason:'ok'};
}
