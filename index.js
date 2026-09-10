const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'x-ig-app-id': '936619743392459',
  'x-asbd-id': '129477',
  'Sec-Fetch-Site': 'same-origin'
};

// Strategy 1: Instagram Internal Web Info API
async function fetchFromWebInfo(shortcode) {
  try {
    const res = await axios.get(
      `https://www.instagram.com/api/v1/media/web_info/?shortcode=${shortcode}`,
      { headers: HEADERS, timeout: 6000 }
    );
    const item = res.data?.items?.[0] || res.data?.data?.items?.[0];
    if (item && item.video_versions && item.video_versions.length > 0) {
      return {
        videoUrl: item.video_versions[0].url,
        thumbnailUrl: item.image_versions2?.candidates?.[0]?.url || null,
        caption: item.caption?.text || null
      };
    }
  } catch (_) {}
  return null;
}

// Strategy 2: Instagram GraphQL Query
async function fetchFromGraphQL(shortcode) {
  try {
    const url = `https://www.instagram.com/graphql/query/?query_hash=b3055c2c477942f81b7ade32d049688a&variables=${encodeURIComponent(
      JSON.stringify({ shortcode })
    )}`;
    const res = await axios.get(url, { headers: HEADERS, timeout: 6000 });
    const media = res.data?.data?.shortcode_media;
    if (media && media.is_video && media.video_url) {
      return {
        videoUrl: media.video_url,
        thumbnailUrl: media.display_url || null,
        caption: media.edge_media_to_caption?.edges?.[0]?.node?.text || null
      };
    }
  } catch (_) {}
  return null;
}

// Strategy 3: Deep Embed HTML & Script Parser
async function fetchFromEmbed(shortcode) {
  try {
    const embedUrl = `https://www.instagram.com/reel/${shortcode}/embed/captioned/`;
    const res = await axios.get(embedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 8000
    });

    const html = res.data;
    const $ = cheerio.load(html);

    let thumbnailUrl = $('meta[property="og:image"]').attr('content') || $('img.EmbeddedMediaImage').attr('src') || null;
    let caption = $('div.Caption').text().trim() || null;

    // Direct meta check
    const metaVideo = $('meta[property="og:video"]').attr('content') || $('meta[name="twitter:player:stream"]').attr('content');
    if (metaVideo) {
      return { videoUrl: metaVideo, thumbnailUrl, caption };
    }

    // Unescape unicode and slashes across all script blocks
    const rawScripts = $('script').map((_, el) => $(el).html()).get().join('\n');
    const cleaned = rawScripts
      .replace(/\\u0026/g, '&')
      .replace(/\\u003C/g, '<')
      .replace(/\\u003E/g, '>')
      .replace(/\\\//g, '/');

    // 1. Search for video_versions structure
    const videoVersionMatch = cleaned.match(/"video_versions":\s*\[\s*\{[^}]*?"url":"([^"]+)"/);
    if (videoVersionMatch && videoVersionMatch[1]) {
      return { videoUrl: videoVersionMatch[1], thumbnailUrl, caption };
    }

    // 2. Search for direct CDN MP4 links
    const mp4Matches = cleaned.match(/https:\/\/[^"\s\\]+?\.mp4[^"\s\\]*/g);
    if (mp4Matches && mp4Matches.length > 0) {
      return { videoUrl: mp4Matches[0], thumbnailUrl, caption };
    }
  } catch (_) {}
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({
      status: false,
      developer: 'CK INFOTECH',
      message: 'Missing URL parameter. Use: /?url=https://www.instagram.com/reel/CODE/'
    });
  }

  const match = url.match(/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  if (!match || !match[1]) {
    return res.status(400).json({
      status: false,
      developer: 'CK INFOTECH',
      message: 'Invalid Instagram Reel URL format.'
    });
  }

  const shortcode = match[1];

  // Try Layer 1 -> Layer 2 -> Layer 3
  const result =
    (await fetchFromWebInfo(shortcode)) ||
    (await fetchFromGraphQL(shortcode)) ||
    (await fetchFromEmbed(shortcode));

  if (!result || !result.videoUrl) {
    return res.status(404).json({
      status: false,
      developer: 'CK INFOTECH',
      message: 'Unable to extract video. The Reel might be private, restricted, or rate-limited by Instagram.'
    });
  }

  return res.status(200).json({
    status: true,
    developer: 'CK INFOTECH',
    data: {
      shortcode,
      video_url: result.videoUrl,
      thumbnail: result.thumbnailUrl,
      caption: result.caption || 'No caption available'
    }
  });
};
