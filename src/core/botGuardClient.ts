import type { BotGuardClientOptions, SnapshotArgs, VMFunctions } from '../utils/types.js';
import { BGError } from '../utils/index.js';

export default class BotGuardClient {
  public vm: Record<string, any>;
  public program: string;
  public userInteractionElement?: any;
  public vmFunctions: VMFunctions = {};
  public syncSnapshotFunction?: (args: any[]) => Promise<string>;

  constructor(options: BotGuardClientOptions) {
    this.userInteractionElement = options.userInteractionElement;
    this.vm = options.globalObj[options.globalName];
    this.program = options.program;
  }

  /**
   * Factory method to create and load a BotGuardClient instance.
   * @param options - Configuration options for the BotGuardClient.
   * @returns A promise that resolves to a loaded BotGuardClient instance.
   */
  public static async create(options: BotGuardClientOptions): Promise<BotGuardClient> {
    return await new BotGuardClient(options).load();
  }

  private async load() {
    if (!this.vm)
      throw new BGError('[BotGuardClient]: VM not found in the global object');

    if (!this.vm.a)
      throw new BGError('[BotGuardClient]: Could not load program');

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
      throw new BGError(`[BotGuardClient]: Failed to load program (${(error as Error).message})`);
    }

    return this;
  }

  /**
   * Takes a snapshot asynchronously.
   * @returns The snapshot result.
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
        return reject(new BGError('[BotGuardClient]: Async snapshot function not found'));

      this.vmFunctions.asyncSnapshotFunction((response) => resolve(response), [
        args.contentBinding,
        args.signedTimestamp,
        args.webPoSignalOutput,
        args.skipPrivacyBuffer
      ]);
    });
  }

  /**
   * Takes a snapshot synchronously.
   * @returns The snapshot result.
   * @throws Error Throws an error if the synchronous snapshot function is not found.
   */
  public async snapshotSynchronous(args: SnapshotArgs): Promise<string> {
    if (!this.syncSnapshotFunction)
      throw new BGError('[BotGuardClient]: Sync snapshot function not found');

    return this.syncSnapshotFunction([
      args.contentBinding,
      args.signedTimestamp,
      args.webPoSignalOutput,
      args.skipPrivacyBuffer
    ]);
  }

  /**
   * Passes an event to the VM.
   * @throws Error Throws an error if the pass event function is not found.
   */
  public passEvent(args: unknown): void {
    if (!this.vmFunctions.passEventFunction)
      throw new BGError('[BotGuardClient]: Pass event function not found');
    this.vmFunctions.passEventFunction(args);
  }

  /**
   * Checks the "camera".
   * @throws Error Throws an error if the check camera function is not found.
   */
  public checkCamera(args: unknown): void {
    if (!this.vmFunctions.checkCameraFunction)
      throw new BGError('[BotGuardClient]: Check camera function not found');
    this.vmFunctions.checkCameraFunction(args);
  }

  /**
   * Shuts down the VM. Taking a snapshot after this will throw an error.
   * @throws Error Throws an error if the shutdown function is not found.
   */
  public shutdown(): void {
    if (!this.vmFunctions.shutdownFunction)
      throw new BGError('[BotGuardClient]: Shutdown function not found');
    this.vmFunctions.shutdownFunction();
  }
}