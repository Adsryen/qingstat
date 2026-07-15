# @qingstat/tracker

Client-side page view tracking library for [Qingstat](https://github.com/Adsryen/qingstat).

_For instructions on downloading and deploying the [Qingstat server](https://github.com/Adsryen/qingstat), consult the [project README](https://github.com/Adsryen/qingstat/blob/main/README.md)._

## Usage

In your browser-based web project:

```bash
npm install @qingstat/tracker
```

Initialize Qingstat with your site ID and deployment URL:

```typescript
import * as Qingstat from "@qingstat/tracker";

Qingstat.init({
    siteId: "your-unique-site-id",
    deploymentUrl: "https://{subdomain-emitted-during-deploy}.pages.dev/",
});
```

That's it! Your page views will automatically be tracked and reported to Qingstat.

## Advanced

### Manually Track Pageviews

Alternatively you can track page view events manually.

To do so, during initialization set `autoTrackPageviews` to `false`. Then, you manually call `Qingstat.trackPageview()` when you want to record a pageview.

```typescript
import * as Qingstat from "@qingstat/tracker";

Qingstat.init({
    siteId: "your-unique-site-id",
    deploymentUrl: "https://{subdomain-emitted-during-deploy}.pages.dev/",
    autoTrackPageviews: false, // <- don't forget this
});

// ... when a pageview happens
Qingstat.trackPageview();
```
