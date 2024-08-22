import { BG } from '../../../..';
import { Innertube, Proto, UniversalCache, UMP, Utils, YTNodes } from 'youtubei.js/web';

// @ts-expect-error - x
import shaka from 'shaka-player/dist/shaka-player.ui';

import 'shaka-player/dist/controls.css';

function fetchFn(input: RequestInfo | URL, init?: RequestInit) {
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

  if (input instanceof Request) {
    // @ts-expect-error - x
    input.duplex = 'half';
  }

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
}

const title = document.getElementById('title') as HTMLHeadingElement;
const description = document.getElementById('description') as HTMLDivElement;
const metadata = document.getElementById('metadata') as HTMLDivElement;
const loader = document.getElementById('loader') as HTMLDivElement;
const form = document.querySelector('form') as HTMLFormElement;

async function getPo(identity: string): Promise<string | undefined> {
  const requestKey = 'O43z0dpjhgX20SCx4KAo';

  const bgConfig = {
    fetch: fetchFn,
    globalObj: window,
    requestKey,
    identity
  };

  const challenge = await BG.Challenge.create(bgConfig);

  if (!challenge)
    throw new Error('Could not get challenge');

  if (challenge.script) {
    const script = challenge.script.find((sc) => sc !== null);
    if (script)
      new Function(script)();
  } else {
    console.warn('Unable to load VM.');
  }

  const poToken = await BG.PoToken.generate({
    program: challenge.challenge,
    globalName: challenge.globalName,
    bgConfig
  });

  if (!poToken)
    return undefined;

  return poToken;
}

async function main() {
  const oauthCreds = undefined;
  // Const oauthCreds = {
  //   Access_token: 'ya29.abcd',
  //   Refresh_token: '1//0abcd',
  //   Scope: 'https://www.googleapis.com/auth/youtube-paid-content https://www.googleapis.com/auth/youtube',
  //   Token_type: 'Bearer',
  //   Expiry_date: '2024-08-13T04:41:34.757Z'
  // };

  const visitorData = Proto.encodeVisitorData(Utils.generateRandomString(11), Math.floor(Date.now() / 1000));
  const poToken = await getPo(visitorData);

  let yt = await Innertube.create({
    po_token: poToken,
    visitor_data: visitorData,
    fetch: fetchFn,
    generate_session_locally: true,
    cache: new UniversalCache(false)
  });

  if (oauthCreds)
    await yt.session.signIn(oauthCreds);

  form.animate({ opacity: [ 0, 1 ] }, { duration: 300, easing: 'ease-in-out' });
  form.style.display = 'block';

  showUI({ hidePlayer: true });

  let player: shaka.Player | undefined;
  let ui: shaka.ui.Overlay | undefined;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (player) {
      player.destroy();
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
      if (videoIdOrURL.match(/(http|https):\/\/([\w_-]+(?:(?:\.[\w_-]+)+))([\w.,@?^=%&:/~+#-]*[\w@?^=%&/~+#-])/)) {
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

      if (yt.session.logged_in) {
        const user = await yt.account.getInfo();
        const accountItemSections = user.page.contents_memo?.getType(YTNodes.AccountItemSection);

        if (accountItemSections) {
          const accountItemSection = accountItemSections.first();
          const accountItem = accountItemSection.contents.first();
          const datasyncIdToken = `${accountItem.endpoint.payload.directSigninIdentity.effectiveObfuscatedGaiaId}||`;
          const poToken = await getPo(datasyncIdToken);

          yt = await Innertube.create({
            po_token: poToken,
            visitor_data: visitorData,
            fetch: fetchFn,
            generate_session_locally: true,
            cache: new UniversalCache(false)
          });

          await yt.session.signIn(oauthCreds);
        }
      }

      const info = await yt.getInfo(videoId);

      title.textContent = info.basic_info.title || null;
      description.innerHTML = info.secondary_info?.description.toHTML() || '';
      title.textContent = info.basic_info.title || null;

      document.title = info.basic_info.title || '';

      metadata.innerHTML = '';
      metadata.innerHTML += `<div id="metadata-item">${info.primary_info?.published.toHTML()}</div>`;
      metadata.innerHTML += `<div id="metadata-item">${info.primary_info?.view_count.toHTML()}</div>`;
      metadata.innerHTML += `<div id="metadata-item">${info.basic_info.like_count} likes</div>`;

      showUI({ hidePlayer: false });

      const dash = await info.toDash();

      const uri = `data:application/dash+xml;charset=utf-8;base64,${btoa(dash)}`;

      if (player) {
        await player.destroy();
        player = undefined;
      }

      if (ui) {
        ui.destroy();
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

        let rn = 0;

        player.getNetworkingEngine()?.registerRequestFilter((_type: unknown, request: Record<string, any>) => {
          const uri = request.uris[0];
          const url = new URL(uri);
          const headers = request.headers;

          if (url.host.endsWith('.googlevideo.com') || headers.Range) {
            url.searchParams.set('__host', url.host);
            url.host = 'localhost:8080';
            url.protocol = 'http';
          }

          request.method = 'POST';
          request.body = new Uint8Array([ 120, 0 ]);

          if (url.pathname === '/videoplayback') {
            if (headers.Range) {
              request.headers = {};
              url.searchParams.set('range', headers.Range.split('=')[1]);
              url.searchParams.set('ump', '1');
              url.searchParams.set('srfvp', '1');
              url.searchParams.set('rn', rn.toString());
              delete headers.Range;
            }

            rn += 1;
          }

          request.uris[0] = url.toString();
        });

        const RequestType = shaka.net.NetworkingEngine.RequestType;

        player.getNetworkingEngine()?.registerResponseFilter(async (type: unknown, response: Record<string, any>) => {
          let mediaData = new Uint8Array(0);

          const handleRedirect = async (redirectData: Proto.Redirect.Type) => {
            const redirectRequest = shaka.net.NetworkingEngine.makeRequest([ redirectData.url ], player!.getConfiguration().streaming.retryParameters);
            const requestOperation = player!.getNetworkingEngine()!.request(type, redirectRequest);
            const redirectResponse = await requestOperation.promise;

            response.data = redirectResponse.data;
            response.headers = redirectResponse.headers;
            response.uri = redirectResponse.uri;
          };

          const handleMediaData = async (data: Uint8Array, multipleMD: boolean) => {
            if (!multipleMD) {
              mediaData = data.slice(1); // Remove header id
            } else {
              const newData = data.slice(1);
              const combinedLength = mediaData.length + newData.length;
              const tempMediaData = new Uint8Array(combinedLength);

              tempMediaData.set(mediaData);
              tempMediaData.set(newData, mediaData.length);

              mediaData = tempMediaData;
            }
          };

          if (type == RequestType.SEGMENT) {
            const ump = new UMP(new Uint8Array(response.data));
            const umpParts = ump.parse();

            // Check if there are multiple media data parts. If so, we need to concatenate them.
            const multipleMD = umpParts.filter((part) => part.type === 21).length > 1;

            for (const part of umpParts) {
              switch (part.type) {
                case 20: {
                  const mediaHeader = Proto.decodeMHeader(part.data);
                  console.info('[MediaHeader]:', mediaHeader);
                  break;
                }
                case 21: {
                  handleMediaData(part.data, multipleMD);
                  break;
                }
                case 43: {
                  const sabrRedirect = Proto.decodeSABRRedirect(part.data);
                  console.info('[SABRRedirect]:', sabrRedirect);
                  return await handleRedirect(sabrRedirect);
                }
                case 58: {
                  const streamProtectionStatus = Proto.decodeStreamProtectionStatus(part.data);
                  switch (streamProtectionStatus.status) {
                    case 1:
                      console.info('[StreamProtectionStatus]: Good');
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
            }

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