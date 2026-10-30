// Presentation sizing only. Invisible grid cells reserve the longest normal
// phase + technical messages at the available width, without clipping text.
export function marketReadingRowSizingTexts(t=value=>value){
 const phases=['CONTINUIDADE TESTANDO RESISTÊNCIA · CALL',
  'REVERSÃO AINDA SEM QUEBRA · CALL','CONTINUIDADE PERDENDO FORÇA · CALL'];
 const technical=['SEM COTAÇÃO VÁLIDA · ÚLTIMA LEITURA',
  'COTAÇÃO ATRASADA · ÚLTIMA LEITURA','LEITURA EM ATUALIZAÇÃO'];
 return phases.flatMap(phase=>technical.map(status=>t(phase)+' · '+t(status)));
}
