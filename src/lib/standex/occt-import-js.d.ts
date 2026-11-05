declare module "occt-import-js" {
  export default function init(options?: {
    locateFile?: (path: string) => string;
    print?: (...args: unknown[]) => void;
    printErr?: (...args: unknown[]) => void;
    wasmBinary?: Uint8Array;
  }): Promise<{
    ReadStepFile(data: Uint8Array, params: object): import("./machine-step").StepResult;
  }>;
}
