import type { WebPoSignalOutput } from '../../../..';
import { BG, buildURL, GOOG_API_KEY } from '../../../..';
import GoogleVideo, { Protos } from 'googlevideo';
import { Innertube, UniversalCache, YT, YTNodes } from 'youtubei.js/web';

import shaka from 'shaka-player/dist/shaka-player.ui';
import 'shaka-player/dist/controls.css';

const title = document.getElementById('title') as HTMLHeadingElement;
const description = document.getElementById('description') as HTMLDivElement;
const metadata = document.getElementById('metadata') as HTMLDivElement;
const loader = document.getElementById('loader') as HTMLDivElement;
const form = document.querySelector('form') as HTMLFormElement;

type WebPoMinter = {
  integrityTokenBasedMinter?: BG.WebPoMinter;
  botguardClient?: BG.BotGuardClient;
}

async function getWebPoMinter(): Promise<WebPoMinter> {
  const requestKey = 'O43z0dpjhgX20SCx4KAo';

  const challengeResponse = await fetch(buildURL('Create', true), {
    method: 'POST',
    headers: {
      'content-type': 'application/json+protobuf',
      'x-goog-api-key': GOOG_API_KEY,
      'x-user-agent': 'grpc-web-javascript/0.1'
    },
    body: JSON.stringify([ requestKey ])
  });

  const challengeResponseData = await challengeResponse.json();

  const bgChallenge = BG.Challenge.parseChallengeData(challengeResponseData);

  if (!bgChallenge)
    throw new Error('Could not get challenge');

  const interpreterJavascript = bgChallenge.interpreterJavascript.privateDoNotAccessOrElseSafeScriptWrappedValue;

  if (!document.getElementById(bgChallenge.interpreterHash)) {
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.id = bgChallenge.interpreterHash;
    script.textContent = interpreterJavascript;
    document.head.appendChild(script);
  }

  const botguardClient = await BG.BotGuardClient.create({
    globalObj: globalThis,
    globalName: bgChallenge.globalName,
    program: bgChallenge.program
  });

  if (bgChallenge) {
    const webPoSignalOutput: WebPoSignalOutput = [];
    const botguardResponse = await botguardClient.snapshot({ webPoSignalOutput });

    const integrityTokenResponse = await fetch(buildURL('GenerateIT', true), {
      method: 'POST',
      headers: {
        'content-type': 'application/json+protobuf',
        'x-goog-api-key': GOOG_API_KEY,
        'x-user-agent': 'grpc-web-javacript/0.1'
      },
      body: JSON.stringify([ requestKey, botguardResponse ])
    });

    const integrityTokenResponseData = await integrityTokenResponse.json();
    const integrityToken = integrityTokenResponseData[0] as string | undefined;

    if (!integrityToken) {
      console.error('Could not get integrity token. Interpreter Hash:', bgChallenge.interpreterHash);
      return {};
    }

    const integrityTokenBasedMinter = await BG.WebPoMinter.create({ integrityToken }, webPoSignalOutput);

    return {
      integrityTokenBasedMinter,
      botguardClient
    };
  }

  return {};
}

async function main() {
  let sessionWebPo: string | undefined;
  const { integrityTokenBasedMinter } = await getWebPoMinter();

  const yt = await Innertube.create({
    fetch: (input, init) => {
      const url = typeof input === 'string'
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url);

      // Transform the url for use with our proxy.
      url.searchParams.set('__host', url.host);
      url.host = 'localhost:8080';
      url.protocol = 'http';

      const headers = init?.headers
        ? new Headers(init.headers)
        : input instanceof Request
          ? input.headers
          : new Headers();

      // Now serialize the headers.
      url.searchParams.set('__headers', JSON.stringify([ ...headers ]));

      // Copy over the request.
      const request = new Request(
        url,
        input instanceof Request ? input : undefined
      );

      headers.delete('user-agent');

      return fetch(request, init ? {
        ...init,
        headers
      } : {
        headers
      });
    },
    generate_session_locally: false,
    cache: new UniversalCache(false)
  });
  
  if (integrityTokenBasedMinter) {
    sessionWebPo = await integrityTokenBasedMinter.mintAsWebsafeString(yt.session.context.client.visitorData ?? '');
  }
  
  form.animate({ opacity: [ 0, 1 ] }, { duration: 300, easing: 'ease-in-out' });
  form.style.display = 'block';

  showUI({ hidePlayer: true });

  let player: shaka.Player | undefined;
  let ui: shaka.ui.Overlay | undefined;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (player) {
      await player.destroy();
    }

    hideUI();

    let videoId;

    const videoIdOrURL = document.querySelector<HTMLInputElement>('input[type=text]')?.value;

    if (!videoIdOrURL) {
      title.textContent = 'No video id or URL provided';
      showUI({ hidePlayer: true });
      return;
    }

    try {
      if (videoIdOrURL.match(/(http|https):\/\/([\w_-]+(?:\.[\w_-]+)+)([\w.,@?^=%&:/~+#-]*[\w@?^=%&/~+#-])/)) {
        const endpoint = await yt.resolveURL(videoIdOrURL);

        if (!endpoint.payload.videoId) {
          title.textContent = 'Could not resolve URL';
          showUI({ hidePlayer: true });
          return;
        }

        videoId = endpoint.payload.videoId;
      } else {
        videoId = videoIdOrURL;
      }

      const extraArgs: Record<string, any> = {
        playbackContext: {
          contentPlaybackContext: {
            vis: 0,
            splay: false,
            lactMilliseconds: '-1',
            signatureTimestamp: yt.session.player?.sts
          }
        },
        contentCheckOk: true,
        racyCheckOk: true
      };

      // Generate content WebPO token.
      if (integrityTokenBasedMinter) {
        extraArgs.serviceIntegrityDimensions = {
          poToken: await integrityTokenBasedMinter.mintAsWebsafeString(videoId)
        };
      }
      
      const watchEndpoint = new YTNodes.NavigationEndpoint({ watchEndpoint: { videoId } });
      const rawPlayerResponse = await watchEndpoint.call(yt.actions, extraArgs);
      const rawNextResponse = await watchEndpoint.call(yt.actions, { 
        override_endpoint: '/next',
        racyCheckOk: true, 
        contentCheckOk: true 
      });
      
      const info = new YT.VideoInfo([ rawPlayerResponse, rawNextResponse ], yt!.actions, '');

      title.textContent = info.basic_info.title || null;
      description.innerHTML = info.secondary_info?.description.toHTML() || '';
      title.textContent = info.basic_info.title || null;

      document.title = info.basic_info.title || '';

      metadata.innerHTML = '';
      metadata.innerHTML += `<div id="metadata-item">${info.primary_info?.published.toHTML()}</div>`;
      metadata.innerHTML += `<div id="metadata-item">${info.primary_info?.view_count?.short_view_count?.toHTML()}</div>`;
      metadata.innerHTML += `<div id="metadata-item">${info.basic_info.like_count} likes</div>`;

      showUI({ hidePlayer: false });

      const dash = await info.toDash();

      const uri = `data:application/dash+xml;charset=utf-8;base64,${btoa(dash)}`;

      if (player) {
        await player.destroy();
        player = undefined;
      }

      if (ui) {
        await ui.destroy();
        ui = undefined;
      }

      const videoEl = document.getElementById('videoel') as HTMLVideoElement;
      const shakaContainer = document.getElementById('shaka-container') as HTMLDivElement;

      shakaContainer
        .querySelectorAll('div')
        .forEach((node) => node.remove());

      shaka.polyfill.installAll();

      if (shaka.Player.isBrowserSupported()) {
        videoEl.poster = info.basic_info.thumbnail![0].url;

        player = new shaka.Player();
        await player.attach(videoEl);
        ui = new shaka.ui.Overlay(player, shakaContainer, videoEl);

        const config = {
          seekBarColors: {
            base: 'rgba(255,255,255,.2)',
            buffered: 'rgba(255,255,255,.4)',
            played: 'rgb(255,0,0)'
          },
          fadeDelay: 0
        };

        ui.configure(config);

        const overflowMenuButton = document.querySelector('.shaka-overflow-menu-button');
        if (overflowMenuButton) {
          overflowMenuButton.innerHTML = 'settings';
        }

        const backToOverflowButton = document.querySelector('.shaka-back-to-overflow-button .material-icons-round');
        if (backToOverflowButton) {
          backToOverflowButton.innerHTML = 'arrow_back_ios_new';
        }

        player.configure({
          streaming: {
            bufferingGoal: (info.page[0].player_config?.media_common_config.dynamic_readahead_config.max_read_ahead_media_time_ms || 0) / 1000,
            rebufferingGoal: (info.page[0].player_config?.media_common_config.dynamic_readahead_config.read_ahead_growth_rate_ms || 0) / 1000,
            bufferBehind: 300,
            autoLowLatencyMode: true
          },
          abr: {
            enabled: true,
            restrictions: {
              maxBandwidth: Number(info.page[0].player_config?.stream_selection_config.max_bitrate)
            }
          }
        });

        const networkingEngine = player.getNetworkingEngine();

        if (!networkingEngine) return;

        networkingEngine.registerRequestFilter(async (type, request) => {
          const uri = request.uris[0];
          const url = new URL(uri);
          const headers = request.headers;

          // For local development.
          if ((url.host.endsWith('.googlevideo.com') || url.href.includes('drm'))) {
            url.searchParams.set('__host', url.host);
            url.host = 'localhost';
            url.port = '8080';
            url.protocol = 'http';
          }

          if (type === shaka.net.NetworkingEngine.RequestType.SEGMENT) {
            if (url.pathname.includes('videoplayback')) {
              if (headers.Range) {
                url.searchParams.set('range', headers.Range.split('=')[1]);
                url.searchParams.set('ump', '1');
                url.searchParams.set('srfvp', '1');
                url.searchParams.set('pot', (sessionWebPo ?? BG.PoToken.generateColdStartToken(yt.session.context.client.visitorData ?? '')));
                request.headers = {};
                delete headers.Range;
              }
            }

            request.method = 'POST';
            request.body = new Uint8Array([ 120, 0 ]);
          }

          request.uris[0] = url.toString();
        });

        const RequestType = shaka.net.NetworkingEngine.RequestType;

        networkingEngine.registerResponseFilter(async (type, response) => {
          let mediaData = new Uint8Array(0);

          const handleRedirect = async (redirectData: Protos.SabrRedirect) => {
            const redirectRequest = shaka.net.NetworkingEngine.makeRequest([ redirectData.url! ], player!.getConfiguration().streaming.retryParameters);
            const requestOperation = player!.getNetworkingEngine()!.request(type, redirectRequest);
            const redirectResponse = await requestOperation.promise;

            response.data = redirectResponse.data;
            response.headers = redirectResponse.headers;
            response.uri = redirectResponse.uri;
          };

          const handleMediaData = async (data: Uint8Array) => {
            const combinedLength = mediaData.length + data.length;
            const tempMediaData = new Uint8Array(combinedLength);

            tempMediaData.set(mediaData);
            tempMediaData.set(data, mediaData.length);

            mediaData = tempMediaData;
          };

          if (type == RequestType.SEGMENT) {
            const googUmp = new GoogleVideo.UMP(new GoogleVideo.ChunkedDataBuffer([ new Uint8Array(response.data as ArrayBuffer) ]));

            let redirect: Protos.SabrRedirect | undefined;

            googUmp.parse((part) => {
              try {
                const data = part.data.chunks[0];
                switch (part.type) {
                  case 20: {
                    const mediaHeader = Protos.MediaHeader.decode(data);
                    console.info('[MediaHeader]:', mediaHeader);
                    break;
                  }
                  case 21: {
                    handleMediaData(part.data.split(1).remainingBuffer.chunks[0]);
                    break;
                  }
                  case 43: {
                    redirect = Protos.SabrRedirect.decode(data);
                    console.info('[SABRRedirect]:', redirect);
                    break;
                  }
                  case 58: {
                    const streamProtectionStatus = Protos.StreamProtectionStatus.decode(data);
                    switch (streamProtectionStatus.status) {
                      case 1:
                        console.info('[StreamProtectionStatus]: Ok');
                        break;
                      case 2:
                        console.error('[StreamProtectionStatus]: Attestation pending');
                        break;
                      case 3:
                        console.error('[StreamProtectionStatus]: Attestation required');
                        break;
                      default:
                        break;
                    }
                    break;
                  }
                }
              } catch (error) {
                console.error('An error occurred while processing the part:', error);
              }
            });

            if (redirect)
              return handleRedirect(redirect);

            if (mediaData.length)
              response.data = mediaData;
          }
        });

        try {
          await player.load(uri);
        } catch (e) {
          console.error('Could not load manifest', e);
        }
      } else {
        console.error('Browser not supported!');
      }
    } catch (error) {
      title.textContent = 'An error occurred (see console)';
      showUI({ hidePlayer: true });
      console.error(error);
    }
  });
}

function showUI(args: { hidePlayer?: boolean } = {
  hidePlayer: true
}) {
  const ytplayer = document.getElementById('shaka-container') as HTMLDivElement;

  ytplayer.style.display = args.hidePlayer ? 'none' : 'block';

  const video_container = document.getElementById('video-container') as HTMLDivElement;
  video_container.animate({ opacity: [ 0, 1 ] }, { duration: 300, easing: 'ease-in-out' });
  video_container.style.display = 'block';

  loader.style.display = 'none';
}

function hideUI() {
  const video_container = document.getElementById('video-container') as HTMLDivElement;
  video_container.style.display = 'none';
  loader.style.display = 'block';
}

main();