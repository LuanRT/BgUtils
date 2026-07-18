import type {
  BgEventData, BotGuardClientOptions, ClientErrorData, EventCountData,
  LatencyData, PayloadSizeData, SnapshotArgs, VMFunctions
} from '../utils/types.js';

import { BgError, DeferredPromise } from '../utils/helpers.js';
import { EventEmitterLike } from '../utils/EventEmitterLike.js';

export class BotGuardClient extends EventEmitterLike {
  public vm: Record<string, any>;
  public program: string;
  public userInteractionElement?: any;
  public syncSnapshotFunction?: (args: any[]) => Promise<string>;
  public deferredVmFunctions = new DeferredPromise<VMFunctions>();
  public defaultTimeout = 3000;

  on(type: 'record-bg-event', listener: (data: BgEventData) => void): void;
  on(type: 'increment-client-error-count', listener: (data: ClientErrorData) => void): void;
  on(type: 'record-payload-size', listener: (data: PayloadSizeData) => void): void;
  on(type: 'record-latency', listener: (data: LatencyData) => void): void;
  on(type: 'increment-bg-event-count', listener: (data: EventCountData) => void): void;
  on(type: string, listener: (...args: any[]) => void): void {
    super.on(type, listener);
  }

  off(type: 'record-bg-event', listener: (data: BgEventData) => void): void;
  off(type: 'increment-client-error-count', listener: (data: ClientErrorData) => void): void;
  off(type: 'record-payload-size', listener: (data: PayloadSizeData) => void): void;
  off(type: 'record-latency', listener: (data: LatencyData) => void): void;
  off(type: 'increment-bg-event-count', listener: (data: EventCountData) => void): void;
  off(type: string, listener: (...args: any[]) => void): void {
    super.off(type, listener);
  }

  constructor(options: BotGuardClientOptions) {
    super();
    if (!options.globalObject || !options.globalName || !options.program) {
      throw new BgError('Invalid options', { options });
    }

    this.userInteractionElement = options.userInteractionElement;
    this.vm = options.globalObject[options.globalName];
    this.program = options.program;
  }

  /**
   * Factory method to create and load a BotGuardClient instance.
   * @param options - Configuration options for the BotGuardClient.
   * @returns A loaded BotGuardClient instance.
   */
  public static async create(options: BotGuardClientOptions): Promise<BotGuardClient> {
    return await new BotGuardClient(options).load();
  }

  private async load() {
    if (!this.vm)
      throw new BgError('EGOU: BotGuard unavailable');

    if (!this.vm.a)
      throw new BgError('ELIU: BotGuard initialization function unavailable');

    const vmSetupCallback = (
      asyncSnapshotFunction: VMFunctions['asyncSnapshotFunction'],
      shutdownFunction: VMFunctions['shutdownFunction'],
      passEventFunction: VMFunctions['passEventFunction'],
      checkCameraFunction: VMFunctions['checkCameraFunction']
    ) => {
      this.deferredVmFunctions.resolve({
        asyncSnapshotFunction,
        shutdownFunction,
        passEventFunction,
        checkCameraFunction
      });
    };

    /** 
     * NOTE: 
     * The descriptions in the following functions are referring to the respective 
     * Google Clearcut (https://www.google.com/log?format=json&hasfast=true)
     * label used by each function in the original code.
     */

    /**
     * "/client_streamz/bg/el" (botguard/event_log)
     */
    const logEvent = (event: string, elapsedTime: number) => {
      this.emit('record-bg-event', { event, elapsedTime });
    };

    /**
     * "/client_streamz/bg/cec" (botguard/client_error_count)
     */
    const incrementClientErrorCount = (errorCode: number) => {
      this.emit('increment-client-error-count', { errorCode });
    };

    /**
     * "/client_streamz/bg/od/p" (botguard/output_data/payload_size maybe?)
     */
    const recordPayloadSize = (payloadSize: number) => {
      this.emit('record-payload-size', { payloadSize });
    };

    /**
     * "/client_streamz/bg/od/n"
     */
    const recordLatency = (latency: number, et: number) => {
      this.emit('record-latency', { latency, et });
    };

    /**
     * "/client_streamz/bg/ec" (botguard/event_count)
     */
    const incrementEventCount = (event: string) => {
      this.emit('increment-bg-event-count', { event });
    };

    const loggerFunctions = [
      logEvent,
      incrementClientErrorCount,
      recordPayloadSize,
      recordLatency,
      incrementEventCount
    ];

    /**
     * Telemetry logging callback passed to the VM.
     * @NOTE
     * This is a direct port of the minified code, minus the telemetry throttling logic.
     * I don't know what the event flags mean, but I noticed that 'k' is spammed every time
     * the mouse or keyboard is used on the YouTube page. 
     * Maybe 'k' is for keyboard and 'h' is hardware?
     */
    const vmTelemetryCallback = (
      latency: number,
      eventFlag1: boolean,
      eventFlag2: boolean
    ) => {
      let event = 'k';

      if (eventFlag1) {
        event = 'h';
      } else if (eventFlag2) {
        event = 'u';
      }

      incrementEventCount(event);
      logEvent(event, latency);
    };

    try {
      this.syncSnapshotFunction = await this.vm.a(
        this.program,
        vmSetupCallback,
        true,
        this.userInteractionElement,
        vmTelemetryCallback,
        [ [], [] ],
        undefined,
        false,
        loggerFunctions
      )?.[0];
    } catch (error) {
      throw new BgError('Could not load program', { error });
    }

    return this;
  }

  /**
   * Calls a VM function with a timeout.
   * @param vmFunctionName - The name of the VM function to execute.
   * @param timeout - The timeout in milliseconds.
   * @param args - The arguments to pass to the VM function.
   */
  private async execute<T extends keyof VMFunctions>(
    vmFunctionName: T,
    timeout: number,
    ...args: Parameters<NonNullable<VMFunctions[T]>>
  ) {
    return await Promise.race([
      (async () => {
        const vmFunctions = await this.deferredVmFunctions.promise;
        const vmFunction = vmFunctions[vmFunctionName] as ((...args: any[]) => any);
        if (!vmFunction)
          throw new BgError(`${vmFunctionName} function not found`);
        return vmFunction(...args);
      })(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new BgError('VM operation timed out')), timeout)
      )
    ]) as ReturnType<NonNullable<VMFunctions[T]>>;
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
  public async snapshot(args: SnapshotArgs, timeout = this.defaultTimeout): Promise<string> {
    return await new Promise<string>(async (resolve, reject) => {
      await this.execute('asyncSnapshotFunction', timeout,
        (response) => resolve(response), [
          args.contentBinding,
          args.signedTimestamp,
          args.webPoSignalOutput,
          args.skipPrivacyBuffer
        ]).catch(reject);
    });
  }

  /**
   * Passes an event to the VM.
   */
  public async passEvent(args: unknown, timeout = this.defaultTimeout): Promise<void> {
    return this.execute('passEventFunction', timeout, args);
  }

  /**
   * Checks the "camera".
   */
  public async checkCamera(args: unknown, timeout = this.defaultTimeout): Promise<void> {
    return this.execute('checkCameraFunction', timeout, args);
  }

  /**
   * Shuts down the VM. Once called, the VM is no longer usable.
   */
  public async shutdown(timeout = this.defaultTimeout): Promise<void> {
    return this.execute('shutdownFunction', timeout);
  }

  /**
   * Takes a snapshot synchronously.
   * @returns The snapshot result.
   */
  public async snapshotSynchronous(args: SnapshotArgs): Promise<string> {
    if (!this.syncSnapshotFunction)
      throw new BgError('Synchronous snapshot function not found');

    return this.syncSnapshotFunction([
      args.contentBinding,
      args.signedTimestamp,
      args.webPoSignalOutput,
      args.skipPrivacyBuffer
    ]);
  }
}