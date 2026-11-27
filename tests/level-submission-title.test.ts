import { expect,test } from "bun:test";
import { persistSubmission } from "../src/lib/leadmagnet/persist-submission";
import { toClientDto,createDossier } from "../src/lib/leadmagnet/dossier";
import type { SubmissionSnapshot } from "../src/lib/leadmagnet/submission";

const snapshot={dto:toClientDto({...createDossier(),title:"TEST — Réservoir de refroidissement"})} as SubmissionSnapshot;
test("AUTO005: an existing masked NDA stub receives the current title before its revision; RPCs simulated",async()=>{
  let title="Titre masqué",revision=0;
  const result=await persistSubmission(snapshot,{dossierId:"stub",expectedRevision:0,ndaRequired:false},{
    create:async()=>{throw Error("must reuse stub");},
    rename:async(id,value)=>{expect(id).toBe("stub");title=value;},
    submit:async(id,expected,sent)=>{expect(title).toBe(sent.dto.title!);expect(id).toBe("stub");expect(expected).toBe(revision);revision++;return {revision_id:"v1",submitted_at:"2026-11-27T00:00:00Z"};},
  });
  expect(result.id).toBe("v1");expect(revision).toBe(1);
});
test("a server refusal to disclose the title never proceeds to revision submission",async()=>{
  let submitted=false;
  await expect(persistSubmission(snapshot,{dossierId:"confidential-stub",expectedRevision:0,ndaRequired:true},{
    create:async()=>"unused",rename:async()=>{throw Error("NDA_NOT_IN_FORCE");},submit:async()=>{submitted=true;return {revision_id:"wrong",submitted_at:""};},
  })).rejects.toThrow("NDA_NOT_IN_FORCE");expect(submitted).toBe(false);
});
test("new dossiers keep their creation title and notify the caller before submitting",async()=>{
  const events:string[]=[];
  await persistSubmission(snapshot,{dossierId:null,expectedRevision:0,ndaRequired:false,onDossierCreated:id=>events.push(id)},{
    create:async(title,nda)=>{expect(title).toBe(snapshot.dto.title!);expect(nda).toBe(false);return "new";},
    rename:async()=>{throw Error("no redundant rename");},submit:async()=>{expect(events).toEqual(["new"]);return {revision_id:"v1",submitted_at:"now"};},
  });
});
