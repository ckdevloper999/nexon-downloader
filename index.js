const axios = require('axios');
const cheerio = require('cheerio');

// Developer: CK INFOTECH
module.exports = async (req, res) => {
  // CORS setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({
      status: false,
      developer: 'CK INFOTECH',
      message: 'Missing URL parameter. Use: /?url=https://www.instagram.com/reel/CODE/'
    });
  }

  try {
    const match = url.match(/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);

    if (!match || !match[1]) {
      return res.status(400).json({
        status: false,
        developer: 'CK INFOTECH',
        message: 'Invalid Instagram URL format.'
      });
    }

    const shortcode = match[1];
    const embedUrl = `https://www.instagram.com/reel/${shortcode}/embed/captioned/`;

    const response = await axios.get(embedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);

    let videoUrl = null;
    let thumbnailUrl = null;
    const caption = $('div.Caption').text().trim() || null;

    // Check direct video element
    const videoTag = $('video');
    if (videoTag.length) {
      videoUrl = videoTag.attr('src');
    }

    // Fallback: Parse raw JSON inside embed script tags
    if (!videoUrl) {
      const scripts = $('script').map((_, el) => $(el).html()).get();
      for (const script of scripts) {
        if (script && script.includes('video_url')) {
          const videoMatch = script.match(/"video_url":"([^"]+)"/);
          if (videoMatch && videoMatch[1]) {
            videoUrl = videoMatch[1].replace(/\\u0026/g, '&');
            break;
          }
        }
      }
    }

    // Extract thumbnail
    const imgTag = $('img.EmbeddedMediaImage');
    if (imgTag.length) {
      thumbnailUrl = imgTag.attr('src');
    }

    if (!videoUrl) {
      return res.status(404).json({
        status: false,
        developer: 'CK INFOTECH',
        message: 'Video URL not found. The post may be private, age-restricted, or blocked by Instagram.'
      });
    }

    return res.status(200).json({
      status: true,
      developer: 'CK INFOTECH',
      data: {
        shortcode,
        video_url: videoUrl,
        thumbnail: thumbnailUrl,
        caption: caption || 'No caption available'
      }
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      developer: 'CK INFOTECH',
      message: 'Failed to extract video.',
      error: error.message
    });
  }
};

