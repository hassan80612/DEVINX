export type LaserAdapterId='lightburn-rest'|'lightburn-udp-legacy';

export type LaserAdapterCapabilities={
  detect:boolean;
  readConnection:boolean;
  readJobState:boolean;
  readProgress:boolean;
  readProject:boolean;
  uploadFile:boolean;
  openFile:boolean;
  start:boolean;
  pause:boolean;
  stop:boolean;
  frame:boolean;
};

export const LASER_ADAPTER_CAPABILITIES:Record<LaserAdapterId,LaserAdapterCapabilities>={
  'lightburn-rest':{
    detect:true,
    readConnection:true,
    readJobState:true,
    readProgress:true,
    readProject:true,
    uploadFile:true,
    openFile:true,
    start:false,
    pause:false,
    stop:false,
    frame:false
  },
  'lightburn-udp-legacy':{
    detect:true,
    readConnection:true,
    readJobState:true,
    readProgress:false,
    readProject:false,
    uploadFile:false,
    openFile:false,
    start:true,
    pause:false,
    stop:false,
    frame:false
  }
};

/**
 * Product policy is deliberately stricter than the raw adapter.
 * UDP documents START, but DevinX keeps execution disabled until a supported,
 * equally reliable abort path exists for the target integration.
 */
export function productAllowsMachineExecution(_adapter:LaserAdapterId){
  return false;
}
