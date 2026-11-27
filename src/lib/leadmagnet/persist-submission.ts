import type { SubmissionSnapshot } from "./submission";

export interface PersistSubmissionOptions {
  dossierId: string | null;
  expectedRevision: number;
  ndaRequired: boolean;
  onDossierCreated?: ((id:string)=>void) | undefined;
}
interface Operations {
  create(title:string,ndaRequired:boolean):Promise<string>;
  rename(id:string,title:string):Promise<void>;
  submit(id:string,expectedRevision:number,snapshot:SubmissionSnapshot):Promise<{revision_id:string;submitted_at:string}>;
}
/** Called only by the consent-checked submit boundary. Each operation also checks
 * authorization and NDA authority on the server. Fail closed before submission. */
export async function persistSubmission(snapshot:SubmissionSnapshot,options:PersistSubmissionOptions,operations:Operations) {
  const title=snapshot.dto.title??"Dossier";
  const id=options.dossierId??await operations.create(title,options.ndaRequired);
  if(!options.dossierId) options.onDossierCreated?.(id);
  // Preparing an NDA creates a deliberately masked stub. Restore its readable
  // title only once the user consents to sending and the server permits transfer.
  if(options.dossierId) await operations.rename(id,title);
  const result=await operations.submit(id,options.expectedRevision,snapshot);
  return {id:result.revision_id,at:result.submitted_at};
}
