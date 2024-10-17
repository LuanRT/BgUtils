import type { BotGuardClientOptions, SnapshotArgs, VMFunctions } from '../utils/types.js';

export default class BotGuardClient {
  public vm: Record<string, any>;
  public program: string;
  public userInteractionElement?: Record<string, any>;
  public vmFunctions: VMFunctions = {};
  public syncSnapshotFunction?: (args: any[]) => Promise<string>;

  constructor(options: BotGuardClientOptions) {
    this.userInteractionElement = options.userInteractionElement;
    this.vm = options.globalObj[options.globalName];
    this.program = options.program;
  }

  public static async create(options: BotGuardClientOptions) {
    return await new BotGuardClient(options).load();
  }

  private async load() {
    if (!this.vm)
      throw new Error('[BotGuardClient]: VM not found in the global object');

    if (!this.vm.a)
      throw new Error('[BotGuardClient]: Could not load program');

    const vmFunctionsCallback = (
      asyncSnapshotFunction: VMFunctions['asyncSnapshotFunction'],
      shutdownFunction: VMFunctions['asyncSnapshotFunction'],
      passEventFunction: VMFunctions['passEventFunction'],
      checkCameraFunction: VMFunctions['checkCameraFunction']
    ) => {
      Object.assign(this.vmFunctions, { asyncSnapshotFunction, shutdownFunction, passEventFunction, checkCameraFunction });
    };

    try {
      this.syncSnapshotFunction = await this.vm.a(this.program, vmFunctionsCallback, true, this.userInteractionElement, () => {/** no-op */ }, [ [], [] ])[0];
    } catch (error) {
      throw new Error(`[BotGuardClient]: Failed to load program (${(error as Error).message})`);
    }

    return this;
  }

  /**
   * @example
   * ```ts
   * const result = await botguard.snapshot({
   *   contentBinding: {
   *     c: "a=6&a2=10&b=SZWDwKVIuixOp7Y4euGTgwckbJA&c=1729143849&d=1&t=7200&c1a=1&c6a=1&c6b=1&hh=HrMb5mRWTyxGJphDr0nW2Oxonh0_wl2BDqWuLHyeKLo",
   *     e: "ENGAGEMENT_TYPE_VIDEO_LIKE",
   *     encryptedVideoId: "P-vC09ZJcnM"
   *    }
   * });
   * 
   * console.log(result);
   * ```
   */
  public async snapshot(args: SnapshotArgs): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.vmFunctions.asyncSnapshotFunction)
        return reject(new Error('[BotGuardClient]: Async snapshot function not found'));

      this.vmFunctions.asyncSnapshotFunction((response) => resolve(response), [
        args.contentBinding,
        args.signedTimestamp,
        args.webPoSignalOutput,
        args.skipPrivacyBuffer
      ]);
    });
  }

  public async invoke(args: SnapshotArgs) {
    if (!this.syncSnapshotFunction)
      throw new Error('[BotGuardClient]: Sync snapshot function not found');

    const result = await this.syncSnapshotFunction([
      args.contentBinding,
      args.signedTimestamp,
      args.webPoSignalOutput,
      args.skipPrivacyBuffer
    ]);
    
    return result;
  }

  public passEvent(args: unknown) {
    if (!this.vmFunctions.passEventFunction)
      throw new Error('[BotGuardClient]: Pass event function not found');

    this.vmFunctions.passEventFunction(args);
  }

  public checkCamera(args: unknown) {
    if (!this.vmFunctions.checkCameraFunction)
      throw new Error('[BotGuardClient]: Check camera function not found');

    this.vmFunctions.checkCameraFunction(args);
  }

  public shutdown() {
    if (!this.vmFunctions.shutdownFunction)
      throw new Error('[BotGuardClient]: Shutdown function not found');

    this.vmFunctions.shutdownFunction();
  }
}