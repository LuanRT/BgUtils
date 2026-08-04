Install dependencies:
```bash
npm install
cd examples
npm install
```

Then, run one of the following commands:
```bash
# Uses WAA challenge. (only some clients accept this challenge type, e.g. YouTube Music)
npx tsx index.ts
```

```bash
# Uses InnerTube attestation challenge. (this is what the official YouTube clients currently use)
npx tsx index-innertube.ts
```
