const axios = require('axios');

// Developer: CK INFOTECH
module.exports = async (req, res) => {
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
      message: 'Missing URL parameter. Example: /?url=https://www.instagram.com/reel/Cxxxxxx/'
    });
  }

  // Validate Instagram shortcode
  const match = url.match(/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  if (!match || !match[1]) {
    return res.status(400).json({
      status: false,
      developer: 'CK INFOTECH',
      message: 'Invalid Instagram URL format.'
    });
  }

  const cleanUrl = `https://www.instagram.com/reel/${match[1]}/`;

  // Engine 1: VKr public resolver
  async function tryEngine1(targetUrl) {
    try {
      const response = await axios.get(
        `https://vkrdownloader.org/server/?api_key=vkrdownloader&vkr=${encodeURIComponent(targetUrl)}`,
        { timeout: 9000 }
      );
      const data = response.data;
      if (data && data.formats && data.formats.length > 0) {
        const videoFormat =
          data.formats.find((f) => f.ext === 'mp4' || f.format_id?.includes('video')) ||
          data.formats[0];
        return {
          video_url: videoFormat.url,
          thumbnail: data.thumbnail || null,
          title: data.title || 'Instagram Reel'
        };
      }
    } catch (_) {}
    return null;
  }

  // Engine 2: Upstream proxy parser fallback
  async function tryEngine2(targetUrl) {
    try {
      const response = await axios.post(
        'https://worker.snapany.com/api/post',
        { url: targetUrl },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          },
          timeout: 9000
        }
      );
      const media = response.data?.data?.medias?.[0];
      if (media && media.url) {
        return {
          video_url: media.url,
          thumbnail: response.data?.data?.thumbnail || null,
          title: response.data?.data?.title || 'Instagram Reel'
        };
      }
    } catch (_) {}
    return null;
  }

  // Engine 3: SaveInsta direct resolver fallback
  async function tryEngine3(targetUrl) {
    try {
      const response = await axios.get(
        `https://api.vkrdownloader.com/server/?vkr=${encodeURIComponent(targetUrl)}`,
        { timeout: 9000 }
      );
      if (response.data && response.data.data?.url) {
        return {
          video_url: response.data.data.url,
          thumbnail: response.data.data.thumbnail || null,
          title: response.data.data.title || 'Instagram Reel'
        };
      }
    } catch (_) {}
    return null;
  }

  try {
    // Attempt multi-engine resolution
    const media =
      (await tryEngine1(cleanUrl)) ||
      (await tryEngine2(cleanUrl)) ||
      (await tryEngine3(cleanUrl));

    if (!media || !media.video_url) {
      return res.status(404).json({
        status: false,
        developer: 'CK INFOTECH',
        message: 'Could not fetch video. Ensure the Reel is public and accessible.'
      });
    }

    return res.status(200).json({
      status: true,
      developer: 'CK INFOTECH',
      data: {
        shortcode: match[1],
        video_url: media.video_url,
        thumbnail: media.thumbnail,
        title: media.title
      }
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      developer: 'CK INFOTECH',
      message: 'Internal server error while resolving video.',
      error: error.message
    });
  }
};
